# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — Market Contract (Core)

Contract trung tâm quản lý toàn bộ prediction market:
- Tạo market với câu hỏi định tính và danh sách nguồn URL
- Người dùng đặt cược YES/NO
- AI tự đọc internet và đưa ra phán quyết (không có trọng tài con người)
- Phân phối phần thưởng cho người đặt cược đúng

Bắt buộc dùng GenLayer vì: nếu bỏ gl.nondet.web.render + gl.nondet.exec_prompt
ra khỏi resolve_market(), không có cách nào trên đời để một smart contract
tự đọc hiểu hàng trăm bài báo/review và tự đưa ra phán quyết về câu hỏi định tính.
"""

import json
from genlayer import *


class Contract(gl.Contract):
    # --- Storage: Thông tin cơ bản của mỗi market ---
    markets_question: TreeMap[u256, str]
    markets_sources: TreeMap[u256, str]          # JSON-encoded list[str] URLs
    markets_deadline: TreeMap[u256, u256]
    markets_creator: TreeMap[u256, str]          # address của creator

    # --- Storage: Trạng thái resolution ---
    markets_resolved: TreeMap[u256, bool]
    markets_outcome: TreeMap[u256, str]          # "YES" | "NO" | "UNRESOLVED"
    markets_reasoning: TreeMap[u256, str]        # lý do AI đưa ra (hiển thị cho user)
    markets_resolved_at: TreeMap[u256, u256]     # timestamp khi resolve xong

    # --- Storage: Pools đặt cược ---
    yes_pool: TreeMap[u256, u256]                # tổng tiền đặt YES (wei)
    no_pool: TreeMap[u256, u256]                 # tổng tiền đặt NO (wei)

    # --- Storage: Stake của từng user ---
    # key = f"{market_id}:{address}"
    user_yes_stake: TreeMap[str, u256]
    user_no_stake: TreeMap[str, u256]

    # --- Storage: Chống double-claim ---
    # key = f"{market_id}:{address}"
    claimed: TreeMap[str, bool]

    # --- Storage: Metadata ---
    market_count: u256
    registry_address: str                        # địa chỉ MarketRegistry (tùy chọn)

    def __init__(self, registry_addr: str = ""):
        self.market_count = 0
        self.registry_address = registry_addr

    # =========================================================
    #  TẠO MARKET
    # =========================================================

    @gl.public.write
    def create_market(
        self,
        question: str,
        sources_json: str,
        deadline_timestamp: u256,
    ) -> u256:
        """
        Tạo một market mới.

        Args:
            question: Câu hỏi định tính (vd: "Liệu phim X có được giới phê bình gọi là kiệt tác?")
            sources_json: JSON-encoded list các URL nguồn tin (vd: '["https://...", "https://..."]')
            deadline_timestamp: Unix timestamp khi market đóng và có thể resolve

        Returns:
            market_id của market vừa tạo
        """
        # Validate deadline — cast cả 2 về int để tránh TypeError (u256 vs int)
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

        # Tạo market mới
        market_id = self.market_count
        self.markets_question[market_id] = question
        self.markets_sources[market_id] = sources_json
        self.markets_deadline[market_id] = deadline_timestamp
        self.markets_creator[market_id] = str(gl.message.sender_account)
        self.markets_resolved[market_id] = False
        self.markets_outcome[market_id] = "UNRESOLVED"
        self.markets_reasoning[market_id] = ""
        self.markets_resolved_at[market_id] = 0
        self.yes_pool[market_id] = 0
        self.no_pool[market_id] = 0

        self.market_count = self.market_count + 1

        return market_id

    # =========================================================
    #  ĐẶT CƯỢC
    # =========================================================

    @gl.public.write.payable
    def place_stake(self, market_id: u256, side: bool) -> None:
        """
        Đặt cược vào một market.

        Args:
            market_id: ID của market
            side: True = đặt YES, False = đặt NO
        """
        # Validate value
        if gl.message.value == 0:
            raise gl.UserError("STAKE_MUST_BE_NONZERO")

        # Validate market tồn tại
        if int(market_id) >= int(self.market_count):
            raise gl.UserError("MARKET_NOT_FOUND")

        # Validate market chưa resolved
        if self.markets_resolved[market_id]:
            raise gl.UserError("MARKET_ALREADY_RESOLVED")

        # Validate chưa qua deadline
        if gl.block.timestamp >= self.markets_deadline[market_id]:
            raise gl.UserError("MARKET_DEADLINE_PASSED")

        sender = str(gl.message.sender_account)
        amount = gl.message.value
        stake_key = f"{int(market_id)}:{sender}"

        if side:  # đặt YES
            self.user_yes_stake[stake_key] = u256(int(self.user_yes_stake.get(stake_key, u256(0))) + int(amount))
            self.yes_pool[market_id] = u256(int(self.yes_pool[market_id]) + int(amount))
        else:     # đặt NO
            self.user_no_stake[stake_key] = u256(int(self.user_no_stake.get(stake_key, u256(0))) + int(amount))
            self.no_pool[market_id] = u256(int(self.no_pool[market_id]) + int(amount))

    # =========================================================
    #  RESOLUTION — TIM CỦA DỰ ÁN
    # =========================================================

    @gl.public.write
    def resolve_market(self, market_id: u256) -> None:
        """
        Phán quyết market bằng AI đọc internet.

        Flow:
        1. Validate trạng thái và deadline
        2. Đọc từng URL nguồn bằng gl.nondet.web.render()
        3. Tổng hợp bằng chứng và gọi LLM qua gl.nondet.exec_prompt()
        4. Dùng gl.eq_principle.prompt_comparative() đạt đồng thuận validator
        5. Ghi kết quả verdict + reasoning vào state
        """
        # --- Validate ---
        if int(market_id) >= int(self.market_count):
            raise gl.UserError("MARKET_NOT_FOUND")

        if self.markets_resolved[market_id]:
            raise gl.UserError("ALREADY_RESOLVED")

        if int(gl.block.timestamp) < int(self.markets_deadline[market_id]):
            raise gl.UserError("DEADLINE_NOT_REACHED")

        question = self.markets_question[market_id]
        sources_json = self.markets_sources[market_id]

        try:
            sources = json.loads(sources_json)
        except Exception:
            raise gl.UserError("SOURCES_PARSE_FAILED")

        # --- Inner function: leader validator đọc web + gọi LLM ---
        def leader_fn():
            evidence_chunks = []
            failed_sources = []

            for url in sources:
                try:
                    # Đọc nội dung trang web thật
                    page_text = gl.nondet.web.render(url, mode="text")
                    if page_text and len(page_text.strip()) > 50:
                        # Cắt giới hạn mỗi nguồn để tránh vượt context LLM
                        evidence_chunks.append(
                            f"SOURCE ({url}):\n{page_text[:2500]}"
                        )
                except Exception:
                    # Bỏ qua nguồn lỗi, không crash toàn bộ resolution
                    failed_sources.append(url)
                    continue

            # Cần tối thiểu 2 nguồn đọc được
            if len(evidence_chunks) < 2:
                raise gl.UserError("INSUFFICIENT_EVIDENCE")

            combined_evidence = "\n\n---\n\n".join(evidence_chunks)

            prompt = f"""You are a neutral AI judge for a prediction market.
