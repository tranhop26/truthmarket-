"""
Test: Dispute/Appeal flow cho DisputeResolver contract.

Kiểm tra:
    1. Raise dispute thành công với bond hợp lệ
    2. Bond quá thấp bị từ chối
    3. Không raise 2 dispute trên cùng market
    4. final_resolve thắng → override Market outcome + trả bond
    5. final_resolve thua → giữ bond (chống spam)
    6. final_resolve trước khi cửa sổ kháng nghị đóng → bị từ chối
    7. final_resolve khi không có dispute → bị từ chối

Chạy bằng: npx genlayer test tests/test_dispute_flow.py
"""

import json
import pytest


# ─────────────────────────────────────────────────────────────
#  Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def market_contract(genlayer_test):
    """Deploy Market contract."""
    return genlayer_test.deploy("contracts/market.py", args=[""])


@pytest.fixture
def dispute_contract(genlayer_test, market_contract):
    """Deploy DisputeResolver contract trỏ vào market_contract."""
    return genlayer_test.deploy(
        "contracts/dispute_resolver.py",
        args=[
            str(market_contract.address),
            2,          # dispute_window_hours = 2 giờ
            100_000,    # min_bond_amount = 100_000 wei
        ],
    )


@pytest.fixture
def resolved_market(market_contract, genlayer_test):
    """Market đã resolve xong, trả về (contract, market_id)."""
    deadline = genlayer_test.get_timestamp() - 1

    market_contract.functions.create_market(
        "Will this film be considered a cultural milestone?",
        json.dumps([
            "https://www.film-source1.com",
            "https://www.film-source2.com",
        ]),
        deadline,
    )

    # Resolve với outcome = NO
    genlayer_test.mock_web_render(
        "https://www.film-source1.com",
        "Critics found the film mediocre. Score: 45%. Not a milestone.",
    )
    genlayer_test.mock_web_render(
        "https://www.film-source2.com",
        "Audiences were disappointed. The film failed to make an impact.",
    )
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "NO", "confidence": 0.75, "reasoning": "Evidence shows mediocre reception."})
    )
    market_contract.functions.resolve_market(0)

    return market_contract, 0  # (contract, market_id)


# ─────────────────────────────────────────────────────────────
#  Test 1: Raise dispute thành công
# ─────────────────────────────────────────────────────────────

def test_raise_dispute_success(resolved_market, dispute_contract, genlayer_test):
    """Raise dispute thành công với bond đủ lớn."""
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]
    bond_amount = 200_000  # lớn hơn min_bond = 100_000

    dispute_contract.functions.raise_dispute(
        market_id,
        json.dumps(["https://new-extra-source.com"]),
        "NO",  # original_outcome mà alice không đồng ý
        sender=alice,
        value=bond_amount,
    )

    raw = dispute_contract.functions.get_dispute(market_id).return_value
    data = json.loads(raw)

    assert data["active"] is True
    assert data["initiator"] == str(alice)
    assert data["bond"] == bond_amount
    assert data["original_outcome"] == "NO"
    assert data["resolved"] is False


# ─────────────────────────────────────────────────────────────
#  Test 2: Bond quá thấp bị từ chối
# ─────────────────────────────────────────────────────────────

def test_raise_dispute_bond_too_low(resolved_market, dispute_contract, genlayer_test):
    """Bond < min_bond_amount bị từ chối."""
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]

    with pytest.raises(Exception, match="BOND_TOO_LOW"):
        dispute_contract.functions.raise_dispute(
            market_id,
            json.dumps(["https://extra-source.com"]),
            "NO",
            sender=alice,
            value=50_000,  # nhỏ hơn min_bond = 100_000
        )


# ─────────────────────────────────────────────────────────────
#  Test 3: Không raise 2 dispute trên cùng market
# ─────────────────────────────────────────────────────────────

def test_double_dispute_raises_error(resolved_market, dispute_contract, genlayer_test):
    """Không được raise dispute 2 lần trên cùng market."""
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]
    bob = genlayer_test.accounts[2]

    # Alice raise dispute
    dispute_contract.functions.raise_dispute(
        market_id,
        json.dumps(["https://extra-source.com"]),
        "NO",
        sender=alice,
        value=200_000,
    )

    # Bob cũng cố raise → FAIL
    with pytest.raises(Exception, match="DISPUTE_ALREADY_ACTIVE"):
        dispute_contract.functions.raise_dispute(
            market_id,
            json.dumps(["https://another-source.com"]),
            "NO",
            sender=bob,
            value=300_000,
        )


# ─────────────────────────────────────────────────────────────
#  Test 4: final_resolve thắng → override Market, trả bond
# ─────────────────────────────────────────────────────────────

