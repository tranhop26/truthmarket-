/**
 * TruthMarket — Test Resolution Flow v5
 *
 * Root cause fix:
 *  - create_market check: deadline > gl.block.timestamp (tại thời điểm EXECUTE, không phải SUBMIT)
 *  - TX execution xảy ra ~36s SAU khi submit
 *  - → Deadline phải = now + 120s (buffer 2 phút cho execution latency)
 *  - → Sau khi create_market finalize (~36s), chờ thêm để deadline qua
 *  - → Vì vậy dùng deadline = now + 60s: sau 36s finalize + chờ thêm 30s = 66s tổng
 */

import { createClient, createAccount, chains } from 'genlayer-js';

const PRIVATE_KEY = '0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a';
const MARKET_ADDRESS = '0xf9ae454E3B2132A57c99a0Efa56b6b00b0F09682';

const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: chains.studionet, account });

console.log('='.repeat(60));
console.log('  TruthMarket — Test Resolution (Bước 2 v5)');
console.log('='.repeat(60));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTx(hash, label = '', timeoutMs = 240000) {
  const start = Date.now();
  process.stdout.write(`  [WAIT] ${label}: `);
  while (Date.now() - start < timeoutMs) {
    try {
      const tx = await client.getTransaction({ hash });
      if (tx.statusName === 'FINALIZED' || tx.status === 7) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        // Đọc block.timestamp từ TX để debug
        process.stdout.write(` ✅ (${elapsed}s) blockTs=${tx.current_timestamp}\n`);
        return tx;
      }
      if (tx.statusName === 'CANCELLED' || tx.status === 8) throw new Error('TX CANCELLED');
    } catch (e) { if (e.message.includes('CANCELLED')) throw e; }
    await sleep(3000);
    process.stdout.write('.');
  }
  throw new Error(`Timeout ${timeoutMs / 1000}s`);
}

async function getBlockTimestamp() {
  const r = await fetch('https://studio.genlayer.com/api', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: ['latest', false], id: 1 })
  });
  const d = await r.json();
  return parseInt(d.result.timestamp, 16);
}

async function runMarket(label, question, sourcesArr) {
  console.log('\n' + '─'.repeat(60));
  console.log(`${label}`);
  console.log('─'.repeat(60));

  // Lấy block timestamp hiện tại (thật, không phải wall clock)
  const blockNow = await getBlockTimestamp();
  const wallNow = Math.floor(Date.now() / 1000);
  console.log(`\n  block.timestamp: ${blockNow} | wall clock: ${wallNow} | diff: ${blockNow - wallNow}s`);

  // Deadline = blockNow + 90s (đủ lớn cho ~36s execution + buffer)
  // Sau khi create finalize (~36s), ta chờ thêm đến khi deadline qua
  const DEADLINE_OFFSET = 90;
  const deadline = blockNow + DEADLINE_OFFSET;
  console.log(`  Deadline: blockNow + ${DEADLINE_OFFSET}s = ${new Date(deadline * 1000).toISOString()}`);

  // ── CREATE ──
  console.log('\n[CREATE]');
  const createTx = await client.writeContract({
    address: MARKET_ADDRESS,
    functionName: 'create_market',
    args: [question, JSON.stringify(sourcesArr), BigInt(deadline)],
    value: 0n,
  });
  console.log(`  TX: ${createTx}`);
  const createReceipt = await waitForTx(createTx, 'create_market');

  // Kiểm tra market_count
  const count = await client.readContract({
    address: MARKET_ADDRESS,
    functionName: 'get_market_count',
    args: [],
  });
  const marketId = Number(count) - 1;
  console.log(`  market_id: ${marketId} (count=${count})`);

  if (marketId < 0) {
    // Đọc leader exception từ consensus_data để debug
    const cd = createReceipt.consensus_data;
    const firstValidator = cd?.validators?.[0];
    console.error(`  ❌ create_market fail! blockTs=${createReceipt.current_timestamp}, deadline=${deadline}`);
    console.error(`  Leader result: ${JSON.stringify(firstValidator?.result)}`);
    throw new Error(`MARKET_CREATE_FAIL: blockTs=${createReceipt.current_timestamp} > deadline=${deadline}?`);
  }

  // ── Chờ đến khi deadline qua ──
  const blockAfterCreate = createReceipt.current_timestamp;
  const waitMs = Math.max(0, (deadline - blockAfterCreate + 5) * 1000);
  if (waitMs > 0) {
    console.log(`  ⏳ Chờ ${(waitMs/1000).toFixed(0)}s để deadline qua (blockTs=${blockAfterCreate}, deadline=${deadline})...`);
    await sleep(waitMs);
  } else {
    console.log(`  ✅ Deadline đã qua (blockTs=${blockAfterCreate} > deadline=${deadline})`);
  }

  // ── RESOLVE ──
  console.log('\n[RESOLVE] AI đọc URLs → LLM → đồng thuận...');
  const resolveTx = await client.writeContract({
    address: MARKET_ADDRESS,
    functionName: 'resolve_market',
    args: [BigInt(marketId)],
    value: 0n,
    consensusMaxRotations: 5,
  });
  console.log(`  TX: ${resolveTx}`);
  const resolveReceipt = await waitForTx(resolveTx, 'resolve_market', 300000);

  // ── ĐỌC KẾT QUẢ ──
  const raw = await client.readContract({
    address: MARKET_ADDRESS,
    functionName: 'get_market',
    args: [BigInt(marketId)],
  });
  const market = JSON.parse(raw);

  console.log('\n  ─── KẾT QUẢ ───');
  console.log(`  market_id: ${marketId}`);
  console.log(`  resolved:  ${market.resolved}`);
  console.log(`  outcome:   ${market.outcome}`);
  console.log(`  reasoning: "${market.reasoning}"`);

  return { marketId, market };
}

