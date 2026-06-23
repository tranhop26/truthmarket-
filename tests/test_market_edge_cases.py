"""
Test: Tất cả 9 edge case của Market contract.

Edge cases được kiểm tra:
    1. web.render lỗi / URL chết → bỏ qua, không crash toàn bộ resolution
    2. Không đủ nguồn đọc được (< 2 nguồn) → UserError("INSUFFICIENT_EVIDENCE")
    3. LLM trả JSON hỏng → UserError("LLM_RESPONSE_PARSE_FAILED")
    4. verdict không nằm trong {"YES","NO"} → UserError("MALFORMED_VERDICT")
    5. Gọi resolve 2 lần → UserError("ALREADY_RESOLVED")
    6. Gọi resolve trước deadline → UserError("DEADLINE_NOT_REACHED")
    7. place_stake với value == 0 → UserError("STAKE_MUST_BE_NONZERO")
    8. claim_payout gọi 2 lần → UserError("ALREADY_CLAIMED")
    9. Market không có ai đặt phía thua → hoàn 100% (xem test_market_happy_path.py)

Chạy bằng: npx genlayer test tests/test_market_edge_cases.py
"""

import json
import pytest


# ─────────────────────────────────────────────────────────────
#  Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def market_contract(genlayer_test):
    return genlayer_test.deploy("contracts/market.py", args=[""])


@pytest.fixture
def market_with_deadline_passed(market_contract, genlayer_test):
    """Market đã tạo sẵn với deadline trong quá khứ."""
    deadline = genlayer_test.get_timestamp() - 1
    market_contract.functions.create_market(
        "Test edge case market?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        deadline,
    )
    return market_contract


# ─────────────────────────────────────────────────────────────
#  Edge Case 1: URL chết không crash cả resolution
# ─────────────────────────────────────────────────────────────

def test_dead_url_skipped_not_crash(market_with_deadline_passed, genlayer_test):
    """
    Nếu 1 URL chết/lỗi, chỉ bỏ qua nguồn đó.
    Resolution vẫn thành công nếu còn đủ ≥ 2 nguồn khác đọc được.
    """
    # source1 trả lỗi, source2 đọc được
    genlayer_test.mock_web_render_error("https://source1.com", Exception("Connection timeout"))
    genlayer_test.mock_web_render("https://source2.com", "Clear evidence for the verdict here.")

    # Giả sử market có 3 nguồn, 1 chết vẫn OK nếu có thêm nguồn thứ 3
    # (Đối với test này ta cần tạo market với 3 nguồn)
    deadline = genlayer_test.get_timestamp() - 1
    market_with_deadline_passed.functions.create_market(
        "Three source question?",
        json.dumps([
            "https://dead-url.com",
            "https://alive-source1.com",
            "https://alive-source2.com",
        ]),
        deadline,
    )
    market_id = 1  # market vừa tạo

    genlayer_test.mock_web_render_error("https://dead-url.com", Exception("404 Not Found"))
    genlayer_test.mock_web_render("https://alive-source1.com", "Evidence A: supports YES strongly.")
    genlayer_test.mock_web_render("https://alive-source2.com", "Evidence B: confirms YES verdict.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.88, "reasoning": "Two alive sources confirm YES."})
    )

    # Không được raise exception
    market_with_deadline_passed.functions.resolve_market(market_id)

    raw = market_with_deadline_passed.functions.get_market(market_id).return_value
    data = json.loads(raw)
    assert data["resolved"] is True
    assert data["outcome"] == "YES"


# ─────────────────────────────────────────────────────────────
#  Edge Case 2: Không đủ nguồn đọc được (< 2 nguồn)
# ─────────────────────────────────────────────────────────────

def test_insufficient_evidence_raises_error(market_with_deadline_passed, genlayer_test):
    """
    Khi tất cả URL đều chết/lỗi và < 2 nguồn đọc được
    → phải raise UserError("INSUFFICIENT_EVIDENCE").
    """
    # Tất cả nguồn đều chết
    genlayer_test.mock_web_render_error("https://source1.com", Exception("Timeout"))
    genlayer_test.mock_web_render_error("https://source2.com", Exception("DNS fail"))

    with pytest.raises(Exception, match="INSUFFICIENT_EVIDENCE"):
        market_with_deadline_passed.functions.resolve_market(0)

    # Market vẫn UNRESOLVED → có thể gọi lại sau
    raw = market_with_deadline_passed.functions.get_market(0).return_value
    data = json.loads(raw)
    assert data["resolved"] is False
    assert data["outcome"] == "UNRESOLVED"


