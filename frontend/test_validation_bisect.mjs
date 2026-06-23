// test_validation_bisect.mjs — find exact line in validation that breaks write
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client  = createClient({ chain: chains.studionet, account });

const HEADER = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *`;

const BODY_SUFFIX = `
    state: TreeMap[str, str]
    data: TreeMap[str, str]

    def __init__(self):
        self.state = TreeMap()
        self.data = TreeMap()
        self.state["count"] = "0"

    def _count(self): return int(self.state.get("count", "0"))
    def _inc(self): self.state["count"] = str(self._count() + 1)

    @gl.public.view
    def get_count(self) -> str: return self.state.get("count", "NOT_FOUND")
`;

const tests = [
  {
    name: 'D1: gl.block.timestamp access, no raise',
    body: `    @gl.public.write
    def run(self, question: str, deadline: u256) -> None:
        ts = int(gl.block.timestamp)
        self.data["ts"] = str(ts)
        self._inc()`,
  },
  {
    name: 'D2: len() check only, no raise',
    body: `    @gl.public.write
    def run(self, question: str, deadline: u256) -> None:
        l = len(question)
        self.data["len"] = str(l)
        self._inc()`,
  },
  {
    name: 'D3: raise Exception in UNREACHABLE branch',
    body: `    @gl.public.write
    def run(self, question: str, deadline: u256) -> None:
        x = 0
        if x > 1:
            raise Exception("never raised")
        self.data["ok"] = "yes"
        self._inc()`,
  },
  {
    name: 'D4: raise Exception if block.timestamp check (REAL check)',
    body: `    @gl.public.write
    def run(self, question: str, deadline: u256) -> None:
        if int(deadline) <= int(gl.block.timestamp):
            raise Exception("PAST_DEADLINE")
        self.data["ok"] = "yes"
        self._inc()`,
  },
  {
    name: 'D5: raise Exception if len check (REAL check)',
    body: `    @gl.public.write
    def run(self, question: str, deadline: u256) -> None:
        if len(question) < 10:
            raise Exception("TOO_SHORT")
        self.data["ok"] = "yes"
        self._inc()`,
  },
  {
    name: 'D6: hardcoded deadline check (no gl.block.timestamp)',
    body: `    @gl.public.write
    def run(self, question: str, deadline: u256) -> None:
        if int(deadline) <= 1000000000:
            raise Exception("PAST")
        self.data["ok"] = "yes"
        self._inc()`,
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
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  for (const t of tests) {
    process.stdout.write(`\n=== ${t.name} ===\n`);
    const code = `${HEADER}

class Contract(gl.Contract):
${BODY_SUFFIX}
${t.body}
`;
    const dh = await client.deployContract({ code, args: [] });
    const dtx = await waitFinalized(dh);
    const addr = dtx.contract_snapshot?.contract_address;
    const wh = await client.writeContract({
      address: addr, functionName: 'run',
      args: ['Is this long enough for a test question?', deadline],
      value: 0n,
    });
    await waitFinalized(wh);
    const count = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
    if (count === '1') console.log(`✅ PASS: count="${count}"`);
    else console.log(`❌ FAIL: count="${count}"`);
  }
  console.log('\n=== DONE ===');
})().catch(e => console.error('FATAL:', e.message));
