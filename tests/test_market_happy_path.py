"""
Test: Happy path đầy đủ cho Market contract.

Kiểm tra luồng bình thường:
    1. Tạo market
    2. Đặt cược YES + NO
    3. Resolve (AI đọc web + LLM)
    4. Claim payout cho người thắng
    5. Từ chối claim cho người thua

Chạy bằng: npx genlayer test tests/test_market_happy_path.py
"""

import json
import pytest


# ─────────────────────────────────────────────────────────────
#  Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def market_contract(genlayer_test):
    """Deploy Market contract và trả về instance."""
    return genlayer_test.deploy(
        "contracts/market.py",
        args=[""],  # registry_addr rỗng
    )


# ─────────────────────────────────────────────────────────────
#  Test: Tạo market
# ─────────────────────────────────────────────────────────────

def test_create_market_success(market_contract, genlayer_test):
    """Market được tạo thành công với thông tin hợp lệ."""
    deadline = genlayer_test.get_timestamp() + 3600  # 1 giờ sau

    result = market_contract.functions.create_market(
        "Will critics universally praise the film 'Oppenheimer' as a masterpiece?",
        json.dumps([
            "https://www.rottentomatoes.com/m/oppenheimer_2023",
            "https://letterboxd.com/film/oppenheimer-2023/",
            "https://www.metacritic.com/movie/oppenheimer/",
        ]),
        deadline,
    )

    market_id = result.return_value
    assert market_id == 0, "market_id đầu tiên phải là 0"

    # Kiểm tra get_market_count
    count = market_contract.functions.get_market_count().return_value
    assert count == 1


def test_get_market_after_create(market_contract, genlayer_test):
    """Thông tin market phải khớp sau khi tạo."""
    deadline = genlayer_test.get_timestamp() + 3600
    question = "Will Taylor Swift win Album of the Year at the 2025 Grammys?"
    sources = ["https://www.grammy.com/news", "https://variety.com/music"]

    market_contract.functions.create_market(
        question,
        json.dumps(sources),
        deadline,
    )

    raw = market_contract.functions.get_market(0).return_value
    data = json.loads(raw)

    assert data["market_id"] == 0
    assert data["question"] == question
    assert data["resolved"] is False
    assert data["outcome"] == "UNRESOLVED"
    assert data["yes_pct"] == 50  # không có stake → balanced default
    assert data["total_pool"] == 0


# ─────────────────────────────────────────────────────────────
#  Test: Đặt cược
# ─────────────────────────────────────────────────────────────

def test_place_stake_yes(market_contract, genlayer_test):
    """Đặt cược YES thành công, pool cập nhật đúng."""
    deadline = genlayer_test.get_timestamp() + 3600
    market_contract.functions.create_market(
        "Test question for staking?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        deadline,
    )

    alice = genlayer_test.accounts[1]
    stake_amount = 1_000_000  # 1 GLT (đơn vị nhỏ nhất)

    market_contract.functions.place_stake(
        0, True,  # market_id=0, side=YES
        sender=alice,
        value=stake_amount,
    )

    raw = market_contract.functions.get_market(0).return_value
    data = json.loads(raw)
    assert data["yes_pool"] == stake_amount
    assert data["no_pool"] == 0
    assert data["yes_pct"] == 100  # 100% YES vì no_pool = 0


def test_place_stake_both_sides(market_contract, genlayer_test):
    """Cả YES và NO đều đặt cược, odds tính đúng."""
    deadline = genlayer_test.get_timestamp() + 3600
    market_contract.functions.create_market(
        "Test question for two-sided staking?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        deadline,
    )

    alice = genlayer_test.accounts[1]
    bob = genlayer_test.accounts[2]

    market_contract.functions.place_stake(0, True, sender=alice, value=3_000_000)
    market_contract.functions.place_stake(0, False, sender=bob, value=1_000_000)

    raw = market_contract.functions.get_market(0).return_value
    data = json.loads(raw)

    assert data["yes_pool"] == 3_000_000
    assert data["no_pool"] == 1_000_000
    assert data["total_pool"] == 4_000_000
    assert data["yes_pct"] == 75  # 3/4 = 75%


def test_get_user_stake(market_contract, genlayer_test):
    """get_user_stake trả về đúng thông tin stake của user."""
    deadline = genlayer_test.get_timestamp() + 3600
    market_contract.functions.create_market(
        "Test question?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        deadline,
    )

    alice = genlayer_test.accounts[1]
    market_contract.functions.place_stake(0, True, sender=alice, value=500_000)
    market_contract.functions.place_stake(0, False, sender=alice, value=200_000)

    raw = market_contract.functions.get_user_stake(0, str(alice)).return_value
    data = json.loads(raw)
    assert data["yes_stake"] == 500_000
    assert data["no_stake"] == 200_000
    assert data["claimed"] is False


# ─────────────────────────────────────────────────────────────
#  Test: Resolution (mock web + LLM)
# ─────────────────────────────────────────────────────────────

