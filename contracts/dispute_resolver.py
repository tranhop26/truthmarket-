# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — DisputeResolver Contract (Appeal/Escalation)

Contract xử lý kháng nghị (appeal) khi người dùng không đồng ý với phán quyết AI.

Flow:
1. Sau khi Market.resolve_market() chạy xong → mở cửa sổ kháng nghị (X giờ)
2. Người khiếu nại gọi raise_dispute() kèm bond đặt cọc (chống spam)
3. Sau window kháng nghị, gọi final_resolve() → AI chạy lại với:
   - Nhiều nguồn hơn (nguồn bổ sung do người dispute cung cấp)
   - Principle nghiêm ngặt hơn trong eq_principle.prompt_comparative
4. Nếu kết quả appeal ≠ kết quả gốc → gọi Market.override_outcome(), trả bond lại
5. Nếu kết quả appeal = kết quả gốc → mất bond (chống spam dispute)
"""

import json
from genlayer import *


class Contract(gl.Contract):
    # Địa chỉ Market contract
    market_contract_address: str

    # Thông tin dispute của từng market
    # key = market_id
    dispute_active: TreeMap[u256, bool]
    dispute_initiator: TreeMap[u256, str]         # người raise_dispute
    dispute_bond: TreeMap[u256, u256]             # số tiền đặt cọc
    dispute_extra_sources: TreeMap[u256, str]     # JSON-encoded list[str] URLs bổ sung
    dispute_raised_at: TreeMap[u256, u256]        # timestamp khi raise
    dispute_resolved: TreeMap[u256, bool]         # đã final_resolve chưa
    dispute_original_outcome: TreeMap[u256, str]  # outcome gốc trước khi dispute

    # Cấu hình
    dispute_window_hours: u256                    # cửa sổ kháng nghị (giờ)
    min_bond_amount: u256                         # bond tối thiểu (wei)
    owner: str

    def __init__(
        self,
        market_contract_addr: str,
        dispute_window_hours: u256,
        min_bond_amount: u256,
    ):
        self.market_contract_address = market_contract_addr
        self.dispute_window_hours = dispute_window_hours
        self.min_bond_amount = min_bond_amount
        self.owner = str(gl.message.sender_account)
        self.dispute_active = TreeMap()
        self.dispute_initiator = TreeMap()
        self.dispute_bond = TreeMap()
        self.dispute_extra_sources = TreeMap()
        self.dispute_raised_at = TreeMap()
        self.dispute_resolved = TreeMap()
        self.dispute_original_outcome = TreeMap()

    # =========================================================
    #  KHÁNG NGHỊ
    # =========================================================

    @gl.public.write.payable
    def raise_dispute(
        self,
        market_id: u256,
        extra_sources_json: str,
        original_outcome: str,
    ) -> None:
        """
        Nộp đơn kháng nghị phán quyết của Market.

        Args:
            market_id: ID của market muốn kháng nghị
            extra_sources_json: JSON-encoded list URLs bổ sung (tối thiểu 1 URL mới)
            original_outcome: Phán quyết gốc mà người dùng không đồng ý ("YES" hoặc "NO")
        """
        # Validate bond
        if gl.message.value < int(self.min_bond_amount):
            raise gl.UserError("BOND_TOO_LOW")

        # Validate chưa có dispute đang mở
        if self.dispute_active.get(market_id, False):
            raise gl.UserError("DISPUTE_ALREADY_ACTIVE")

        # Validate outcome hợp lệ
        if original_outcome not in ("YES", "NO"):
            raise gl.UserError("INVALID_ORIGINAL_OUTCOME")

        # Validate extra sources
        try:
            extra_sources = json.loads(extra_sources_json)
            if not isinstance(extra_sources, list) or len(extra_sources) < 1:
                raise gl.UserError("NEED_AT_LEAST_1_EXTRA_SOURCE")
        except (json.JSONDecodeError, TypeError):
            raise gl.UserError("INVALID_EXTRA_SOURCES_JSON")

        # Ghi nhận dispute
        self.dispute_active[market_id] = True
        self.dispute_initiator[market_id] = str(gl.message.sender_account)
        self.dispute_bond[market_id] = gl.message.value
        self.dispute_extra_sources[market_id] = extra_sources_json
        self.dispute_raised_at[market_id] = u256(int(gl.block.timestamp))
        self.dispute_resolved[market_id] = False
        self.dispute_original_outcome[market_id] = original_outcome

    # =========================================================
    #  FINAL RESOLUTION (AI chạy lại với principle nghiêm ngặt hơn)
    # =========================================================

    @gl.public.write
    def final_resolve(
        self,
        market_id: u256,
        original_question: str,
        original_sources_json: str,
    ) -> None:
        """
        Chạy lại resolution với nguồn bổ sung và tiêu chuẩn nghiêm ngặt hơn.

        Kết quả binding cuối cùng — nếu khác phán quyết gốc sẽ override Market.
        """
        if not self.dispute_active.get(market_id, False):
            raise gl.UserError("NO_ACTIVE_DISPUTE")

        if self.dispute_resolved.get(market_id, False):
            raise gl.UserError("DISPUTE_ALREADY_RESOLVED")

        # Validate cửa sổ kháng nghị đã đóng (tối thiểu phải qua dispute_window_hours)
        raised_at = int(self.dispute_raised_at[market_id])
        window_seconds = int(self.dispute_window_hours) * 3600
        if int(gl.block.timestamp) < raised_at + window_seconds:
            raise gl.UserError("DISPUTE_WINDOW_STILL_OPEN")

        original_outcome = self.dispute_original_outcome[market_id]
        extra_sources_json = self.dispute_extra_sources[market_id]

        try:
            original_sources = json.loads(original_sources_json)
            extra_sources = json.loads(extra_sources_json)
            all_sources = original_sources + extra_sources
        except Exception:
            raise gl.UserError("SOURCES_PARSE_FAILED")

        # --- Inner function: leader đọc web với TẤT CẢ nguồn (gốc + bổ sung) ---
        def appeal_leader_fn():
            evidence_chunks = []

            for url in all_sources:
                try:
                    page_text = gl.nondet.web.render(url, mode="text")
                    if page_text and len(page_text.strip()) > 50:
                        evidence_chunks.append(
                            f"SOURCE ({url}):\n{page_text[:2500]}"
                        )
                except Exception:
                    continue

            if len(evidence_chunks) < 2:
                raise gl.UserError("INSUFFICIENT_EVIDENCE_FOR_APPEAL")

            combined_evidence = "\n\n---\n\n".join(evidence_chunks)

            prompt = f"""You are a senior AI arbiter reviewing an APPEAL of a prediction market verdict.
