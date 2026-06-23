# TruthMarket — Sàn Dự Đoán Sự Kiện Chủ Quan trên GenLayer

> **"TruthMarket chết ngay nếu rút AI ra:** không có `gl.nondet.web.render` + `gl.nondet.exec_prompt`, không có cách nào trên đời để một smart contract tự đọc hiểu hàng trăm bài báo/review và tự đưa ra phán quyết về một câu hỏi định tính — đây là việc loài người vẫn phải dùng trọng tài/ban giám khảo để làm."

[![GenLayer](https://img.shields.io/badge/Built%20on-GenLayer-6C63FF)](https://studio.genlayer.com)
[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Vercel-black)](https://frontend-six-beige-93.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌐 Live Demo

**Frontend:** https://frontend-six-beige-93.vercel.app

**Deployed Contracts (GenLayer Studionet):**
| Contract | EVM Address |
|---|---|
| Market | `0x0ba8A1f3A816236237CE4d2a9FE1633a00dd81bD` |
| MarketRegistry | `0x6E42C8CB8900e46A72D1f062AAed065A1F365998` |
| DisputeResolver | `0xF6AA9BfA8358294d72d2a68E44b70B79a6789df8` |

---

## 🔍 Vấn Đề

Các prediction market truyền thống (Polymarket, Augur) chỉ giải quyết được câu hỏi **có đáp án khách quan** — giá BTC, tỉ số bóng đá, kết quả bầu cử. Họ dùng oracle giá, API thể thao, và vẫn cần trọng tài con người cho bất kỳ câu hỏi nào liên quan đến **đánh giá/nhận định**.

Câu hỏi như:
- *"Liệu giới phê bình có gọi phim X là một kiệt tác?"*
- *"Liệu phát ngôn của nhân vật Y có bị cộng đồng coi là phân biệt chủng tộc?"*
- *"Liệu album mới của Taylor Swift có được coi là bước ngoặt trong sự nghiệp cô ấy?"*

...không có oracle nào trả lời được. Cần người đọc báo, cần AI hiểu ngữ cảnh văn hóa, cần phán quyết định tính.

**TruthMarket** giải quyết bằng cách dùng GenLayer's Intelligent Contract: AI tự đọc web, tự ra phán quyết, và consensus của các validator đảm bảo tính trung lập.

---

## ⚙️ Kiến Trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    TruthMarket Architecture                   │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Next.js)          ←→  genlayer-js SDK             │
│  ├─ Market List & Detail                                      │
│  ├─ Stake YES/NO (payable)                                    │
│  ├─ Trigger AI Resolution                                     │
│  └─ Claim Payout                                              │
├─────────────────────────────────────────────────────────────┤
│  GenLayer Intelligent Contracts (Python + GenVM)             │
│  ├─ market.py           — core market logic + AI resolution  │
│  ├─ market_registry.py  — on-chain market registry           │
│  └─ dispute_resolver.py — appeal + bond system               │
├─────────────────────────────────────────────────────────────┤
│  GenLayer AI Stack (nondet context)                          │
│  ├─ gl.nondet.web.render()    — scrape web evidence          │
│  ├─ gl.nondet.exec_prompt()   — LLM verdict generation       │
│  └─ gl.eq_principle           — multi-validator consensus    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Deploy Contracts

```bash
cd frontend
npm install
node scripts_deploy.mjs
```

Script tự động:
1. Deploy `market.py` → chờ finalization → lấy EVM address
2. Deploy `market_registry.py` với Market EVM address
3. Deploy `dispute_resolver.py` với Market EVM address
4. Lưu kết quả vào `deployed_addresses.json` + `.env.local`

### Run Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

```env
NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS=<market_evm_address>
NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS=<registry_evm_address>
NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS=<resolver_evm_address>
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_CHAIN_ID=61999
```

---

## 📋 Contract API

### market.py

| Function | Type | Description |
|---|---|---|
| `create_market(question, sources_json, deadline)` | write | Tạo market mới |
| `place_stake(market_id, side)` | write payable | Đặt cược YES/NO |
| `resolve_market(market_id)` | write (AI) | AI đọc web + ra phán quyết |
| `claim_payout(market_id)` | write | Nhận thưởng nếu thắng |
| `override_outcome(market_id, ...)` | write | DisputeResolver gọi khi appeal thắng |
| `get_market(market_id)` | view | Chi tiết market |
| `get_all_markets_summary()` | view | Danh sách tất cả market |
| `get_user_stake(market_id, address)` | view | Stake của user |

### Resolution Flow (AI)

```python
# Inside resolve_market — runs on GenLayer validators with consensus
def leader_fn():
    sources = json.loads(sources_json)
    for url in sources:
        page_text = gl.nondet.web.render(url, mode="text")  # scrape web
        evidence_chunks.append(page_text[:2500])
    
    raw = gl.nondet.exec_prompt(prompt, response_format="json")  # LLM verdict
    return json.dumps(raw, sort_keys=True)

result_str = gl.eq_principle.prompt_comparative(
    leader_fn,
    principle="Two results are equivalent if they have the same 'verdict' value."
)
verdict = json.loads(result_str)["verdict"]  # "YES" or "NO"
```

---

## 🔬 GenVM Patterns Discovered (Bisection Testing)

Qua >15 vòng bisection test, các pattern sau được **empirically confirmed**:

| Pattern | Status | Note |
|---|---|---|
| `TreeMap[str, str]` | ✅ Works | Proven stable pattern |
| `u256` scalar field | ✅ Works | Standard storage |
| `bool` in TreeMap | ✅ Works | Bool value works |
| `json.loads()` in write | ✅ Works | On memory objects |
| `isinstance()` in write | ✅ Works | On memory objects |
| `raise Exception("...")` | ✅ Works | Standard error |
| `gl.message.sender_address` | ✅ Works | NOT `sender_account` |
| `gl.block.timestamp` | ❌ FAILS | Not in write context |
| `gl.message.datetime` | ❌ NOT EXISTS | No timestamp in gl.message |
| Deadline enforce on-chain | ❌ NO API | Must be client-side |

---

## 📁 Project Structure

```
truthmarket/
├── contracts/
│   ├── market.py           # Core market + AI resolution
│   ├── market_registry.py  # Registry with cross-contract calls
│   └── dispute_resolver.py # Appeal system
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router pages
│   │   ├── components/     # React components
│   │   ├── hooks/          # Contract interaction hooks
│   │   └── lib/            # genlayer-js client setup
│   ├── scripts_deploy.mjs  # Automated deploy script
│   └── vercel.json         # Vercel config
├── tests/
│   ├── test_market_happy_path.py
│   ├── test_market_edge_cases.py
│   └── test_dispute_flow.py
└── deployed_addresses.json # Current deployed contract addresses
```

---

## 📜 License

MIT License — xem [LICENSE](LICENSE)