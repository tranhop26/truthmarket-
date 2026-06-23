// test_isolate.mjs — isolate: nhiều fields vs u256 param
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client = createClient({ chain: chains.studionet, account });

// TEST A: 11 fields, KHÔNG có u256 param
const CODE_A = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

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
    def create(self, q: str, src: str) -> None:
        mid = "0"
        self.f1[mid] = q
        self.f2[mid] = src
        self.f3[mid] = "1782207785"
        self.f4[mid] = str(gl.message.sender_account)
        self.f5[mid] = "false"
        self.f6[mid] = "UNRESOLVED"
        self.f7[mid] = ""
        self.f8[mid] = "0"
        self.f9[mid] = "0"
        self.f10[mid] = "0"
        self.state["count"] = "1"

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")

    @gl.public.view
    def get_f1(self) -> str:
        return self.f1.get("0", "NOT_FOUND")
`;

// TEST B: 1 field, CÓ u256 param
const CODE_B = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    state: TreeMap[str, str]

    def __init__(self):
        self.state = TreeMap()
        self.state["count"] = "0"

    @gl.public.write
    def create(self, q: str, deadline: u256) -> u256:
        self.state["count"] = "1"
        self.state["q"] = q
        self.state["deadline"] = str(int(deadline))
        return u256(1)

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")
`;

// TEST C: 11 fields, simple write (just update count)
const CODE_C = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

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
    def inc(self) -> None:
        self.state["count"] = "1"

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")
`;

async function waitFinalized(hash) {
  process.stdout.write(' poll:');
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

async function run(name, code, writeFn, writeArgs) {
  console.log(`\n=== ${name} ===`);
  const dh = await client.deployContract({ code, args: [] });
  const dtx = await waitFinalized(dh);
  const addr = dtx.contract_snapshot?.contract_address;
  console.log('addr:', addr);

  const wh = await client.writeContract({ address: addr, functionName: writeFn, args: writeArgs, value: 0n });
  await waitFinalized(wh);

  const count = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
  if (count === '1') console.log(`✅ PASS: count="${count}"`);
  else console.log(`❌ FAIL: count="${count}" (expected "1")`);

  // Check f1 if it exists
  try {
    const f1 = await client.readContract({ address: addr, functionName: 'get_f1', args: [] });
    console.log(`get_f1: "${f1}"`);
  } catch(e) { /* no get_f1 */ }
}

const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

(async () => {
  await run('A: 11 fields, NO u256 param', CODE_A, 'create', [
    'Is this a long enough question for GenLayer?',
    JSON.stringify(['https://en.wikipedia.org/wiki/Test', 'https://example.com']),
  ]);

  await run('B: 1 field, WITH u256 param + return u256', CODE_B, 'create', [
    'Is this a long enough question for GenLayer?',
    deadline,
  ]);

  await run('C: 11 fields, simple inc() — no args', CODE_C, 'inc', []);
})().catch(e => console.error('FATAL:', e.message));
