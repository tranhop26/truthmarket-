// test_import_json.mjs — isolate: import json vs extra fields vs validation
import { createClient, createAccount, chains } from 'genlayer-js';

const account = createAccount('0x5e431e6f241491d5a66a2e464571fb18733ed8acc1bdb3100bd210973ea0a05a');
const client  = createClient({ chain: chains.studionet, account });

const HEADER = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`;

// BASELINE: 11 fields, no json import, no validation (KNOWN PASS)
const BASE = `${HEADER}
from genlayer import *

class Contract(gl.Contract):
    markets_question: TreeMap[str, str]
    markets_sources: TreeMap[str, str]
    markets_deadline: TreeMap[str, str]
    markets_creator: TreeMap[str, str]
    markets_resolved: TreeMap[str, str]
    markets_outcome: TreeMap[str, str]
    markets_reasoning: TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]
    yes_pool: TreeMap[str, str]
    no_pool: TreeMap[str, str]
    state: TreeMap[str, str]

    def __init__(self):
        self.markets_question = TreeMap()
        self.markets_sources = TreeMap()
        self.markets_deadline = TreeMap()
        self.markets_creator = TreeMap()
        self.markets_resolved = TreeMap()
        self.markets_outcome = TreeMap()
        self.markets_reasoning = TreeMap()
        self.markets_resolved_at = TreeMap()
        self.yes_pool = TreeMap()
        self.no_pool = TreeMap()
        self.state = TreeMap()
        self.state["count"] = "0"

    def _count(self):
        return int(self.state.get("count", "0"))
    def _inc(self):
        self.state["count"] = str(self._count() + 1)

    @gl.public.write
    def create_market(self, question: str, sources_json: str, deadline: u256) -> u256:
        mid = str(self._count())
        self.markets_question[mid] = question
        self.markets_sources[mid] = sources_json
        self.markets_deadline[mid] = str(int(deadline))
        self.markets_creator[mid] = str(gl.message.sender_address)
        self.markets_resolved[mid] = "false"
        self.markets_outcome[mid] = "UNRESOLVED"
        self.markets_reasoning[mid] = ""
        self.markets_resolved_at[mid] = "0"
        self.yes_pool[mid] = "0"
        self.no_pool[mid] = "0"
        self._inc()
        return u256(int(mid))

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")
`;

// TEST A: add "import json" — does import json break write?
const TEST_A = `${HEADER}
import json
from genlayer import *

class Contract(gl.Contract):
    markets_question: TreeMap[str, str]
    markets_sources: TreeMap[str, str]
    markets_deadline: TreeMap[str, str]
    markets_creator: TreeMap[str, str]
    markets_resolved: TreeMap[str, str]
    markets_outcome: TreeMap[str, str]
    markets_reasoning: TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]
    yes_pool: TreeMap[str, str]
    no_pool: TreeMap[str, str]
    state: TreeMap[str, str]

    def __init__(self):
        self.markets_question = TreeMap()
        self.markets_sources = TreeMap()
        self.markets_deadline = TreeMap()
        self.markets_creator = TreeMap()
        self.markets_resolved = TreeMap()
        self.markets_outcome = TreeMap()
        self.markets_reasoning = TreeMap()
        self.markets_resolved_at = TreeMap()
        self.yes_pool = TreeMap()
        self.no_pool = TreeMap()
        self.state = TreeMap()
        self.state["count"] = "0"

    def _count(self):
        return int(self.state.get("count", "0"))
    def _inc(self):
        self.state["count"] = str(self._count() + 1)

    @gl.public.write
    def create_market(self, question: str, sources_json: str, deadline: u256) -> u256:
        mid = str(self._count())
        self.markets_question[mid] = question
        self.markets_sources[mid] = sources_json
        self.markets_deadline[mid] = str(int(deadline))
        self.markets_creator[mid] = str(gl.message.sender_address)
        self.markets_resolved[mid] = "false"
        self.markets_outcome[mid] = "UNRESOLVED"
        self.markets_reasoning[mid] = ""
        self.markets_resolved_at[mid] = "0"
        self.yes_pool[mid] = "0"
        self.no_pool[mid] = "0"
        self._inc()
        return u256(int(mid))

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")
`;

// TEST B: +3 extra fields (user_yes_stake, user_no_stake, claimed), no json
const TEST_B = `${HEADER}
from genlayer import *