Your task is to determine whether the following question should be answered YES or NO,
based ONLY on the evidence provided below.

QUESTION: {question}

EVIDENCE FROM SOURCES:
{combined_evidence}

INSTRUCTIONS:
- Analyze each source carefully and objectively
- If evidence strongly supports YES: verdict = "YES"
- If evidence strongly supports NO: verdict = "NO"
- Choose the verdict supported by MORE evidence
- Be honest about your confidence level (0.0 = uncertain, 1.0 = certain)
- Keep reasoning concise (2-3 sentences max)

Respond ONLY with valid JSON, no other text:
{{"verdict": "YES" or "NO", "confidence": number between 0.0 and 1.0, "reasoning": "brief summary of key evidence"}}"""

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(raw, sort_keys=True)

        # --- Đồng thuận validator: so sánh Ý NGHĨA verdict, không phải chuỗi ký tự ---
        # KHÔNG dùng strict_eq vì reasoning text sẽ khác nhau giữa các validator
        result_str = gl.eq_principle.prompt_comparative(
            leader_fn,
            principle=(
                "Two results are equivalent if they have the same 'verdict' value "
                "(both YES or both NO). Differences in 'confidence' values or "
                "'reasoning' text are acceptable and should be ignored."
            ),
        )

        # --- Parse kết quả ---
        try:
            result = json.loads(result_str)
        except (json.JSONDecodeError, TypeError):
            raise gl.UserError("LLM_RESPONSE_PARSE_FAILED")

        try:
            verdict = result["verdict"]
        except KeyError:
            raise gl.UserError("LLM_RESPONSE_PARSE_FAILED")

        if verdict not in ("YES", "NO"):
            raise gl.UserError("MALFORMED_VERDICT")

        reasoning = result.get("reasoning", "")

        # --- Ghi kết quả vào state ---
        self.markets_outcome[market_id] = verdict
        self.markets_reasoning[market_id] = reasoning
        self.markets_resolved[market_id] = True
        self.markets_resolved_at[market_id] = int(gl.block.timestamp)

    # =========================================================
    #  OVERRIDE OUTCOME (chỉ DisputeResolver được gọi)
    # =========================================================

    @gl.public.write
    def override_outcome(
        self,
        market_id: u256,
        new_outcome: str,
        new_reasoning: str,
        dispute_resolver: str,
    ) -> None:
        """
        Ghi đè kết quả từ DisputeResolver sau khi appeal thắng.
        Chỉ địa chỉ dispute_resolver hợp lệ mới được gọi.
        """
        if int(market_id) >= int(self.market_count):
            raise gl.UserError("MARKET_NOT_FOUND")

        if new_outcome not in ("YES", "NO"):
            raise gl.UserError("INVALID_OUTCOME")

        # TODO: trong production, cần validate caller là dispute_resolver đã đăng ký
        self.markets_outcome[market_id] = new_outcome
        self.markets_reasoning[market_id] = f"[APPEAL OVERRIDE] {new_reasoning}"

    # =========================================================
    #  NHẬN PHẦN THƯỞNG
    # =========================================================

    @gl.public.write
    def claim_payout(self, market_id: u256) -> None:
        """
        Nhận phần thưởng sau khi market đã resolved.

        Tính toán:
        - Người thắng chia sẻ toàn bộ pool (yes_pool + no_pool) theo tỷ lệ stake
        - Nếu pool đối ứng = 0 (không ai đặt phía thua) → hoàn 100% stake
        """
        if int(market_id) >= int(self.market_count):
            raise gl.UserError("MARKET_NOT_FOUND")

        if not self.markets_resolved[market_id]:
            raise gl.UserError("MARKET_NOT_RESOLVED_YET")

        sender = str(gl.message.sender_account)
        claim_key = f"{int(market_id)}:{sender}"
        stake_key = f"{int(market_id)}:{sender}"

        # Chống double-claim: set TRƯỚC khi transfer (chống reentrancy)
        if self.claimed.get(claim_key, False):
            raise gl.UserError("ALREADY_CLAIMED")

        verdict = self.markets_outcome[market_id]
        yes_total = int(self.yes_pool[market_id])
        no_total = int(self.no_pool[market_id])
        total_pool = yes_total + no_total

        user_yes = int(self.user_yes_stake.get(stake_key, u256(0)))
        user_no = int(self.user_no_stake.get(stake_key, u256(0)))

        payout = 0

        if verdict == "YES":
            if user_yes == 0:
                raise gl.UserError("NO_WINNING_STAKE")
            if no_total == 0:
                # Không có ai đặt NO → hoàn 100% stake YES
                payout = user_yes
            else:
                # Tỷ lệ: stake_user / yes_pool * total_pool
                payout = (user_yes * total_pool) // yes_total
        elif verdict == "NO":
            if user_no == 0:
                raise gl.UserError("NO_WINNING_STAKE")
            if yes_total == 0:
                # Không có ai đặt YES → hoàn 100% stake NO
                payout = user_no
            else:
                payout = (user_no * total_pool) // no_total
        else:
            raise gl.UserError("MARKET_UNRESOLVED")

        if payout == 0:
            raise gl.UserError("ZERO_PAYOUT")

        # Đánh dấu đã claim TRƯỚC khi transfer
        self.claimed[claim_key] = True

        # Transfer phần thưởng
        gl.message.sender_account.transfer(payout)

    # =========================================================
    #  VIEW FUNCTIONS
    # =========================================================

    @gl.public.view
    def get_market(self, market_id: u256) -> str:
        """
        Trả về toàn bộ thông tin của một market (JSON-encoded string).
        Frontend dùng để đọc state.
        """
        if int(market_id) >= int(self.market_count):
            raise gl.UserError("MARKET_NOT_FOUND")

        yes_total = int(self.yes_pool[market_id])
        no_total = int(self.no_pool[market_id])
        total = yes_total + no_total

        # Tính odds (tỷ lệ %) — tránh chia 0
        if total > 0:
            yes_pct = (yes_total * 100) // total
            no_pct = 100 - yes_pct
        else:
            yes_pct = 50
            no_pct = 50

        data = {
            "market_id": int(market_id),
            "question": self.markets_question[market_id],
            "sources": json.loads(self.markets_sources[market_id]),
            "deadline": int(self.markets_deadline[market_id]),
            "creator": self.markets_creator[market_id],
            "resolved": self.markets_resolved[market_id],
            "outcome": self.markets_outcome[market_id],
            "reasoning": self.markets_reasoning[market_id],
            "resolved_at": int(self.markets_resolved_at[market_id]),
            "yes_pool": yes_total,
            "no_pool": no_total,
            "total_pool": total,
            "yes_pct": yes_pct,
            "no_pct": no_pct,
        }
        return json.dumps(data)

    @gl.public.view
    def get_user_stake(self, market_id: u256, user_address: str) -> str:
        """Trả về thông tin stake của một user trong một market."""
        stake_key = f"{int(market_id)}:{user_address}"
        claim_key = f"{int(market_id)}:{user_address}"

        data = {
            "yes_stake": int(self.user_yes_stake.get(stake_key, u256(0))),
            "no_stake": int(self.user_no_stake.get(stake_key, u256(0))),
            "claimed": self.claimed.get(claim_key, False),
        }
        return json.dumps(data)

    @gl.public.view
    def get_market_count(self) -> u256:
        """Trả về tổng số market đã tạo."""
        return self.market_count

    @gl.public.view
    def get_all_markets_summary(self) -> str:
        """
        Trả về danh sách tóm tắt tất cả market (cho trang danh sách).
        Giới hạn tối đa 50 market gần nhất để tránh gas overflow.
        """
        count = int(self.market_count)
        start = max(0, count - 50)
        markets = []

        for i in range(start, count):
            mid = u256(i)
            yes_total = int(self.yes_pool[mid])
            no_total = int(self.no_pool[mid])
            total = yes_total + no_total
            yes_pct = (yes_total * 100) // total if total > 0 else 50

            markets.append({
                "market_id": i,
                "question": self.markets_question[mid],
                "deadline": int(self.markets_deadline[mid]),
                "resolved": self.markets_resolved[mid],
                "outcome": self.markets_outcome[mid],
                "yes_pct": yes_pct,
                "total_pool": total,
            })

        return json.dumps(markets)