# ─────────────────────────────────────────────────────────────
#  Edge Case 3: LLM trả JSON hỏng
# ─────────────────────────────────────────────────────────────

def test_malformed_llm_json_raises_error(market_with_deadline_passed, genlayer_test):
    """
    Khi LLM trả về JSON không parse được
    → phải raise UserError("LLM_RESPONSE_PARSE_FAILED").
    """
    genlayer_test.mock_web_render("https://source1.com", "Relevant evidence about the topic.")
    genlayer_test.mock_web_render("https://source2.com", "More evidence supporting the claim.")

    # LLM trả về plain text thay vì JSON
    genlayer_test.mock_exec_prompt("This is not valid JSON at all {{broken}")

    with pytest.raises(Exception, match="LLM_RESPONSE_PARSE_FAILED"):
        market_with_deadline_passed.functions.resolve_market(0)


# ─────────────────────────────────────────────────────────────
#  Edge Case 4: verdict không hợp lệ
# ─────────────────────────────────────────────────────────────

def test_malformed_verdict_raises_error(market_with_deadline_passed, genlayer_test):
    """
    Khi LLM trả verdict = "MAYBE" hoặc "UNKNOWN" (không phải YES/NO)
    → phải raise UserError("MALFORMED_VERDICT").
    """
    genlayer_test.mock_web_render("https://source1.com", "Ambiguous evidence about the topic.")
    genlayer_test.mock_web_render("https://source2.com", "No clear conclusion from this source.")

    # LLM trả verdict không hợp lệ
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "MAYBE", "confidence": 0.3, "reasoning": "Insufficient evidence."})
    )

    with pytest.raises(Exception, match="MALFORMED_VERDICT"):
        market_with_deadline_passed.functions.resolve_market(0)


# ─────────────────────────────────────────────────────────────
#  Edge Case 5: Gọi resolve 2 lần
# ─────────────────────────────────────────────────────────────

def test_double_resolve_raises_error(market_with_deadline_passed, genlayer_test):
    """
    Gọi resolve_market() 2 lần trên cùng market đã resolved
    → lần 2 phải raise UserError("ALREADY_RESOLVED").
    """
    # Resolve lần 1 thành công
    genlayer_test.mock_web_render("https://source1.com", "Clear YES evidence from source one.")
    genlayer_test.mock_web_render("https://source2.com", "More YES evidence from source two.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.92, "reasoning": "Both sources agree."})
    )
    market_with_deadline_passed.functions.resolve_market(0)

    # Resolve lần 2 → phải fail
    with pytest.raises(Exception, match="ALREADY_RESOLVED"):
        market_with_deadline_passed.functions.resolve_market(0)


# ─────────────────────────────────────────────────────────────
#  Edge Case 6: Resolve trước deadline
# ─────────────────────────────────────────────────────────────

def test_resolve_before_deadline_raises_error(market_contract, genlayer_test):
    """
    Gọi resolve_market() khi chưa qua deadline
    → phải raise UserError("DEADLINE_NOT_REACHED").
    """
    # Tạo market với deadline trong tương lai
    future_deadline = genlayer_test.get_timestamp() + 86400  # 1 ngày sau

    market_contract.functions.create_market(
        "Future market not ready to resolve?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        future_deadline,
    )

    with pytest.raises(Exception, match="DEADLINE_NOT_REACHED"):
        market_contract.functions.resolve_market(0)


# ─────────────────────────────────────────────────────────────
#  Edge Case 7: place_stake với value = 0
# ─────────────────────────────────────────────────────────────

def test_zero_stake_raises_error(market_contract, genlayer_test):
    """
    Đặt cược với value = 0 phải bị từ chối.
    """
    future_deadline = genlayer_test.get_timestamp() + 3600

    market_contract.functions.create_market(
        "Test zero stake?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        future_deadline,
    )

    alice = genlayer_test.accounts[1]

    with pytest.raises(Exception, match="STAKE_MUST_BE_NONZERO"):
        market_contract.functions.place_stake(0, True, sender=alice, value=0)


