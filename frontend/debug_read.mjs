// debug_read.mjs — xác định vấn đề readContract sau write
import { createClient, createAccount, chains } from 'genlayer-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PRIVATE_KEY = '0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a';
const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: chains.studionet, account });

async function waitFinalized(hash) {
  process.stdout.write('  poll: ');
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      process.stdout.write(' DONE\n');
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function rawCall(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const resp = await fetch('https://studio.genlayer.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return resp.json();
}

(async () => {
  // 1) Deploy bisect_02
  const code = readFileSync(resolve(ROOT, 'contracts', 'bisect_02_treemap_str.py'), 'utf8');
  console.log('=== Deploy bisect_02_treemap_str.py ===');
  const deployHash = await client.deployContract({ code, args: [] });
  const deployTx = await waitFinalized(deployHash);
  const addr = deployTx.contract_snapshot?.contract_address;
  console.log('addr:', addr);
  console.log('deploy states.finalized keys:', Object.keys(deployTx.contract_snapshot?.states?.finalized || {}));

  // 2) Write: add_market
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  console.log('\n=== write: add_market ===');
  console.log('deadline:', deadline.toString());
  const writeHash = await client.writeContract({
    address: addr,
    functionName: 'add_market',
    args: ['Is this a test question that is long enough for GenLayer?', deadline],
    value: 0n,
  });
  const writeTx = await waitFinalized(writeHash);
  const stateAfter = writeTx.contract_snapshot?.states?.finalized || {};
  console.log('write result:', writeTx.result);
  console.log('write states.finalized FULL DUMP:');
  console.log(JSON.stringify(stateAfter, null, 2));

  // 3) readContract (genlayer-js)
  console.log('\n=== readContract get_count ===');
  try {
    const v = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
    console.log('readContract result:', v, typeof v);
  } catch(e) {
    console.log('readContract ERROR:', e.message.slice(0, 100));
  }

  // 4) Raw JSON-RPC gen_call
  console.log('\n=== raw gen_call get_count ===');
  const callResp = await rawCall('gen_call', {
    to: addr,
    data: { function: 'get_count', args: [] },
    value: 0,
    from: account.address,
    state_type: 'finalized',  // try 'finalized' explicitly
  });
  console.log('gen_call result:', JSON.stringify(callResp).slice(0, 200));

  // 5) Read với delay để tránh race condition
  console.log('\n=== readContract lại sau 5s delay ===');
  await new Promise(r => setTimeout(r, 5000));
  try {
    const v2 = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
    console.log('readContract (delayed) result:', v2);
  } catch(e) {
    console.log('readContract (delayed) ERROR:', e.message.slice(0, 100));
  }

  // 6) Deploy bisect_03b (no bool)
  console.log('\n=== Deploy bisect_03b_no_bool.py ===');
  const code03b = readFileSync(resolve(ROOT, 'contracts', 'bisect_03b_no_bool.py'), 'utf8');
  const deployHash03b = await client.deployContract({ code: code03b, args: [] });
  const deployTx03b = await waitFinalized(deployHash03b);
  const addr03b = deployTx03b.contract_snapshot?.contract_address;
  console.log('addr:', addr03b);

  try {
    const cnt = await client.readContract({ address: addr03b, functionName: 'get_count', args: [] });
    console.log('get_count =', cnt, '(deploy OK)');

    // Write test
    const deadline03b = BigInt(Math.floor(Date.now() / 1000) + 600);
    const wHash03b = await client.writeContract({
      address: addr03b,
      functionName: 'add_market',
      args: ['Is this test question long enough?', deadline03b],
      value: 0n,
    });
    const wTx03b = await waitFinalized(wHash03b);
    console.log('write result:', wTx03b.result);
    console.log('write states.finalized keys:', Object.keys(wTx03b.contract_snapshot?.states?.finalized || {}));
    const cnt2 = await client.readContract({ address: addr03b, functionName: 'get_count', args: [] });
    console.log('get_count after write =', cnt2);
    if (Number(cnt2) > 0) console.log('✅ bisect_03b WRITE SUCCESS!');
    else console.log('❌ bisect_03b write still 0');
  } catch(e) {
    console.log('03b ERROR:', e.message.slice(0, 100));
  }

})().catch(e => console.error('FATAL:', e.message));
