// test_type_evidence.mjs — re-test u256 scalar + bool-in-TreeMap với evidence rõ ràng
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client  = createClient({ chain: chains.studionet, account });

const H = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *`;

// Test 1: u256 scalar field — does it persist after write?
const CODE_U256 = `${H}

class Contract(gl.Contract):
    counter: u256
    name: str

    def __init__(self):
        self.counter = u256(0)
        self.name = "init"

    @gl.public.write
    def increment(self) -> None:
        self.counter = u256(int(self.counter) + 1)
        self.name = "incremented"

    @gl.public.view
    def get_counter(self) -> u256:
        return self.counter

    @gl.public.view
    def get_name(self) -> str:
        return self.name
`;

// Test 2: bool in TreeMap value — does __init__ succeed?
const CODE_BOOL_TREEMAP = `${H}

class Contract(gl.Contract):
    flags: TreeMap[str, bool]
    counter: str

    def __init__(self):
        self.flags = TreeMap()
        self.flags["active"] = True
        self.counter = "0"

    @gl.public.write
    def set_flag(self, key: str, val: bool) -> None:
        self.flags[key] = val
        self.counter = str(int(self.counter) + 1)

    @gl.public.view
    def get_flag(self, key: str) -> bool:
        return self.flags.get(key, False)

    @gl.public.view
    def get_counter(self) -> str:
        return self.counter
`;

// Test 3: bool as standalone field (not in TreeMap)
const CODE_BOOL_FIELD = `${H}

class Contract(gl.Contract):
    active: bool
    counter: str

    def __init__(self):
        self.active = True
        self.counter = "0"

    @gl.public.write
    def toggle(self) -> None:
        self.active = not self.active
        self.counter = str(int(self.counter) + 1)

    @gl.public.view
    def is_active(self) -> bool:
        return self.active

    @gl.public.view
    def get_counter(self) -> str:
        return self.counter
`;

async function waitFinalized(hash) {
  process.stdout.write(' poll:');
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      const states = tx.contract_snapshot?.states?.finalized || {};
      const stateCount = Object.keys(states).length;
      const result = tx.contract_snapshot?.result;
      process.stdout.write(` DONE(states=${stateCount}, result=${JSON.stringify(result)?.slice(0,30)})\n`);
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function testU256() {
  console.log('\n=== TEST 1: u256 scalar field persistence ===');
  const dh = await client.deployContract({ code: CODE_U256, args: [] });
  const dtx = await waitFinalized(dh);
  const addr = dtx.contract_snapshot?.contract_address;
  console.log('addr:', addr);

  // Read BEFORE write
  const c0 = await client.readContract({ address: addr, functionName: 'get_counter', args: [] });
  const n0 = await client.readContract({ address: addr, functionName: 'get_name', args: [] });
  console.log(`Before write: counter=${c0}, name=${n0}`);

  // Write
  const wh = await client.writeContract({ address: addr, functionName: 'increment', args: [], value: 0n });
  await waitFinalized(wh);

  // Read AFTER write
  const c1 = await client.readContract({ address: addr, functionName: 'get_counter', args: [] });
  const n1 = await client.readContract({ address: addr, functionName: 'get_name', args: [] });
  console.log(`After write: counter=${c1}, name=${n1}`);

  if (String(c1) === '1') console.log('✅ u256 scalar PERSISTS');
  else console.log(`❌ u256 scalar DOES NOT persist (counter=${c1})`);
  if (n1 === 'incremented') console.log('✅ str scalar PERSISTS');
  else console.log(`❌ str scalar issue (name=${n1})`);
}

async function testBoolTreeMap() {
  console.log('\n=== TEST 2: bool in TreeMap[str,bool] ===');
  try {
    const dh = await client.deployContract({ code: CODE_BOOL_TREEMAP, args: [] });
    const dtx = await waitFinalized(dh);
    const addr = dtx.contract_snapshot?.contract_address;
    if (!addr) { console.log('❌ Deploy FAIL: contract_address is null (init crash)'); return; }
    console.log('addr:', addr);

    const c0 = await client.readContract({ address: addr, functionName: 'get_counter', args: [] });
    console.log('Before write: counter=', c0);

    const wh = await client.writeContract({
      address: addr, functionName: 'set_flag', args: ['test', true], value: 0n
    });
    await waitFinalized(wh);

    const flag = await client.readContract({ address: addr, functionName: 'get_flag', args: ['test'] });
    const c1   = await client.readContract({ address: addr, functionName: 'get_counter', args: [] });
    console.log(`After write: flag=${flag}, counter=${c1}`);
    if (c1 === '1') console.log('✅ bool in TreeMap WORKS');
    else console.log(`❌ bool in TreeMap FAILS (counter=${c1})`);
  } catch(e) {
    console.log('❌ CRASH:', e.message.slice(0,100));
  }
}

async function testBoolField() {
  console.log('\n=== TEST 3: bool as standalone field ===');
  try {
    const dh = await client.deployContract({ code: CODE_BOOL_FIELD, args: [] });
    const dtx = await waitFinalized(dh);
    const addr = dtx.contract_snapshot?.contract_address;
    if (!addr) { console.log('❌ Deploy FAIL: contract_address is null (init crash)'); return; }
    console.log('addr:', addr);

    const a0 = await client.readContract({ address: addr, functionName: 'is_active', args: [] });
    console.log('Before write: active=', a0);

    const wh = await client.writeContract({ address: addr, functionName: 'toggle', args: [], value: 0n });
    await waitFinalized(wh);

    const a1 = await client.readContract({ address: addr, functionName: 'is_active', args: [] });
    const c1 = await client.readContract({ address: addr, functionName: 'get_counter', args: [] });
    console.log(`After write: active=${a1}, counter=${c1}`);
    if (c1 === '1') console.log('✅ bool standalone field WORKS');
    else console.log(`❌ bool standalone field FAILS (counter=${c1})`);
  } catch(e) {
    console.log('❌ CRASH:', e.message.slice(0,100));
  }
}

(async () => {
  await testU256();
  await testBoolTreeMap();
  await testBoolField();
  console.log('\n=== DONE ===');
})().catch(e => console.error('FATAL:', e.message));
