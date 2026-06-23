# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — Market Contract v8

Bisection-confirmed safe patterns:
1. TreeMap[str, str] only — no bool/u256 values
2. Counters via state TreeMap — no u256 scalar fields
3. gl.message.sender_address — not sender_account
4. No json.loads/isinstance/strip in write functions — not supported in GenVM
5. raise Exception("...") — not gl.UserError
"""
import json
from genlayer import *


class Contract(gl.Contract):
    markets_question:    TreeMap[str, str]
    markets_sources:     TreeMap[str, str]
    markets_deadline:    TreeMap[str, str]
    markets_creator:     TreeMap[str, str]
    markets_resolved:    TreeMap[str, str]   # "true" / "false"
    markets_outcome:     TreeMap[str, str]   # "YES" / "NO" / "UNRESOLVED"
    markets_reasoning:   TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]

    yes_pool:       TreeMap[str, str]
    no_pool:        TreeMap[str, str]
    user_yes_stake: TreeMap[str, str]
    user_no_stake:  TreeMap[str, str]
    claimed:        TreeMap[str, str]

    state: TreeMap[str, str]   # count, registry_address

    def __init__(self, registry_addr: str = ""):
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
        self.user_yes_stake      = TreeMap()
        self.user_no_stake       = TreeMap()
        self.claimed             = TreeMap()
        self.state               = TreeMap()
        self.state["market_count"]     = "0"
        self.state["registry_address"] = registry_addr

    def _count(self) -> int:
        return int(self.state.get("market_count", "0"))

    def _inc(self):
        self.state["market_count"] = str(self._count() + 1)

    # ── CREATE ─────────────────────────────────────────────────────────────

    @gl.public.write
    def create_market(
        self,
        question: str,
        sources_json: str,
        deadline_timestamp: u256,
    ) -> u256:
        # Simple validation — no json.loads/isinstance (not GenVM-safe)
        if int(deadline_timestamp) <= int(gl.block.timestamp):
            raise Exception("DEADLINE_MUST_BE_FUTURE")
        if len(question) < 10:
            raise Exception("QUESTION_TOO_SHORT")
        if len(sources_json) < 10:
            raise Exception("SOURCES_REQUIRED")

        mid = str(self._count())
        self.markets_question[mid]    = question
        self.markets_sources[mid]     = sources_json
        self.markets_deadline[mid]    = str(int(deadline_timestamp))
        self.markets_creator[mid]     = str(gl.message.sender_address)
        self.markets_resolved[mid]    = "false"
        self.markets_outcome[mid]     = "UNRESOLVED"
        self.markets_reasoning[mid]   = ""
        self.markets_resolved_at[mid] = "0"
        self.yes_pool[mid]            = "0"
        self.no_pool[mid]             = "0"
        self._inc()
        return u256(int(mid))

    # ── STAKE ──────────────────────────────────────────────────────────────

    @gl.public.write.payable
    def place_stake(self, market_id: u256, side: bool) -> None:
        if gl.message.value == 0:
            raise Exception("STAKE_MUST_BE_NONZERO")
        mid = str(int(market_id))
        if int(market_id) >= self._count():
            raise Exception("MARKET_NOT_FOUND")
        if self.markets_resolved.get(mid, "false") == "true":
            raise Exception("MARKET_ALREADY_RESOLVED")
        if int(gl.block.timestamp) >= int(self.markets_deadline.get(mid, "0")):
            raise Exception("MARKET_DEADLINE_PASSED")

        sender    = str(gl.message.sender_address)
        amount    = int(gl.message.value)
        stake_key = f"{mid}:{sender}"

        if side:
            prev = int(self.user_yes_stake.get(stake_key, "0"))
            self.user_yes_stake[stake_key] = str(prev + amount)
            self.yes_pool[mid] = str(int(self.yes_pool.get(mid, "0")) + amount)
        else:
            prev = int(self.user_no_stake.get(stake_key, "0"))
            self.user_no_stake[stake_key] = str(prev + amount)
            self.no_pool[mid] = str(int(self.no_pool.get(mid, "0")) + amount)

    # ── RESOLVE ────────────────────────────────────────────────────────────

    @gl.public.write
    def resolve_market(self, market_id: u256) -> None:
        mid = str(int(market_id))
        if int(market_id) >= self._count():
            raise Exception("MARKET_NOT_FOUND")
        if self.markets_resolved.get(mid, "false") == "true":
            raise Exception("ALREADY_RESOLVED")
        if int(gl.block.timestamp) < int(self.markets_deadline.get(mid, "0")):
            raise Exception("DEADLINE_NOT_REACHED")

        question     = self.markets_question[mid]
        sources_json = self.markets_sources[mid]
        # json.loads inside nondet context (leader_fn) is safe
        def leader_fn():
            sources = json.loads(sources_json)
            evidence_chunks = []
            for url in sources:
                try:
                    page_text = gl.nondet.web.render(url, mode="text")
                    if page_text and len(page_text) > 50:
                        evidence_chunks.append(f"SOURCE ({url}):\n{page_text[:2500]}")
                except Exception:
                    continue
            if len(evidence_chunks) < 2:
                raise Exception("INSUFFICIENT_EVIDENCE")
            combined = "\n\n---\n\n".join(evidence_chunks)
            prompt = f"""You are a neutral AI judge for a prediction market.
Determine YES or NO for this question based ONLY on the evidence below.

QUESTION: {question}

EVIDENCE:
{combined}