The original verdict was: {original_outcome}
A dispute has been raised. Your task is to reconsider the question with additional sources.

QUESTION: {original_question}

EVIDENCE (including new sources provided in the appeal):
{combined_evidence}

STRICT INSTRUCTIONS:
- You must apply a HIGHER standard of evidence than the original verdict
- Only reverse the verdict if you find CLEAR AND CONVINCING evidence against it
- Carefully evaluate the new sources provided by the disputer
- Be explicit about which sources were most persuasive
- Your verdict is FINAL and cannot be appealed further

Respond ONLY with valid JSON, no other text:
{{"verdict": "YES" or "NO", "confidence": number between 0.0 and 1.0, "reasoning": "detailed explanation of why you are or are not reversing the original verdict", "reversed": true or false}}"""

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(raw, sort_keys=True)

        # Dùng principle nghiêm ngặt hơn — yêu cầu consensus mạnh hơn về verdict VÀ reversed
        result_str = gl.eq_principle.prompt_comparative(
            appeal_leader_fn,
            principle=(
                "Two appeal results are equivalent if they have the same 'verdict' value "
                "(both YES or both NO) AND the same 'reversed' boolean value "
                "(both true or both false). Differences in confidence or reasoning text "
                "are acceptable. This is a STRICT standard — both conditions must match."
            ),
        )

        # --- Parse kết quả appeal ---
        try:
            result = json.loads(result_str)
            new_verdict = result["verdict"]
            reversed_flag = result.get("reversed", False)
            new_reasoning = result.get("reasoning", "")
        except (json.JSONDecodeError, KeyError, TypeError):
            raise gl.UserError("APPEAL_RESPONSE_PARSE_FAILED")

        if new_verdict not in ("YES", "NO"):
            raise gl.UserError("MALFORMED_APPEAL_VERDICT")

        # --- Đánh dấu dispute đã resolved ---
        self.dispute_resolved[market_id] = True
        self.dispute_active[market_id] = False

        initiator = self.dispute_initiator[market_id]
        bond_amount = int(self.dispute_bond[market_id])

        if reversed_flag and new_verdict != original_outcome:
            # Appeal THẮNG → override Market outcome + trả bond
            market_contract = gl.get_contract_at(Address(self.market_contract_address))
            market_contract.override_outcome(
                market_id,
                new_verdict,
                f"APPEAL: {new_reasoning}",
                str(gl.message.contract_account),
            )

            # Trả bond lại cho initiator (cộng thêm 20% thưởng từ phí protocol)
            payout = int(bond_amount * 12 // 10)  # 120% bond
            Address(initiator).transfer(min(payout, bond_amount))  # an toàn: tối đa bond gốc
        # Nếu appeal THUA → bond bị giữ lại trong contract (discourage spam)

    # =========================================================
    #  VIEW FUNCTIONS
    # =========================================================

    @gl.public.view
    def get_dispute(self, market_id: u256) -> str:
        """Trả về trạng thái dispute của một market."""
        data = {
            "market_id": int(market_id),
            "active": self.dispute_active.get(market_id, False),
            "initiator": self.dispute_initiator.get(market_id, ""),
            "bond": int(self.dispute_bond.get(market_id, u256(0))),
            "raised_at": int(self.dispute_raised_at.get(market_id, u256(0))),
            "resolved": self.dispute_resolved.get(market_id, False),
            "original_outcome": self.dispute_original_outcome.get(market_id, ""),
        }
        return json.dumps(data)

    @gl.public.view
    def get_dispute_window_hours(self) -> u256:
        """Cửa sổ kháng nghị (giờ)."""
        return self.dispute_window_hours

    @gl.public.view
    def get_min_bond_amount(self) -> u256:
        """Bond tối thiểu để raise dispute (wei)."""
        return self.min_bond_amount

    @gl.public.view
    def get_owner(self) -> str:
        """Địa chỉ owner của DisputeResolver."""
        return self.owner
