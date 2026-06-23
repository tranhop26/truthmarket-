// test_no_validation.mjs — test create_market không có validation logic
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client = createClient({ chain: chains.studionet, account });

// Exact same 11-field structure as market.py, but create_market has ZERO validation
const CODE = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class Contract(gl.Contract):
    markets_question:    TreeMap[str, str]
    markets_sources:     TreeMap[str, str]
    markets_deadline:    TreeMap[str, str]
    markets_creator:     TreeMap[str, str]
    markets_resolved:    TreeMap[str, str]
    markets_outcome:     TreeMap[str, str]
    markets_reasoning:   TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]
    yes_pool:            TreeMap[str, str]
    no_pool:             TreeMap[str, str]
    state:               TreeMap[str, str]

    def __init__(self):
        self.markets_question    = TreeMap()
        self.markets_sources     = TreeMap()
        self.markets_deadline    = TreeMap()
        self.markets_creator     = TreeMap()
        self.markets_resolved    = TreeMap()
        self.markets_outcome     = TreeMap()
        self.markets_reasoning   = TreeMap()
        self.markets_resolved_at = TreeMap()
        self.yes_pool            = TreeMap()
        self.no_pool             = TreeMap()
        self.state               = TreeMap()
        self.state["count"] = "0"

    def _count(self):
        return int(self.state.get("count", "0"))

    def _inc(self):
        self.state["count"] = str(self._count() + 1)

    @gl.public.write
    def create_market(self, question: str, sources_json: str, deadline: u256) -> u256:
        mid = str(self._count())
        self.markets_question[mid]    = question
        self.markets_sources[mid]     = sources_json
        self.markets_deadline[mid]    = str(int(deadline))
        self.markets_creator[mid]     = str(gl.message.sender_address)
        self.markets_resolved[mid]    = "false"
        self.markets_outcome[mid]     = "UNRESOLVED"
        self.markets_reasoning[mid]   = ""
        self.markets_resolved_at[mid] = "0"
        self.yes_pool[mid]            = "0"
        self.no_pool[mid]             = "0"
        self._inc()
        return u256(int(mid))

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")

    @gl.public.view
    def get_question(self, mid: str) -> str:
        return self.markets_question.get(mid, "NOT_FOUND")

    @gl.public.view
    def get_creator(self, mid: str) -> str:
        return self.markets_creator.get(mid, "NOT_FOUND")

    @gl.public.view
    def get_resolved(self, mid: str) -> str:
        return self.markets_resolved.get(mid, "NOT_FOUND")
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

(async () => {
  console.log('=== No-Validation create_market ===');
  const dh = await client.deployContract({ code: CODE, args: [] });
  const dtx = await waitFinalized(dh);
  const addr = dtx.contract_snapshot?.contract_address;
  console.log('addr:', addr);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const wh = await client.writeContract({
    address: addr,
    functionName: 'create_market',
    args: [
      'Is this a test question that is definitely long enough?',
      '["https://en.wikipedia.org/wiki/Test","https://example.com"]',
      deadline,
    ],
    value: 0n,
  });
  await waitFinalized(wh);

  const count    = await client.readContract({ address: addr, functionName: 'get_count',    args: [] });
  const question = await client.readContract({ address: addr, functionName: 'get_question', args: ['0'] });
  const creator  = await client.readContract({ address: addr, functionName: 'get_creator',  args: ['0'] });
  const resolved = await client.readContract({ address: addr, functionName: 'get_resolved', args: ['0'] });

  console.log('count:   ', count);
  console.log('question:', question.slice(0, 40));
  console.log('creator: ', creator.slice(0, 30));
  console.log('resolved:', resolved);

  if (count === '1') console.log('\n✅✅✅ create_market PASS — root cause was validation logic!');
  else console.log('\n❌ Still failing — writes themselves have another issue.');
})().catch(e => console.error('FATAL:', e.message));
