# TruthMarket — Sàn Dự Đoán Sự Kiện Chủ Quan trên GenLayer

> **"TruthMarket chết ngay nếu rút AI ra:** không có `gl.nondet.web.render` + `gl.nondet.exec_prompt`, không có cách nào trên đời để một smart contract tự đọc hiểu hàng trăm bài báo/review và tự đưa ra phán quyết về một câu hỏi định tính — đây là việc loài người vẫn phải dùng trọng tài/ban giám khảo để làm."

[![GenLayer](https://img.shields.io/badge/Built%20on-GenLayer-6C63FF)](https://studio.genlayer.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🎯 Vấn đề

Các prediction market truyền thống (Polymarket, Augur) chỉ giải quyết được câu hỏi **có đáp án khách quan** — giá BTC, tỷ số bóng đá, kết quả bầu cử. Họ dùng oracle giá, API thể thao, và vẫn cần trọng tài con người cho bất kỳ câu hỏi nào liên quan đến **đánh giá/nhận định**.

Câu hỏi như:
- *"Liệu giới phê bình có gọi phim X là một kiệt tác?"*
- *"Liệu phát ngôn của nhân vật Y có bị cộng đồng coi là phân biệt chủng tộc?"*
- *"Liệu album mới của Taylor Swift có được coi là bước ngoặt trong sự nghiệp cô ấy?"*

...không có oracle nào trả lời được. Cần người đọc báo, cần AI hiểu ngữ cảnh văn hóa, cần phán quyết định tính.

## 💡 Giải pháp: TruthMarket trên GenLayer

TruthMarket là prediction market **đầu tiên** dành riêng cho sự kiện chủ quan/văn hóa-xã hội. Khi đến hạn, Intelligent Contract **tự đọc internet** (báo chí, review, mạng xã hội) và **tự suy luận** ra phán quyết — không có trọng tài con người, không có oracle giá.

Cơ chế này chỉ khả thi trên **GenLayer** nhờ:
- `gl.nondet.web.render()` — đọc nội dung trang web thật trong contract
- `gl.nondet.exec_prompt()` — gọi LLM để phân tích bằng chứng
- `gl.eq_principle.prompt_comparative()` — đảm bảo nhiều validator đồng thuận theo ý nghĩa, không phải ký tự

---

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│               Frontend (Next.js + genlayer-js)                   │
│   Market List → Market Detail → Stake → Resolve → Claim         │
└───────────────┬────────────────────────────┬────────────────────┘
                │ read/write                  │ read/write
                ▼                             ▼
┌───────────────────────┐    ┌─────────────────────────────────┐
│    MarketRegistry     │    │       DisputeResolver            │
│  (factory/registry)   │    │   (appeal/escalation flow)       │
│                       │    │                                  │
│  - Liệt kê market     │    │  - raise_dispute() + bond        │
│  - Tạo market mới     │    │  - final_resolve() AI re-run     │
│  - Cross-contract     │    │  - Cross-contract override       │
└───────────┬───────────┘    └─────────────────┬────────────────┘
            │ cross-contract call               │ cross-contract call
            ▼                                   ▼
┌───────────────────────────────────────────────────────────────┐
│                         Market (Core)                          │
│                                                                │
│  create_market() ─── Tạo market với câu hỏi + nguồn URL      │
│  place_stake()   ─── Đặt cược YES/NO (payable)                │
│  resolve_market()─── ⚡ AI Resolution Engine ⚡               │
│  claim_payout()  ─── Nhận thưởng (tỷ lệ pool)                │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               AI Resolution Engine                      │  │
│  │                                                         │  │
│  │  for url in sources:                                    │  │
│  │      page_text = gl.nondet.web.render(url)  ← ĐỌC WEB  │  │
│  │                                                         │  │
│  │  verdict = gl.nondet.exec_prompt(evidence)  ← LLM      │  │
│  │                                                         │  │
│  │  gl.eq_principle.prompt_comparative(...)    ← CONSENSUS │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Các contract:
| Contract | File | Vai trò |
|---|---|---|
| `Market` | `contracts/market.py` | Lõi — staking, AI resolution, payout |
| `MarketRegistry` | `contracts/market_registry.py` | Factory/registry — liệt kê và tạo market |
| `DisputeResolver` | `contracts/dispute_resolver.py` | Escalation — xử lý kháng nghị phán quyết |

---

## 🚀 Deploy lên GenLayer Testnet

### Yêu cầu
- Trình duyệt truy cập được [GenLayer Studio](https://studio.genlayer.com/run-debug)
- Tài khoản testnet GenLayer (tạo trong Studio)

### Quy trình deploy (theo đúng thứ tự)

#### Bước 1: Reset môi trường Studio
```
1. Mở https://studio.genlayer.com/run-debug
2. Settings → Reset Storage → Confirm
3. Hard refresh (Ctrl+Shift+R hoặc Cmd+Shift+R)
```

#### Bước 2: Deploy `market.py` (Contract chính)
```
1. Load file contracts/market.py vào Studio
2. Constructor arg: registry_addr = "" (chuỗi rỗng)
3. Click Deploy → chờ Status: FINALIZED
4. QUAN TRỌNG: Click vào transaction → xác nhận Result: SUCCESS
   (FINALIZED ≠ SUCCESS — phải kiểm tra cả hai)
5. Copy địa chỉ contract → lưu làm MARKET_ADDRESS
```

#### Bước 3: Deploy `market_registry.py`
```
1. Load file contracts/market_registry.py
2. Constructor arg: market_contract_addr = "MARKET_ADDRESS"
3. Deploy → xác nhận Result: SUCCESS
4. Copy địa chỉ → lưu làm REGISTRY_ADDRESS
```

#### Bước 4: Deploy `dispute_resolver.py`
```
1. Load file contracts/dispute_resolver.py
2. Constructor args:
   - market_contract_addr = "MARKET_ADDRESS"
   - dispute_window_hours = 2
   - min_bond_amount = 100000
3. Deploy → xác nhận Result: SUCCESS
4. Copy địa chỉ → lưu làm RESOLVER_ADDRESS
```

#### Bước 5: Test resolution trên Studio
```python
# Tạo market test với deadline trong quá khứ
create_market(
    question="Was Christopher Nolan's Oppenheimer critically acclaimed?",
    sources_json='["https://www.rottentomatoes.com/m/oppenheimer_2023", "https://www.metacritic.com/movie/oppenheimer/"]',
    deadline_timestamp=1700000000  # timestamp trong quá khứ
)

# Resolve → AI đọc 2 URL thật, gọi LLM, đạt đồng thuận
resolve_market(market_id=0)

# Đọc kết quả + lý do AI
get_market(market_id=0)
```

#### Bước 6: Chạy deploy script (tùy chọn)
```bash
python scripts/deploy.py
```

---

## 🧪 Chạy Tests

```bash
# Cài dependencies
npm install -g @genlayer/cli

# Chạy từng bộ test
npx genlayer test tests/test_market_happy_path.py
npx genlayer test tests/test_market_edge_cases.py
npx genlayer test tests/test_dispute_flow.py
```

### Test coverage:
- ✅ Happy path: tạo market → stake → resolve → claim
- ✅ 9 edge cases: URL chết, JSON hỏng, double-claim, pre-deadline resolve,...
- ✅ Dispute flow: raise, final_resolve, bond thắng/thua, time window

---

## 💻 Chạy Frontend Local

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Cập nhật địa chỉ contract trong .env.local

npm run dev
# → http://localhost:3000
```

### Environment variables:
```env
NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS=0x...
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_CHAIN_ID=61999
```

---

## 🎮 Luồng sử dụng

```
1. Tạo market
   └─ Nhập câu hỏi định tính + URL nguồn + deadline

2. Đặt cược
   └─ Chọn YES hoặc NO + số tiền (GLT)
   └─ Xem odds realtime (tỷ lệ yes_pool / no_pool)

3. Chờ đến deadline

4. Resolve (bất kỳ ai cũng có thể gọi)
   └─ AI đọc từng URL nguồn
   └─ LLM phân tích bằng chứng
   └─ Đạt đồng thuận → ghi verdict + reasoning

5. Xem kết quả
   └─ Verdict: YES / NO
   └─ Reasoning: Lý do AI đưa ra (hiển thị đầy đủ)
   └─ Confidence: Độ tự tin của AI

6. Nhận thưởng
   └─ Người thắng claim payout theo tỷ lệ stake

7. (Tùy chọn) Kháng nghị
   └─ Raise dispute với bond + nguồn bổ sung
   └─ AI chạy lại với standard cao hơn
   └─ Kết quả binding cuối cùng
```

---

## 🛡️ Edge Cases được xử lý

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | URL chết / timeout | Bỏ qua, tiếp tục với nguồn còn lại |
| 2 | < 2 nguồn đọc được | `UserError("INSUFFICIENT_EVIDENCE")` |
| 3 | LLM trả JSON hỏng | `UserError("LLM_RESPONSE_PARSE_FAILED")` |
| 4 | verdict không phải YES/NO | `UserError("MALFORMED_VERDICT")` |
| 5 | Resolve lần 2 | `UserError("ALREADY_RESOLVED")` |
| 6 | Resolve trước deadline | `UserError("DEADLINE_NOT_REACHED")` |
| 7 | Stake value = 0 | `UserError("STAKE_MUST_BE_NONZERO")` |
| 8 | Double-claim payout | `UserError("ALREADY_CLAIMED")` |
| 9 | Pool đối ứng = 0 | Hoàn 100% stake, không chia 0 |

---

## 📁 Cấu trúc thư mục

```
truthmarket/
├── contracts/
│   ├── market.py              # Contract lõi — resolution engine
│   ├── market_registry.py     # Factory/registry
│   └── dispute_resolver.py    # Appeal flow
├── tests/
│   ├── test_market_happy_path.py  # Happy path tests
│   ├── test_market_edge_cases.py  # 9 edge case tests
│   └── test_dispute_flow.py       # Dispute/appeal tests
├── frontend/                  # Next.js app (genlayer-js)
├── scripts/
│   └── deploy.py              # Deploy script + checklist
├── deployed_addresses.json    # Địa chỉ contract sau khi deploy
└── README.md
```

---

## 🔗 Links

- **Live App:** [coming soon — Vercel deploy]
- **Testnet Contracts:** [xem deployed_addresses.json sau khi deploy]
- **Video Demo:** [coming soon]
- **GenLayer Studio:** https://studio.genlayer.com

---

## 📄 License

MIT — xem [LICENSE](LICENSE)