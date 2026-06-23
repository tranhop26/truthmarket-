"""
TruthMarket — Deploy Script

Hướng dẫn deploy 3 contract lên GenLayer testnet theo đúng thứ tự.

Thứ tự deploy:
    1. market.py         → lấy MARKET_ADDRESS
    2. market_registry.py (truyền MARKET_ADDRESS) → lấy REGISTRY_ADDRESS
    3. dispute_resolver.py (truyền MARKET_ADDRESS) → lấy RESOLVER_ADDRESS

Sau khi deploy, cập nhật địa chỉ vào frontend/.env.local

Yêu cầu:
    - Cài genlayer CLI: npm install -g @genlayer/cli
    - Có file .env với GENLAYER_PRIVATE_KEY và GENLAYER_RPC_URL

Chạy: python scripts/deploy.py
"""

import json
import os
import subprocess
import sys
from datetime import datetime


# ─────────────────────────────────────────────────────────────
#  Cấu hình
# ─────────────────────────────────────────────────────────────

GENLAYER_RPC_URL = os.environ.get("GENLAYER_RPC_URL", "https://studio.genlayer.com/api")
GENLAYER_PRIVATE_KEY = os.environ.get("GENLAYER_PRIVATE_KEY", "")

# Tham số constructor
DISPUTE_WINDOW_HOURS = 2        # 2 giờ cửa sổ kháng nghị
MIN_BOND_AMOUNT = 100_000       # 100,000 wei tối thiểu để raise dispute

# Đường dẫn file output địa chỉ
ADDRESSES_FILE = "deployed_addresses.json"
ENV_FILE = "frontend/.env.local"


# ─────────────────────────────────────────────────────────────
#  Helper: chạy CLI command
# ─────────────────────────────────────────────────────────────

def run_deploy(contract_file: str, args: list, rpc_url: str, private_key: str) -> str:
    """
    Gọi genlayer CLI để deploy một contract.
    Trả về địa chỉ contract vừa deploy.

    NOTE: Đây là placeholder — thay bằng lệnh CLI thật của genlayer khi dùng.
    Trên Studio, deploy thủ công theo quy trình ở Mục 5 của spec.
    """
    print(f"\n[DEPLOY] {contract_file}")
    print(f"  Args: {args}")
    print(f"  RPC:  {rpc_url}")

    # TODO: thay bằng genlayer CLI thật
    # Ví dụ lệnh (tùy theo phiên bản CLI):
    # cmd = [
    #     "genlayer", "deploy",
    #     "--contract", contract_file,
    #     "--args", json.dumps(args),
    #     "--rpc-url", rpc_url,
    #     "--private-key", private_key,
    # ]
    # result = subprocess.run(cmd, capture_output=True, text=True)
    # address = result.stdout.strip()

    print(f"  ✅ [MANUAL] Deploy {contract_file} qua Studio, nhập địa chỉ:")
    address = input("  Nhập contract address: ").strip()
    return address


# ─────────────────────────────────────────────────────────────
#  Pre-deploy checklist (tự động kiểm tra file)
# ─────────────────────────────────────────────────────────────

def check_contract_file(filepath: str) -> bool:
    """Kiểm tra pre-deploy checklist cho một file contract."""
    print(f"\n[CHECK] {filepath}")
    errors = []

    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Rule 1: Dòng 1 phải là # v0.2.16
    if not lines[0].strip() == "# v0.2.16":
        errors.append("❌ Dòng 1 phải là '# v0.2.16'")
    else:
        print("  ✅ Dòng 1: # v0.2.16")

    # Rule 1b: Dòng 2 phải có Depends hash
    if "Depends" not in lines[1]:
        errors.append("❌ Dòng 2 phải chứa # { \"Depends\": \"py-genlayer:...\" }")
    else:
        print("  ✅ Dòng 2: Depends hash")

    content = "".join(lines)

    # Rule 2: Không gán TreeMap()/DynArray() trong __init__
    if "TreeMap()" in content or "DynArray()" in content:
        errors.append("❌ Phát hiện TreeMap() hoặc DynArray() assignment — xóa khỏi __init__")
    else:
        print("  ✅ Không có TreeMap()/DynArray() assignment")

    # Rule 6: Class chính phải tên Contract
    if "class Contract(gl.Contract):" not in content:
        errors.append("❌ Thiếu 'class Contract(gl.Contract):'")
    else:
        print("  ✅ Class Contract(gl.Contract) tồn tại")

    # Rule 8: Import đúng cách
    if "from genlayer import *" not in content:
        errors.append("❌ Thiếu 'from genlayer import *'")
    else:
        print("  ✅ Import 'from genlayer import *'")

    # Rule 3: Không dùng float trong signature
    if ": float" in content:
        errors.append("❌ Phát hiện ': float' trong method signature — dùng int/u256")
    else:
        print("  ✅ Không có float trong signature")

    if errors:
        print("\n  ⚠️  LỖI PHÁT HIỆN:")
        for e in errors:
            print(f"  {e}")
        return False

    print("  ✅ Tất cả checklist PASS")
    return True


