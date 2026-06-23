// test_treemap_overwrite.mjs — test cụ thể: TreeMap key overwrite có work không?
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client = createClient({ chain: chains.studionet, account });

// Test 1: TreeMap key overwrite
const CODE_OVERWRITE = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    data: TreeMap[str, str]

    def __init__(self):
        self.data = TreeMap()
        self.data["key"] = "initial"

    @gl.public.write
    def update(self, value: str) -> None:
        self.data["key"] = value

    @gl.public.view
    def read(self) -> str:
        return self.data.get("key", "NOT_FOUND")
`;

// Test 2: simulate create_market step-by-step, identify where exception occurs
const CODE_STEPS = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

class Contract(gl.Contract):
    f1: TreeMap[str, str]
    f2: TreeMap[str, str]
    f3: TreeMap[str, str]
    f4: TreeMap[str, str]
    f5: TreeMap[str, str]
    f6: TreeMap[str, str]
    f7: TreeMap[str, str]
    f8: TreeMap[str, str]
    f9: TreeMap[str, str]
    f10: TreeMap[str, str]
    state: TreeMap[str, str]

    def __init__(self):
        self.f1 = TreeMap()
        self.f2 = TreeMap()
        self.f3 = TreeMap()
        self.f4 = TreeMap()
        self.f5 = TreeMap()
        self.f6 = TreeMap()
        self.f7 = TreeMap()
        self.f8 = TreeMap()
        self.f9 = TreeMap()
        self.f10 = TreeMap()
        self.state = TreeMap()
        self.state["count"] = "0"

    @gl.public.write
    def create(self, q: str, src: str, deadline: u256) -> u256:
        mid = "0"
        self.f1[mid] = q
        self.f2[mid] = src
        self.f3[mid] = str(int(deadline))
        self.f4[mid] = str(gl.message.sender_account)
        self.f5[mid] = "false"
        self.f6[mid] = "UNRESOLVED"
        self.f7[mid] = ""
        self.f8[mid] = "0"
        self.f9[mid] = "0"
        self.f10[mid] = "0"
        self.state["count"] = "1"
        return u256(0)

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")

    @gl.public.view
    def get_f1(self) -> str:
        return self.f1.get("0", "NOT_FOUND")
`;

async function waitFinalized(hash) {
  process.stdout.write('  poll:');
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      const s = Object.keys(tx.contract_snapshot?.states?.finalized || {}).length;
      process.stdout.write(` DONE (states=${s}, result=${tx.result})\n`);
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function deployAndTest(name, code, writeFn, writeArgs, readFn, expectAfterWrite) {
  console.log(`\n=== ${name} ===`);
  const h = await client.deployContract({ code, args: [] });
  const dtx = await waitFinalized(h);
  const addr = dtx.contract_snapshot?.contract_address;
  console.log('addr:', addr);

  // Write
  const wh = await client.writeContract({ address: addr, functionName: writeFn, args: writeArgs, value: 0n });
  await waitFinalized(wh);

  // Read
  const v = await client.readContract({ address: addr, functionName: readFn, args: [] });
  console.log(`${readFn}() = "${v}" (expected: "${expectAfterWrite}")`);
  if (v === expectAfterWrite) console.log(`✅ ${name} PASS`);
  else console.log(`❌ ${name} FAIL — got "${v}" not "${expectAfterWrite}"`);
  return addr;
}

const now = BigInt(Math.floor(Date.now() / 1000));
const deadline = now + 600n;

(async () => {
  // Test 1: TreeMap overwrite
  await deployAndTest(
    'TreeMap Overwrite Test',
    CODE_OVERWRITE,
    'update', ['UPDATED'],
    'read', 'UPDATED',
  );

  // Test 2: Full create_market structure
  const addr2 = await deployAndTest(
    'Full Create (10 fields + overwrite)',
    CODE_STEPS,
    'create', [
      'Is this a long enough question for GenLayer testing purposes?',
      JSON.stringify(['https://en.wikipedia.org/wiki/Test', 'https://example.com/test']),
      deadline,
    ],
    'get_count', '1',
  );

  if (addr2) {
    // Also check f1 to see how far writes got
    try {
      const f1 = await client.readContract({ address: addr2, functionName: 'get_f1', args: [] });
      console.log('get_f1() =', f1, '(should be the question if step 1 persisted)');
    } catch(e) { console.log('get_f1 ERROR:', e.message.slice(0, 50)); }
  }
})().catch(e => console.error('FATAL:', e.message));
