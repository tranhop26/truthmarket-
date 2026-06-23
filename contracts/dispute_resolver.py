# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — DisputeResolver v8
Safe patterns: no json.loads/isinstance in write pre-checks, raise Exception.
"""
import json
from genlayer import *


class Contract(gl.Contract):
    dispute_initiator:        TreeMap[str, str]
    dispute_bond:             TreeMap[str, str]
    dispute_extra_sources:    TreeMap[str, str]
    dispute_raised_at:        TreeMap[str, str]
    dispute_original_outcome: TreeMap[str, str]
    dispute_active:           TreeMap[str, str]   # "true" / "false"
    dispute_resolved:         TreeMap[str, str]   # "true" / "false"
    config:                   TreeMap[str, str]

    def __init__(
        self,
        market_contract_addr: str,
        dispute_window_hours: u256,
        min_bond_amount: u256,
    ):
        self.dispute_initiator        = TreeMap()
        self.dispute_bond             = TreeMap()
        self.dispute_extra_sources    = TreeMap()
        self.dispute_raised_at        = TreeMap()
        self.dispute_original_outcome = TreeMap()
        self.dispute_active           = TreeMap()
        self.dispute_resolved         = TreeMap()
        self.config                   = TreeMap()
        self.config["market_addr"]  = market_contract_addr
        self.config["window_hours"] = str(int(dispute_window_hours))
        self.config["min_bond"]     = str(int(min_bond_amount))
        self.config["owner"]        = str(gl.message.sender_address)

    # ── RAISE DISPUTE ──────────────────────────────────────────────────────

    @gl.public.write.payable
    def raise_dispute(
        self,
        market_id: u256,
        original_outcome: str,
        extra_sources_json: str,
    ) -> None:
        mid = str(int(market_id))
        if int(gl.message.value) < int(self.config.get("min_bond", "0")):
            raise Exception("INSUFFICIENT_BOND")
        if self.dispute_active.get(mid, "false") == "true":
            raise Exception("DISPUTE_ALREADY_ACTIVE")
        if len(extra_sources_json) < 5:
            raise Exception("EXTRA_SOURCES_REQUIRED")

        self.dispute_active[mid]           = "true"
        self.dispute_initiator[mid]        = str(gl.message.sender_address)
        self.dispute_bond[mid]             = str(int(gl.message.value))
        self.dispute_extra_sources[mid]    = extra_sources_json
        self.dispute_raised_at[mid]        = "0"
        self.dispute_resolved[mid]         = "false"
        self.dispute_original_outcome[mid] = original_outcome

    # ── FINAL RESOLVE ──────────────────────────────────────────────────────

    @gl.public.write
    def final_resolve(
        self,
        market_id: u256,
        original_question: str,
        original_sources_json: str,
    ) -> None:
        mid = str(int(market_id))
        if self.dispute_active.get(mid, "false") != "true":
            raise Exception("NO_ACTIVE_DISPUTE")
        if self.dispute_resolved.get(mid, "false") == "true":
            raise Exception("DISPUTE_ALREADY_RESOLVED")

        raised_at      = int(self.dispute_raised_at.get(mid, "0"))
        window_seconds = int(self.config.get("window_hours", "2")) * 3600
        

        original_outcome = self.dispute_original_outcome.get(mid, "")
        extra_json       = self.dispute_extra_sources.get(mid, "[]")

        # json.loads inside leader_fn (nondet) context is safe
        def leader_fn():
            original_sources = json.loads(original_sources_json)
            extra_sources    = json.loads(extra_json)
            all_sources      = original_sources + extra_sources
            evidence_chunks  = []
            for url in all_sources:
                try:
                    page_text = gl.nondet.web.render(url, mode="text")
                    if page_text and len(page_text) > 50:
                        evidence_chunks.append(f"SOURCE ({url}):\n{page_text[:2000]}")
                except Exception:
                    continue
            if len(evidence_chunks) < 2:
                raise Exception("INSUFFICIENT_EVIDENCE")
            combined = "\n\n---\n\n".join(evidence_chunks)
            prompt = f"""You are an appeal judge for a prediction market.
The ORIGINAL verdict was: {original_outcome}
Your task: determine the CORRECT verdict (YES or NO) based on ALL evidence.

QUESTION: {original_question}

EVIDENCE:
{combined}

Respond ONLY with valid JSON:
{{"verdict": "YES" or "NO", "confidence": 0.0-1.0, "reasoning": "brief explanation"}}"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(raw, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            leader_fn,
            principle=(
                "Two results are equivalent if they have the same 'verdict' value. "
                "Differences in confidence or reasoning are acceptable."
            ),
        )

        result  = json.loads(result_str)
        verdict = result.get("verdict", "")
        if verdict not in ("YES", "NO"):
            raise Exception("MALFORMED_VERDICT")

        self.dispute_resolved[mid] = "true"

        if verdict != original_outcome:
            market_addr = self.config.get("market_addr", "")
            if market_addr:
                market_contract = gl.get_contract_at(Address(market_addr))
                reasoning = result.get("reasoning", "Appeal overturned original verdict")
                market_contract.override_outcome(
                    market_id,
                    verdict,
                    reasoning,
                    str(gl.message.sender_address),
                )

            initiator = self.dispute_initiator.get(mid, "")
            bond      = int(self.dispute_bond.get(mid, "0"))
            if initiator and bond > 0:
                Address(initiator).transfer(bond)

    # ── VIEW ───────────────────────────────────────────────────────────────

    @gl.public.view
    def get_dispute(self, market_id: u256) -> str:
        mid = str(int(market_id))
        return json.dumps({
            "active":           self.dispute_active.get(mid, "false") == "true",
            "resolved":         self.dispute_resolved.get(mid, "false") == "true",
            "initiator":        self.dispute_initiator.get(mid, ""),
            "bond":             int(self.dispute_bond.get(mid, "0")),
            "raised_at":        int(self.dispute_raised_at.get(mid, "0")),
            "original_outcome": self.dispute_original_outcome.get(mid, ""),
        })

    @gl.public.view
    def get_config(self) -> str:
        return json.dumps({
            "market_addr":  self.config.get("market_addr", ""),
            "window_hours": int(self.config.get("window_hours", "2")),
            "min_bond":     int(self.config.get("min_bond", "0")),
            "owner":        self.config.get("owner", ""),
        })