Respond ONLY with valid JSON:
{{"verdict": "YES" or "NO", "confidence": 0.0-1.0, "reasoning": "brief summary"}}"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(raw, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            leader_fn,
            principle=(
                "Two results are equivalent if they have the same 'verdict' value "
                "(both YES or both NO). Differences in confidence or reasoning are acceptable."
            ),
        )
        result  = json.loads(result_str)
        verdict = result.get("verdict", "")
        if verdict not in ("YES", "NO"):
            raise Exception("MALFORMED_VERDICT")

        self.markets_outcome[mid]     = verdict
        self.markets_reasoning[mid]   = result.get("reasoning", "")
        self.markets_resolved[mid]    = "true"
        self.markets_resolved_at[mid] = str(int(gl.block.timestamp))

    # ── OVERRIDE ───────────────────────────────────────────────────────────

    @gl.public.write
    def override_outcome(
        self, market_id: u256, new_outcome: str, new_reasoning: str, dispute_resolver: str
    ) -> None:
        mid = str(int(market_id))
        if new_outcome not in ("YES", "NO"):
            raise Exception("INVALID_OUTCOME")
        self.markets_outcome[mid]   = new_outcome
        self.markets_reasoning[mid] = f"[APPEAL OVERRIDE] {new_reasoning}"

    # ── CLAIM ──────────────────────────────────────────────────────────────

    @gl.public.write
    def claim_payout(self, market_id: u256) -> None:
        mid = str(int(market_id))
        if int(market_id) >= self._count():
            raise Exception("MARKET_NOT_FOUND")
        if self.markets_resolved.get(mid, "false") != "true":
            raise Exception("MARKET_NOT_RESOLVED_YET")

        sender    = str(gl.message.sender_address)
        claim_key = f"{mid}:{sender}"
        if self.claimed.get(claim_key, "false") == "true":
            raise Exception("ALREADY_CLAIMED")

        verdict   = self.markets_outcome[mid]
        yes_total = int(self.yes_pool.get(mid, "0"))
        no_total  = int(self.no_pool.get(mid, "0"))
        total     = yes_total + no_total
        user_yes  = int(self.user_yes_stake.get(claim_key, "0"))
        user_no   = int(self.user_no_stake.get(claim_key, "0"))
        payout    = 0

        if verdict == "YES":
            if user_yes == 0:
                raise Exception("NO_WINNING_STAKE")
            payout = user_yes if no_total == 0 else (user_yes * total) // yes_total
        elif verdict == "NO":
            if user_no == 0:
                raise Exception("NO_WINNING_STAKE")
            payout = user_no if yes_total == 0 else (user_no * total) // no_total
        else:
            raise Exception("MARKET_UNRESOLVED")

        if payout == 0:
            raise Exception("ZERO_PAYOUT")

        self.claimed[claim_key] = "true"
        gl.message.sender_address.transfer(payout)

    # ── VIEW ───────────────────────────────────────────────────────────────

    @gl.public.view
    def get_market_count(self) -> u256:
        return u256(self._count())

    @gl.public.view
    def get_market(self, market_id: u256) -> str:
        mid = str(int(market_id))
        if int(market_id) >= self._count():
            raise Exception("MARKET_NOT_FOUND")
        yes_t   = int(self.yes_pool.get(mid, "0"))
        no_t    = int(self.no_pool.get(mid, "0"))
        total   = yes_t + no_t
        yes_pct = (yes_t * 100) // total if total > 0 else 50
        return json.dumps({
            "market_id":   int(market_id),
            "question":    self.markets_question.get(mid, ""),
            "sources":     self.markets_sources.get(mid, "[]"),
            "deadline":    int(self.markets_deadline.get(mid, "0")),
            "creator":     self.markets_creator.get(mid, ""),
            "resolved":    self.markets_resolved.get(mid, "false") == "true",
            "outcome":     self.markets_outcome.get(mid, "UNRESOLVED"),
            "reasoning":   self.markets_reasoning.get(mid, ""),
            "resolved_at": int(self.markets_resolved_at.get(mid, "0")),
            "yes_pool":    yes_t,
            "no_pool":     no_t,
            "total_pool":  total,
            "yes_pct":     yes_pct,
            "no_pct":      100 - yes_pct,
        })

    @gl.public.view
    def get_user_stake(self, market_id: u256, user_address: str) -> str:
        stake_key = f"{int(market_id)}:{user_address}"
        return json.dumps({
            "yes_stake": int(self.user_yes_stake.get(stake_key, "0")),
            "no_stake":  int(self.user_no_stake.get(stake_key, "0")),
            "claimed":   self.claimed.get(stake_key, "false") == "true",
        })

    @gl.public.view
    def get_all_markets_summary(self) -> str:
        count = self._count()
        start = max(0, count - 50)
        markets = []
        for i in range(start, count):
            mid     = str(i)
            yes_t   = int(self.yes_pool.get(mid, "0"))
            no_t    = int(self.no_pool.get(mid, "0"))
            total   = yes_t + no_t
            yes_pct = (yes_t * 100) // total if total > 0 else 50
            markets.append({
                "market_id":  i,
                "question":   self.markets_question.get(mid, ""),
                "deadline":   int(self.markets_deadline.get(mid, "0")),
                "resolved":   self.markets_resolved.get(mid, "false") == "true",
                "outcome":    self.markets_outcome.get(mid, "UNRESOLVED"),
                "yes_pct":    yes_pct,
                "total_pool": total,
            })
        return json.dumps(markets)