# ─────────────────────────────────────────────────────────────
#  Edge Case 8: Double-claim payout
# ─────────────────────────────────────────────────────────────

def test_double_claim_raises_error(market_with_deadline_passed, genlayer_test):
    """
    Gọi claim_payout() 2 lần → lần 2 phải raise UserError("ALREADY_CLAIMED").
    """
    alice = genlayer_test.accounts[1]
    bob = genlayer_test.accounts[2]

    # Alice YES, Bob NO
    market_with_deadline_passed.functions.place_stake(0, True, sender=alice, value=2_000_000)
    market_with_deadline_passed.functions.place_stake(0, False, sender=bob, value=1_000_000)

    # Resolve YES
    genlayer_test.mock_web_render("https://source1.com", "Strong YES evidence here.")
    genlayer_test.mock_web_render("https://source2.com", "Second source also confirms YES.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.95, "reasoning": "Clear YES."})
    )
    market_with_deadline_passed.functions.resolve_market(0)

    # Alice claim lần 1 → OK
    market_with_deadline_passed.functions.claim_payout(0, sender=alice)

    # Alice claim lần 2 → FAIL
    with pytest.raises(Exception, match="ALREADY_CLAIMED"):
        market_with_deadline_passed.functions.claim_payout(0, sender=alice)


# ─────────────────────────────────────────────────────────────
#  Edge Case phụ: Stake vào market đã resolved
# ─────────────────────────────────────────────────────────────

def test_stake_after_resolved_raises_error(market_with_deadline_passed, genlayer_test):
    """Không được đặt cược vào market đã resolved."""
    alice = genlayer_test.accounts[1]

    # Resolve market trước
    genlayer_test.mock_web_render("https://source1.com", "YES evidence strong and clear.")
    genlayer_test.mock_web_render("https://source2.com", "YES confirmed by second source.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.9, "reasoning": "YES confirmed."})
    )
    market_with_deadline_passed.functions.resolve_market(0)

    # Đặt cược sau khi resolved → FAIL
    with pytest.raises(Exception, match="MARKET_ALREADY_RESOLVED"):
        market_with_deadline_passed.functions.place_stake(0, True, sender=alice, value=1_000_000)


# ─────────────────────────────────────────────────────────────
#  Edge Case phụ: Claim khi chưa resolved
# ─────────────────────────────────────────────────────────────

def test_claim_before_resolved_raises_error(market_with_deadline_passed, genlayer_test):
    """Không được claim payout trước khi market resolved."""
    alice = genlayer_test.accounts[1]
    market_with_deadline_passed.functions.place_stake(0, True, sender=alice, value=1_000_000)

    with pytest.raises(Exception, match="MARKET_NOT_RESOLVED_YET"):
        market_with_deadline_passed.functions.claim_payout(0, sender=alice)


# ─────────────────────────────────────────────────────────────
#  Edge Case phụ: Market không tồn tại
# ─────────────────────────────────────────────────────────────

def test_get_nonexistent_market(market_contract, genlayer_test):
    """get_market với market_id không tồn tại phải raise lỗi."""
    with pytest.raises(Exception, match="MARKET_NOT_FOUND"):
        market_contract.functions.get_market(999)


def test_claim_payout_loser_raises_error(market_with_deadline_passed, genlayer_test):
    """Người đặt phía thua không được claim payout."""
    alice = genlayer_test.accounts[1]
    bob = genlayer_test.accounts[2]

    market_with_deadline_passed.functions.place_stake(0, True, sender=alice, value=2_000_000)
    market_with_deadline_passed.functions.place_stake(0, False, sender=bob, value=1_000_000)

    # Resolve YES → Alice thắng, Bob thua
    genlayer_test.mock_web_render("https://source1.com", "YES is clearly supported.")
    genlayer_test.mock_web_render("https://source2.com", "Second YES source agrees.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.9, "reasoning": "YES wins."})
    )
    market_with_deadline_passed.functions.resolve_market(0)

    # Bob (đặt NO) cố claim → FAIL
    with pytest.raises(Exception, match="NO_WINNING_STAKE"):
        market_with_deadline_passed.functions.claim_payout(0, sender=bob)