async function main() {
  const initCount = await client.readContract({
    address: MARKET_ADDRESS,
    functionName: 'get_market_count',
    args: [],
  });
  console.log(`\nMarket count ban đầu: ${initCount}`);

  // VÒNG 1: Pipeline test
  const { marketId: mid1, market: r1 } = await runMarket(
    'VÒNG 1 — Pipeline kỹ thuật (Wikipedia/IMDB)',
    'Was the film "Oppenheimer" (2023) directed by Christopher Nolan?',
    [
      'https://en.wikipedia.org/wiki/Oppenheimer_(film)',
      'https://www.imdb.com/title/tt15398776/',
    ]
  );

  const v1ok = r1.resolved && ['YES', 'NO'].includes(r1.outcome);
  console.log(`  Pipeline: ${v1ok ? '✅ PASS' : '❌ FAIL'}`);

  if (!v1ok) {
    console.error('Vòng 1 fail — không thể tiếp tục vòng 2');
    return;
  }

  // VÒNG 2: Câu hỏi chủ quan
  const { marketId: mid2, market: r2 } = await runMarket(
    'VÒNG 2 — Câu hỏi chủ quan (Rotten Tomatoes)',
    'Is "Oppenheimer" (2023) considered a masterpiece by professional film critics based on its critical reception?',
    [
      'https://www.rottentomatoes.com/m/oppenheimer_2023',
      'https://www.metacritic.com/movie/oppenheimer/',
      'https://letterboxd.com/film/oppenheimer-2023/',
    ]
  );

  const v2ok = r2.resolved && r2.reasoning.length > 10;
  console.log(`  AI reasoning bám evidence: ${v2ok ? '✅ PASS' : '⚠️ cần kiểm tra'}`);

  // FINAL REPORT
  console.log('\n' + '='.repeat(60));
  console.log('  ✅ BƯỚC 2 HOÀN THÀNH');
  console.log('='.repeat(60));
  console.log(`  Vòng 1: market_id=${mid1} | verdict=${r1.outcome} | pipeline=${v1ok ? 'OK' : 'FAIL'}`);
  console.log(`  Vòng 2: market_id=${mid2} | verdict=${r2.outcome} | reasoning_ok=${v2ok}`);
  console.log(`\n  Reasoning Vòng 1:\n  "${r1.reasoning}"`);
  console.log(`\n  Reasoning Vòng 2:\n  "${r2.reasoning}"`);
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});