# ─────────────────────────────────────────────────────────────
#  Main deploy flow
# ─────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  TruthMarket — Deploy Script")
    print(f"  Thời điểm: {datetime.now().isoformat()}")
    print("=" * 60)

    contracts = [
        "contracts/market.py",
        "contracts/market_registry.py",
        "contracts/dispute_resolver.py",
    ]

    # Bước 1: Kiểm tra pre-deploy checklist
    print("\n📋 BƯỚC 1: Pre-deploy checklist")
    all_ok = True
    for c in contracts:
        if not check_contract_file(c):
            all_ok = False

    if not all_ok:
        print("\n❌ Fix các lỗi trên trước khi deploy!")
        sys.exit(1)

    print("\n✅ Tất cả contract đã qua checklist!")

    # Bước 2: Deploy Market (không cần arg)
    print("\n📦 BƯỚC 2: Deploy Market contract (market.py)")
    print("Hướng dẫn thủ công trên Studio:")
    print("  1. Mở https://studio.genlayer.com/run-debug")
    print("  2. Settings → Reset Storage → Hard refresh")
    print("  3. Load file contracts/market.py")
    print("  4. Nhập constructor arg: registry_addr = '' (chuỗi rỗng)")
    print("  5. Click Deploy → chờ FINALIZED")
    print("  6. Mở transaction sidebar → xác nhận Result: SUCCESS")

    market_address = input("\nNhập MARKET_ADDRESS sau khi deploy: ").strip()

    # Bước 3: Deploy MarketRegistry (cần market_address)
    print(f"\n📦 BƯỚC 3: Deploy MarketRegistry contract")
    print(f"  Constructor arg: market_contract_addr = '{market_address}'")

    registry_address = input("\nNhập REGISTRY_ADDRESS sau khi deploy: ").strip()

    # Bước 4: Deploy DisputeResolver (cần market_address)
    print(f"\n📦 BƯỚC 4: Deploy DisputeResolver contract")
    print(f"  Constructor args:")
    print(f"    market_contract_addr = '{market_address}'")
    print(f"    dispute_window_hours = {DISPUTE_WINDOW_HOURS}")
    print(f"    min_bond_amount = {MIN_BOND_AMOUNT}")

    resolver_address = input("\nNhập RESOLVER_ADDRESS sau khi deploy: ").strip()

    # Bước 5: Lưu địa chỉ
    addresses = {
        "network": "genlayer-testnet",
        "deployed_at": datetime.now().isoformat(),
        "contracts": {
            "market": market_address,
            "market_registry": registry_address,
            "dispute_resolver": resolver_address,
        }
    }

    with open(ADDRESSES_FILE, "w") as f:
        json.dump(addresses, f, indent=2)
    print(f"\n✅ Địa chỉ đã lưu vào {ADDRESSES_FILE}")

    # Bước 6: Cập nhật .env.local cho frontend
    env_content = f"""# TruthMarket — Frontend Environment
# Tự động tạo bởi scripts/deploy.py
# Deployed at: {datetime.now().isoformat()}

NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS={market_address}
NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS={registry_address}
NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS={resolver_address}
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_CHAIN_ID=61999
"""

    os.makedirs("frontend", exist_ok=True)
    with open(ENV_FILE, "w") as f:
        f.write(env_content)
    print(f"✅ .env.local đã cập nhật tại {ENV_FILE}")

    print("\n" + "=" * 60)
    print("  🎉 Deploy hoàn tất!")
    print("=" * 60)
    print(f"\nContract addresses:")
    print(f"  Market:          {market_address}")
    print(f"  MarketRegistry:  {registry_address}")
    print(f"  DisputeResolver: {resolver_address}")
    print(f"\nChạy frontend:")
    print(f"  cd frontend && npm run dev")


if __name__ == "__main__":
    main()
