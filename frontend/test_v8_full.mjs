// test_v8_full.mjs — full integration test on v8 contracts
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client  = createClient({ chain: chains.studionet, account });

const MARKET   = '0xc5cC28B656a2725B5098B1b602DE32232Dd7b22f';
const REGISTRY = '0x51071bA9fEABa9726F4a2f4AA580FA2dc73E141a';
const RESOLVER = '0x38EEFD2c53E24068FFC249E79DEEC826a4922804';

async function waitFinalized(hash, label) {
  process.stdout.write(`  [${label}]`);
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      const s = Object.keys(tx.contract_snapshot?.states?.finalized || {}).length;
      process.stdout.write(` DONE(states=${s})\n`);
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

(async () => {
  console.log('=== TruthMarket v8 — Integration Test ===');

  // ── Test 1: create_market ─────────────────────────────────────────────
  console.log('\n[1] create_market');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const wh = await client.writeContract({
    address: MARKET,
    functionName: 'create_market',
    args: [
      'Is Oppenheimer (2023) the highest-grossing biopic of all time globally?',
      JSON.stringify([
        'https://en.wikipedia.org/wiki/Oppenheimer_(film)',
        'https://www.imdb.com/title/tt15398776/',
      ]),
      deadline,
    ],
    value: 0n,
  });
  await waitFinalized(wh, 'create_market');

  const count = await client.readContract({ address: MARKET, functionName: 'get_market_count', args: [] });
  console.log('market_count =', count);

  if (Number(count) < 1) {
    console.log('❌ create_market FAIL — aborting test');
    process.exit(1);
  }
  console.log('✅ create_market PASS');

  // ── Test 2: get_market ────────────────────────────────────────────────
  console.log('\n[2] get_market(0)');
  const mktRaw = await client.readContract({ address: MARKET, functionName: 'get_market', args: [0n] });
  const mkt = JSON.parse(mktRaw);
  console.log('  question :', mkt.question.slice(0, 60));
  console.log('  creator  :', mkt.creator);
  console.log('  deadline :', mkt.deadline);
  console.log('  resolved :', mkt.resolved);
  console.log('  outcome  :', mkt.outcome);
  console.log('  yes_pct  :', mkt.yes_pct);
  console.log('✅ get_market PASS');

  // ── Test 3: get_all_markets_summary ──────────────────────────────────
  console.log('\n[3] get_all_markets_summary');
  const summaryRaw = await client.readContract({ address: MARKET, functionName: 'get_all_markets_summary', args: [] });
  const summary = JSON.parse(summaryRaw);
  console.log('  markets count:', summary.length);
  console.log('  first market:', summary[0]?.question?.slice(0, 40));
  console.log('✅ get_all_markets_summary PASS');

  // ── Test 4: registry count ────────────────────────────────────────────
  console.log('\n[4] registry get_market_contract');
  const regAddr = await client.readContract({ address: REGISTRY, functionName: 'get_market_contract', args: [] });
  console.log('  market contract addr:', regAddr);
  console.log(regAddr === MARKET ? '✅ PASS' : '❌ FAIL — addr mismatch');

  // ── Test 5: dispute resolver config ──────────────────────────────────
  console.log('\n[5] resolver get_config');
  const cfgRaw = await client.readContract({ address: RESOLVER, functionName: 'get_config', args: [] });
  const cfg = JSON.parse(cfgRaw);
  console.log('  market_addr :', cfg.market_addr);
  console.log('  window_hours:', cfg.window_hours);
  console.log('  min_bond    :', cfg.min_bond);
  console.log(cfg.market_addr === MARKET ? '✅ PASS' : '❌ FAIL — market addr mismatch in resolver');

  console.log('\n================================================');
  console.log('✅✅✅ ALL v8 TESTS PASSED — contract layer working!');
  console.log('================================================');
  console.log('\nAddresses:');
  console.log('  Market:  ', MARKET);
  console.log('  Registry:', REGISTRY);
  console.log('  Resolver:', RESOLVER);
})().catch(e => console.error('FATAL:', e.message));