def test_resolve_market_yes(market_contract, genlayer_test):
    """
    Resolution trả về YES khi evidence ủng hộ YES.
    Dùng mock web.render và exec_prompt trong môi trường test.
    """
    # Tạo market với deadline trong quá khứ (để test resolve ngay)
    deadline = genlayer_test.get_timestamp() - 1  # đã qua deadline

    market_contract.functions.create_market(
        "Was Oppenheimer critically acclaimed?",
        json.dumps([
            "https://www.rottentomatoes.com/m/oppenheimer_2023",
            "https://www.metacritic.com/movie/oppenheimer/",
        ]),
        deadline,
    )

    # Mock: web.render trả về review tích cực
    genlayer_test.mock_web_render(
        "https://www.rottentomatoes.com/m/oppenheimer_2023",
        "Oppenheimer is a cinematic masterpiece. Critics universally praised Nolan's direction. Score: 93%",
    )
    genlayer_test.mock_web_render(
        "https://www.metacritic.com/movie/oppenheimer/",
        "Oppenheimer receives universal acclaim with a Metascore of 88. A landmark achievement in filmmaking.",
    )

    # Mock: LLM trả về YES
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.95, "reasoning": "Both sources confirm strong critical acclaim."})
    )

    market_contract.functions.resolve_market(0)

    raw = market_contract.functions.get_market(0).return_value
    data = json.loads(raw)
    assert data["resolved"] is True
    assert data["outcome"] == "YES"
    assert len(data["reasoning"]) > 0


def test_resolve_market_no(market_contract, genlayer_test):
    """Resolution trả về NO khi evidence phủ nhận."""
    deadline = genlayer_test.get_timestamp() - 1

    market_contract.functions.create_market(
        "Was the movie Cats (2019) considered a masterpiece?",
        json.dumps([
            "https://www.rottentomatoes.com/m/cats_2019",
            "https://www.metacritic.com/movie/cats/",
        ]),
        deadline,
    )

    genlayer_test.mock_web_render(
        "https://www.rottentomatoes.com/m/cats_2019",
        "Cats (2019) bombed critically. Rotten Tomatoes score: 19%. Critics called it a disaster.",
    )
    genlayer_test.mock_web_render(
        "https://www.metacritic.com/movie/cats/",
        "Metascore 32. Universal panning from critics. A catastrophic failure.",
    )
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "NO", "confidence": 0.98, "reasoning": "Evidence clearly shows critical failure."})
    )

    market_contract.functions.resolve_market(0)

    raw = market_contract.functions.get_market(0).return_value
    data = json.loads(raw)
    assert data["resolved"] is True
    assert data["outcome"] == "NO"


# ─────────────────────────────────────────────────────────────
#  Test: Claim payout
# ─────────────────────────────────────────────────────────────

def test_claim_payout_winner(market_contract, genlayer_test):
    """Người đặt YES thắng khi outcome = YES, nhận payout đúng tỷ lệ."""
    deadline = genlayer_test.get_timestamp() - 1

    market_contract.functions.create_market(
        "Test claim payout?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        deadline,
    )

    alice = genlayer_test.accounts[1]
    bob = genlayer_test.accounts[2]

    # Alice đặt YES = 3M, Bob đặt NO = 1M
    market_contract.functions.place_stake(0, True, sender=alice, value=3_000_000)
    market_contract.functions.place_stake(0, False, sender=bob, value=1_000_000)

    # Resolve YES
    genlayer_test.mock_web_render("https://source1.com", "Strong evidence for YES verdict here.")
    genlayer_test.mock_web_render("https://source2.com", "Additional evidence confirming YES outcome.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.9, "reasoning": "Evidence supports YES."})
    )
    market_contract.functions.resolve_market(0)

    # Alice claim: (3M / 3M) * 4M = 4M
    alice_balance_before = genlayer_test.get_balance(alice)
    market_contract.functions.claim_payout(0, sender=alice)
    alice_balance_after = genlayer_test.get_balance(alice)

    assert alice_balance_after - alice_balance_before == 4_000_000


def test_claim_payout_no_opponent(market_contract, genlayer_test):
    """Khi pool đối ứng = 0, hoàn 100% stake."""
    deadline = genlayer_test.get_timestamp() - 1

    market_contract.functions.create_market(
        "Test zero opponent pool?",
        json.dumps(["https://source1.com", "https://source2.com"]),
        deadline,
    )

    alice = genlayer_test.accounts[1]
    market_contract.functions.place_stake(0, True, sender=alice, value=2_000_000)
    # Không có ai đặt NO

    genlayer_test.mock_web_render("https://source1.com", "Evidence for YES is clear and compelling.")
    genlayer_test.mock_web_render("https://source2.com", "More YES evidence from second source.")
    genlayer_test.mock_exec_prompt(
        json.dumps({"verdict": "YES", "confidence": 0.85, "reasoning": "YES is supported."})
    )
    market_contract.functions.resolve_market(0)

    alice_balance_before = genlayer_test.get_balance(alice)
    market_contract.functions.claim_payout(0, sender=alice)
    alice_balance_after = genlayer_test.get_balance(alice)

    # Hoàn 100% stake vì không có đối ứng
    assert alice_balance_after - alice_balance_before == 2_000_000