class Contract(gl.Contract):
    markets_question: TreeMap[str, str]
    markets_sources: TreeMap[str, str]
    markets_deadline: TreeMap[str, str]
    markets_creator: TreeMap[str, str]
    markets_resolved: TreeMap[str, str]
    markets_outcome: TreeMap[str, str]
    markets_reasoning: TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]
    yes_pool: TreeMap[str, str]
    no_pool: TreeMap[str, str]
    user_yes_stake: TreeMap[str, str]
    user_no_stake: TreeMap[str, str]
    claimed: TreeMap[str, str]
    state: TreeMap[str, str]

    def __init__(self):
        self.markets_question = TreeMap()
        self.markets_sources = TreeMap()
        self.markets_deadline = TreeMap()
        self.markets_creator = TreeMap()
        self.markets_resolved = TreeMap()
        self.markets_outcome = TreeMap()
        self.markets_reasoning = TreeMap()
        self.markets_resolved_at = TreeMap()
        self.yes_pool = TreeMap()
        self.no_pool = TreeMap()
        self.user_yes_stake = TreeMap()
        self.user_no_stake = TreeMap()
        self.claimed = TreeMap()
        self.state = TreeMap()
        self.state["count"] = "0"

    def _count(self):
        return int(self.state.get("count", "0"))
    def _inc(self):
        self.state["count"] = str(self._count() + 1)

    @gl.public.write
    def create_market(self, question: str, sources_json: str, deadline: u256) -> u256:
        mid = str(self._count())
        self.markets_question[mid] = question
        self.markets_sources[mid] = sources_json
        self.markets_deadline[mid] = str(int(deadline))
        self.markets_creator[mid] = str(gl.message.sender_address)
        self.markets_resolved[mid] = "false"
        self.markets_outcome[mid] = "UNRESOLVED"
        self.markets_reasoning[mid] = ""
        self.markets_resolved_at[mid] = "0"
        self.yes_pool[mid] = "0"
        self.no_pool[mid] = "0"
        self._inc()
        return u256(int(mid))

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")
`;

// TEST C: + validation (int/len/raise only, no json, 11 fields)
const TEST_C = `${HEADER}
from genlayer import *

class Contract(gl.Contract):
    markets_question: TreeMap[str, str]
    markets_sources: TreeMap[str, str]
    markets_deadline: TreeMap[str, str]
    markets_creator: TreeMap[str, str]
    markets_resolved: TreeMap[str, str]
    markets_outcome: TreeMap[str, str]
    markets_reasoning: TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]
    yes_pool: TreeMap[str, str]
    no_pool: TreeMap[str, str]
    state: TreeMap[str, str]

    def __init__(self):
        self.markets_question = TreeMap()
        self.markets_sources = TreeMap()
        self.markets_deadline = TreeMap()
        self.markets_creator = TreeMap()
        self.markets_resolved = TreeMap()
        self.markets_outcome = TreeMap()
        self.markets_reasoning = TreeMap()
        self.markets_resolved_at = TreeMap()
        self.yes_pool = TreeMap()
        self.no_pool = TreeMap()
        self.state = TreeMap()
        self.state["count"] = "0"

    def _count(self):
        return int(self.state.get("count", "0"))
    def _inc(self):
        self.state["count"] = str(self._count() + 1)

    @gl.public.write
    def create_market(self, question: str, sources_json: str, deadline: u256) -> u256:
        if int(deadline) <= int(gl.block.timestamp):
            raise Exception("DEADLINE_MUST_BE_FUTURE")
        if len(question) < 10:
            raise Exception("QUESTION_TOO_SHORT")
        mid = str(self._count())
        self.markets_question[mid] = question
        self.markets_sources[mid] = sources_json
        self.markets_deadline[mid] = str(int(deadline))
        self.markets_creator[mid] = str(gl.message.sender_address)
        self.markets_resolved[mid] = "false"
        self.markets_outcome[mid] = "UNRESOLVED"
        self.markets_reasoning[mid] = ""
        self.markets_resolved_at[mid] = "0"
        self.yes_pool[mid] = "0"
        self.no_pool[mid] = "0"
        self._inc()
        return u256(int(mid))

    @gl.public.view
    def get_count(self) -> str:
        return self.state.get("count", "NOT_FOUND")
`;

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

async function run(name, code) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const dh = await client.deployContract({ code, args: [] });
  const dtx = await waitFinalized(dh);
  const addr = dtx.contract_snapshot?.contract_address;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const wh = await client.writeContract({
    address: addr,
    functionName: 'create_market',
    args: ['Is this long enough for a test question yes?', '["https://example.com","https://example.org"]', deadline],
    value: 0n,
  });
  await waitFinalized(wh);
  const count = await client.readContract({ address: addr, functionName: 'get_count', args: [] });
  if (count === '1') console.log(`✅ PASS: count="${count}"`);
  else console.log(`❌ FAIL: count="${count}"`);
}

(async () => {
  // Baseline should always pass
  await run('BASELINE (11 fields, no json, no validation)', BASE);
  await run('A: +import json only', TEST_A);
  await run('B: +3 extra fields (14 total), no json', TEST_B);
  await run('C: +validation (int/len/raise), no json, 11 fields', TEST_C);
  console.log('\n=== DONE ===');
})().catch(e => console.error('FATAL:', e.message));
