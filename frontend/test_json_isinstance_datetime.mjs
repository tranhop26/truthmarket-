// test_json_isinstance_datetime.mjs — test json.loads/isinstance trong write + datetime attrs
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client  = createClient({ chain: chains.studionet, account });

const H = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *`;

const COMMON_BODY = (writeBody) => `${H}

class Contract(gl.Contract):
    state: TreeMap[str, str]

    def __init__(self):
        self.state = TreeMap()
        self.state["count"] = "0"

    @gl.public.write
    def run(self, data: str) -> None:
${writeBody}

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")

    @gl.public.view
    def get_val(self) -> str:
        return self.state.get("val", "NOT_FOUND")
`;

const tests = [
  {
    name: 'E1: json.loads on str arg in write',
    body: `        parsed = json.loads(data)
        self.state["val"] = str(type(parsed).__name__)
        self.state["count"] = "1"`,
  },
  {
    name: 'E2: isinstance check on memory object in write',
    body: `        parsed = json.loads(data)
        ok = isinstance(parsed, list)
        self.state["val"] = "yes" if ok else "no"
        self.state["count"] = "1"`,
  },
  {
    name: 'E3: gl.message.datetime (does it exist?)',
    body: `        try:
            ts = str(gl.message.datetime)
            self.state["val"] = ts
        except Exception as e:
            self.state["val"] = "ERROR:" + str(e)[:50]
        self.state["count"] = "1"`,
  },
  {
    name: 'E4: gl.message.timestamp (alt name?)',
    body: `        try:
            ts = str(gl.message.timestamp)
            self.state["val"] = ts
        except Exception as e:
            self.state["val"] = "ERROR:" + str(e)[:50]
        self.state["count"] = "1"`,
  },
  {
    name: 'E5: dir(gl.message) — list all attrs',
    body: `        attrs = str([a for a in dir(gl.message) if not a.startswith("_")])
        self.state["val"] = attrs[:200]
        self.state["count"] = "1"`,
  },
  {
    name: 'E6: json.loads + isinstance in validation (full pattern)',
    body: `        try:
            sources = json.loads(data)
        except Exception:
            self.state["val"] = "PARSE_FAIL"
            return
        if not isinstance(sources, list) or len(sources) < 2:
            self.state["val"] = "VALIDATION_FAIL"
            return
        self.state["val"] = "OK_len=" + str(len(sources))
        self.state["count"] = "1"`,
  },
];

async function waitFinalized(hash) {
  process.stdout.write(' poll:');
  while (true) {
    const tx = await client.getTransaction({ hash });
    if (tx.statusName === 'FINALIZED') { process.stdout.write(` DONE\n`); return tx; }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

(async () => {
  const args_json = JSON.stringify(['https://example.com', 'https://example.org']);

  for (const t of tests) {
    process.stdout.write(`\n=== ${t.name} ===\n`);
    const code = COMMON_BODY(t.body);
    try {
      const dh = await client.deployContract({ code, args: [] });
      const dtx = await waitFinalized(dh);
      const addr = dtx.contract_snapshot?.contract_address;
      if (!addr) { console.log('❌ Deploy FAIL — init crash'); continue; }

      const wh = await client.writeContract({
        address: addr, functionName: 'run', args: [args_json], value: 0n,
      });
      await waitFinalized(wh);

      const count = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
      const val   = await client.readContract({ address: addr, functionName: 'get_val',   args: [] });
      console.log(`count=${count}, val="${val}"`);
      if (count === '1') console.log('✅ PASS');
      else console.log('❌ FAIL');
    } catch(e) {
      console.log('💥 ERROR:', e.message.slice(0, 100));
    }
  }
  console.log('\n=== DONE ===');
})().catch(e => console.error('FATAL:', e.message));
