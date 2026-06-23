# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — Market v5 (str keys trong TreeMap, u256 chỉ dùng làm số đếm)
Root cause fix: TreeMap[u256, T] có thể không hoạt động với u256 key.
Dùng str(int(market_id)) làm key thay thế.
"""
import json
from genlayer import *


class Contract(gl.Contract):
    # Dùng str key thay vì u256 key — pattern an toàn hơn
    markets_question: TreeMap[str, str]
    markets_sources: TreeMap[str, str]
    markets_deadline: TreeMap[str, str]      # lưu dạng str(int)
    markets_creator: TreeMap[str, str]
    markets_resolved: TreeMap[str, bool]
    markets_outcome: TreeMap[str, str]
    markets_reasoning: TreeMap[str, str]
    markets_resolved_at: TreeMap[str, str]   # lưu dạng str(int)
    yes_pool: TreeMap[str, str]              # lưu dạng str(int) wei
    no_pool: TreeMap[str, str]
    user_yes_stake: TreeMap[str, str]
    user_no_stake: TreeMap[str, str]
    claimed: TreeMap[str, bool]

    # Counter dùng str key trong TreeMap để tránh u256 key issue
    counters: TreeMap[str, str]    # counters["market_count"] = "0"
    registry_address: str

    def __init__(self, registry_addr: str = ""):
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
        self.counters = TreeMap()
        self.counters["market_count"] = "0"
        self.registry_address = registry_addr

    def _get_count(self) -> int:
        return int(self.counters.get("market_count", "0"))

    def _set_count(self, v: int):
        self.counters["market_count"] = str(v)

    @gl.public.write
    def create_market(
        self,
        question: str,
        sources_json: str,
        deadline_timestamp: u256,
    ) -> u256:
        # Validate deadline
        if int(deadline_timestamp) <= int(gl.block.timestamp):
            raise gl.UserError("DEADLINE_MUST_BE_FUTURE")

        # Validate sources
        try:
            sources = json.loads(sources_json)
        except Exception:
            raise gl.UserError("INVALID_SOURCES_JSON")
        if not isinstance(sources, list) or len(sources) < 2:
            raise gl.UserError("NEED_AT_LEAST_2_SOURCES")

        if len(question.strip()) < 10:
            raise gl.UserError("QUESTION_TOO_SHORT")

        # Tạo market — dùng str key
        mid = self._get_count()
        key = str(mid)

        self.markets_question[key] = question
        self.markets_sources[key] = sources_json
        self.markets_deadline[key] = str(int(deadline_timestamp))
        self.markets_creator[key] = str(gl.message.sender_account)
        self.markets_resolved[key] = False
        self.markets_outcome[key] = "UNRESOLVED"
        self.markets_reasoning[key] = ""
        self.markets_resolved_at[key] = "0"
        self.yes_pool[key] = "0"
        self.no_pool[key] = "0"

        self._set_count(mid + 1)
        return u256(mid)

    @gl.public.write
    def resolve_market(self, market_id: u256) -> None:
        count = self._get_count()
        mid = int(market_id)
        if mid >= count:
            raise gl.UserError("MARKET_NOT_FOUND")

        key = str(mid)

        if self.markets_resolved.get(key, False):
            raise gl.UserError("ALREADY_RESOLVED")

        deadline = int(self.markets_deadline.get(key, "0"))
        if int(gl.block.timestamp) < deadline:
            raise gl.UserError("DEADLINE_NOT_REACHED")

        question = self.markets_question[key]
        sources_json = self.markets_sources[key]

        try:
            sources = json.loads(sources_json)
        except Exception:
            raise gl.UserError("SOURCES_PARSE_FAILED")

        def leader_fn():
            evidence_chunks = []
            for url in sources:
                try:
                    page_text = gl.nondet.web.render(url, mode="text")
                    if page_text and len(page_text.strip()) > 50:
                        evidence_chunks.append(f"SOURCE ({url}):\n{page_text[:2500]}")
                except Exception:
                    continue

            if len(evidence_chunks) < 2:
                raise gl.UserError("INSUFFICIENT_EVIDENCE")

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
                "(both YES or both NO)."
            ),
        )

        try:
            result = json.loads(result_str)
            verdict = result["verdict"]
        except Exception:
            raise gl.UserError("LLM_RESPONSE_PARSE_FAILED")

        if verdict not in ("YES", "NO"):
            raise gl.UserError("MALFORMED_VERDICT")

        self.markets_outcome[key] = verdict
        self.markets_reasoning[key] = result.get("reasoning", "")
        self.markets_resolved[key] = True
        self.markets_resolved_at[key] = str(int(gl.block.timestamp))

    @gl.public.write
    def override_outcome(
        self, market_id: u256, new_outcome: str, new_reasoning: str, dispute_resolver: str
    ) -> None:
        key = str(int(market_id))
        if new_outcome not in ("YES", "NO"):
            raise gl.UserError("INVALID_OUTCOME")
        self.markets_outcome[key] = new_outcome
        self.markets_reasoning[key] = f"[APPEAL OVERRIDE] {new_reasoning}"

    @gl.public.view
    def get_market(self, market_id: u256) -> str:
        key = str(int(market_id))
        count = self._get_count()
        if int(market_id) >= count:
            raise gl.UserError("MARKET_NOT_FOUND")

        yes_total = int(self.yes_pool.get(key, "0"))
        no_total = int(self.no_pool.get(key, "0"))
        total = yes_total + no_total
        yes_pct = (yes_total * 100) // total if total > 0 else 50
        no_pct = 100 - yes_pct

        return json.dumps({
            "market_id": int(market_id),
            "question": self.markets_question.get(key, ""),
            "sources": json.loads(self.markets_sources.get(key, "[]")),
            "deadline": int(self.markets_deadline.get(key, "0")),
            "creator": self.markets_creator.get(key, ""),
            "resolved": self.markets_resolved.get(key, False),
            "outcome": self.markets_outcome.get(key, "UNRESOLVED"),
            "reasoning": self.markets_reasoning.get(key, ""),
            "resolved_at": int(self.markets_resolved_at.get(key, "0")),
            "yes_pool": yes_total,
            "no_pool": no_total,
            "total_pool": total,
            "yes_pct": yes_pct,
            "no_pct": no_pct,
        })

    @gl.public.view
    def get_market_count(self) -> u256:
        return u256(self._get_count())

    @gl.public.view
    def get_all_markets_summary(self) -> str:
        count = self._get_count()
        start = max(0, count - 50)
        markets = []
        for i in range(start, count):
            key = str(i)
            yes_total = int(self.yes_pool.get(key, "0"))
            no_total = int(self.no_pool.get(key, "0"))
            total = yes_total + no_total
            yes_pct = (yes_total * 100) // total if total > 0 else 50
            markets.append({
                "market_id": i,
                "question": self.markets_question.get(key, ""),
                "deadline": int(self.markets_deadline.get(key, "0")),
                "resolved": self.markets_resolved.get(key, False),
                "outcome": self.markets_outcome.get(key, "UNRESOLVED"),
                "yes_pct": yes_pct,
                "total_pool": total,
            })
        return json.dumps(markets)

    @gl.public.view
    def get_user_stake(self, market_id: u256, user_address: str) -> str:
        stake_key = f"{int(market_id)}:{user_address}"
        return json.dumps({
            "yes_stake": int(self.user_yes_stake.get(stake_key, "0")),
            "no_stake": int(self.user_no_stake.get(stake_key, "0")),
            "claimed": self.claimed.get(stake_key, False),
        })