def test_final_resolve_appeal_wins(resolved_market, dispute_contract, genlayer_test):
    """
    Khi appeal AI cho ra verdict khác với original_outcome
    → Market outcome bị override → initiator nhận lại bond.
    """
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]

    # Alice dispute outcome NO → tin rằng nên là YES
    dispute_contract.functions.raise_dispute(
        market_id,
        json.dumps(["https://extra-source-proving-yes.com"]),
        "NO",
        sender=alice,
        value=200_000,
    )

    # Simulate: cửa sổ kháng nghị đã đóng (advance time)
    genlayer_test.advance_time(hours=3)  # qua dispute_window = 2h

    # Mock nguồn bổ sung và LLM đảo verdict sang YES
    genlayer_test.mock_web_render(
        "https://www.film-source1.com",
        "Upon re-examination, the film actually received strong praise in retrospect.",
    )
    genlayer_test.mock_web_render(
        "https://www.film-source2.com",
        "Audience sentiment has shifted; many now consider it a cultural touchstone.",
    )
    genlayer_test.mock_web_render(
        "https://extra-source-proving-yes.com",
        "New critical analysis proves the film has lasting cultural significance.",
    )
    genlayer_test.mock_exec_prompt(
        json.dumps({
            "verdict": "YES",
            "confidence": 0.81,
            "reasoning": "New evidence reverses original verdict. The film achieved cultural milestone status.",
            "reversed": True,
        })
    )

    alice_balance_before = genlayer_test.get_balance(alice)

    dispute_contract.functions.final_resolve(
        market_id,
        "Will this film be considered a cultural milestone?",
        json.dumps([
            "https://www.film-source1.com",
            "https://www.film-source2.com",
        ]),
    )

    # Market outcome phải bị override thành YES
    raw = market_contract.functions.get_market(market_id).return_value
    data = json.loads(raw)
    assert data["outcome"] == "YES"
    assert "APPEAL OVERRIDE" in data["reasoning"]

    # Dispute đã resolved
    raw_dispute = dispute_contract.functions.get_dispute(market_id).return_value
    d_data = json.loads(raw_dispute)
    assert d_data["resolved"] is True
    assert d_data["active"] is False

    # Alice nhận lại bond
    alice_balance_after = genlayer_test.get_balance(alice)
    assert alice_balance_after > alice_balance_before


# ─────────────────────────────────────────────────────────────
#  Test 5: final_resolve thua → giữ bond
# ─────────────────────────────────────────────────────────────

def test_final_resolve_appeal_loses(resolved_market, dispute_contract, genlayer_test):
    """
    Khi appeal AI giữ nguyên verdict → initiator mất bond (chống spam).
    """
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]

    dispute_contract.functions.raise_dispute(
        market_id,
        json.dumps(["https://extra-source.com"]),
        "NO",
        sender=alice,
        value=200_000,
    )

    genlayer_test.advance_time(hours=3)

    # Mock LLM giữ nguyên NO
    genlayer_test.mock_web_render(
        "https://www.film-source1.com",
        "Film remains mediocre despite new claims.",
    )
    genlayer_test.mock_web_render(
        "https://www.film-source2.com",
        "Critics still unimpressed after re-review.",
    )
    genlayer_test.mock_web_render(
        "https://extra-source.com",
        "This source is biased and unreliable.",
    )
    genlayer_test.mock_exec_prompt(
        json.dumps({
            "verdict": "NO",
            "confidence": 0.89,
            "reasoning": "New sources do not provide sufficient evidence to reverse original verdict.",
            "reversed": False,
        })
    )

    alice_balance_before = genlayer_test.get_balance(alice)

    dispute_contract.functions.final_resolve(
        market_id,
        "Will this film be considered a cultural milestone?",
        json.dumps([
            "https://www.film-source1.com",
            "https://www.film-source2.com",
        ]),
    )

    # Market outcome vẫn là NO (không thay đổi)
    raw = market_contract.functions.get_market(market_id).return_value
    data = json.loads(raw)
    assert data["outcome"] == "NO"

    # Alice không nhận bond lại
    alice_balance_after = genlayer_test.get_balance(alice)
    assert alice_balance_after == alice_balance_before  # không được nhận thêm


# ─────────────────────────────────────────────────────────────
#  Test 6: final_resolve trong cửa sổ kháng nghị vẫn mở
# ─────────────────────────────────────────────────────────────

def test_final_resolve_before_window_closes(resolved_market, dispute_contract, genlayer_test):
    """final_resolve khi cửa sổ dispute chưa đóng → bị từ chối."""
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]

    dispute_contract.functions.raise_dispute(
        market_id,
        json.dumps(["https://extra-source.com"]),
        "NO",
        sender=alice,
        value=200_000,
    )

    # Không advance time → cửa sổ vẫn mở
    with pytest.raises(Exception, match="DISPUTE_WINDOW_STILL_OPEN"):
        dispute_contract.functions.final_resolve(
            market_id,
            "Will this film be considered a cultural milestone?",
            json.dumps([
                "https://www.film-source1.com",
                "https://www.film-source2.com",
            ]),
        )


# ─────────────────────────────────────────────────────────────
#  Test 7: final_resolve khi không có dispute
# ─────────────────────────────────────────────────────────────

def test_final_resolve_without_dispute(resolved_market, dispute_contract, genlayer_test):
    """final_resolve khi không có dispute đang active → bị từ chối."""
    market_contract, market_id = resolved_market

    with pytest.raises(Exception, match="NO_ACTIVE_DISPUTE"):
        dispute_contract.functions.final_resolve(
            market_id,
            "Will this film be considered a cultural milestone?",
            json.dumps([
                "https://www.film-source1.com",
                "https://www.film-source2.com",
            ]),
        )


# ─────────────────────────────────────────────────────────────
#  Test 8: Dispute với extra_sources rỗng bị từ chối
# ─────────────────────────────────────────────────────────────

def test_raise_dispute_empty_sources(resolved_market, dispute_contract, genlayer_test):
    """Raise dispute không có extra source → bị từ chối."""
    market_contract, market_id = resolved_market
    alice = genlayer_test.accounts[1]

    with pytest.raises(Exception, match="NEED_AT_LEAST_1_EXTRA_SOURCE"):
        dispute_contract.functions.raise_dispute(
            market_id,
            json.dumps([]),  # không có source bổ sung
            "NO",
            sender=alice,
            value=200_000,
        )
