// bisect_runner.mjs — deploy và test từng file bisect theo thứ tự
import { createClient, createAccount, chains } from 'genlayer-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PRIVATE_KEY = '0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a';
const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: chains.studionet, account });

async function waitFinalized(hash, label) {
  process.stdout.write(`  [WAIT] ${label}: `);
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      const snap = tx.contract_snapshot;
      const addr = snap?.contract_address;
      const statesKeys = Object.keys(snap?.states?.finalized || {});
      console.log(` FINALIZED | result=${tx.result} | states_keys=${statesKeys.length}`);
      return { addr, result: tx.result, statesEmpty: statesKeys.length === 0 };
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function deployAndTest(filename, readFn = 'read_method', args = [], writeTest = null) {
  const code = readFileSync(resolve(ROOT, 'contracts', filename), 'utf8');
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📦 [${filename}] (${code.length} bytes)`);

  const deployHash = await client.deployContract({ code, args: [] });
  const { addr, statesEmpty } = await waitFinalized(deployHash, 'deploy');
  
  if (!addr) { console.log('  ❌ No contract address'); return null; }

  // Test read
  try {
    const val = await client.readContract({ address: addr, functionName: readFn, args });
    console.log(`  ✅ ${readFn}() = ${JSON.stringify(val)}`);
  } catch(e) {
    console.log(`  ❌ ${readFn}() FAIL: ${e.message.slice(0, 80)}`);
    return null;
  }

  // Optional write test
  if (writeTest) {
    const { fn, args: wArgs } = writeTest;
    try {
      const writeHash = await client.writeContract({ address: addr, functionName: fn, args: wArgs, value: 0n });
      const { result } = await waitFinalized(writeHash, `${fn}`);
      const count = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
      if (Number(count) > 0) {
        console.log(`  ✅ ${fn}() SUCCESS → count=${count}`);
      } else {
        console.log(`  ❌ ${fn}() FAIL — count still 0 (result=${result})`);
      }
    } catch(e) {
      console.log(`  ❌ ${fn}() THROW: ${e.message.slice(0, 100)}`);
    }
  }

  return addr;
}

const now = BigInt(Math.floor(Date.now() / 1000));
const deadline = now + 600n; // 10 phút

(async () => {
  console.log('=== BISECT RUNNER ===');
  console.log('Timestamp now:', now.toString(), '| Deadline:', deadline.toString());

  // Step 0: Official baseline
  await deployAndTest('test_minimal.py', 'read_method', []);

  // Step 1: u256 scalar field
  await deployAndTest('bisect_01_u256_scalar.py', 'get_count', []);

  // Step 2: TreeMap[str,str] + write + u256 counter
  await deployAndTest('bisect_02_treemap_str.py', 'get_count', [], {
    fn: 'add_market',
    args: ['Is this test question long enough for GenLayer?', deadline],
  });

  // Step 3: deadline + resolved fields + deadline check
  await deployAndTest('bisect_03_deadline_bool.py', 'get_count', [], {
    fn: 'add_market',
    args: ['Is this test question long enough for GenLayer?', deadline],
  });

  console.log('\n=== BISECT DONE ===');
})().catch(e => console.error('FATAL:', e.message));
