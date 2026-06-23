// test_final_bisect.mjs — tìm đúng dòng gây lỗi trong create()
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client = createClient({ chain: chains.studionet, account });

const base = (body) => `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    data: TreeMap[str, str]
    state: TreeMap[str, str]

    def __init__(self):
        self.data = TreeMap()
        self.state = TreeMap()
        self.state["count"] = "0"

    @gl.public.write
    def write(self, q: str) -> None:
${body}

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")

    @gl.public.view
    def get_data(self) -> str:
        return self.data.get("0", "NOT_FOUND")
`;

const tests = [
  {
    name: 'D1: empty string value',
    body: `        self.data["0"] = ""\n        self.state["count"] = "1"`,
  },
  {
    name: 'D2: sender_account',
    body: `        self.data["0"] = str(gl.message.sender_account)\n        self.state["count"] = "1"`,
  },
  {
    name: 'D3: sender_address (correct attr?)',
    body: `        self.data["0"] = str(gl.message.sender_address)\n        self.state["count"] = "1"`,
  },
  {
    name: 'D4: normal str write + overwrite only',
    body: `        self.data["0"] = q\n        self.state["count"] = "1"`,
  },
  {
    name: 'D5: many str writes, no sender, no empty str',
    body: `        self.data["0"] = q\n        self.data["1"] = "false"\n        self.data["2"] = "UNRESOLVED"\n        self.data["3"] = "0"\n        self.state["count"] = "1"`,
  },
];

async function waitFinalized(hash) {
  process.stdout.write(' poll:');
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') {
      process.stdout.write(` DONE\n`);
      return tx;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

(async () => {
  for (const t of tests) {
    const code = base(t.body);
    process.stdout.write(`\n=== ${t.name} ===\n`);
    try {
      const dh = await client.deployContract({ code, args: [] });
      const dtx = await waitFinalized(dh);
      const addr = dtx.contract_snapshot?.contract_address;

      const wh = await client.writeContract({ address: addr, functionName: 'write', args: ['test question'], value: 0n });
      await waitFinalized(wh);

      const count = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
      const data  = await client.readContract({ address: addr, functionName: 'get_data',  args: [] });

      if (count === '1') console.log(`✅ PASS: count="${count}", data="${data.slice(0,30)}"`);
      else console.log(`❌ FAIL: count="${count}", data="${data}"`);
    } catch(e) {
      console.log(`💥 ERROR: ${e.message.slice(0, 80)}`);
    }
  }
  console.log('\n=== DONE ===');
})().catch(e => console.error('FATAL:', e.message));
