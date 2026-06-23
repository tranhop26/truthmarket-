# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — MarketRegistry Contract (Factory/Registry)

Contract trung gian giúp frontend:
- Liệt kê tất cả market qua một địa chỉ duy nhất
- Tạo market mới thông qua cross-contract call vào Market contract
- Lưu metadata creator, question, và địa chỉ Market contract

Kiến trúc: Frontend → MarketRegistry → Market (cross-contract call)
"""

import json
from genlayer import *


class Contract(gl.Contract):
    # Địa chỉ Market contract chính
    market_contract_address: str

    # Metadata của từng market (mirror từ Market contract)
    registry_question: TreeMap[u256, str]
    registry_creator: TreeMap[u256, str]
    registry_deadline: TreeMap[u256, u256]
    registry_created_at: TreeMap[u256, u256]

    # Counter
    registry_count: u256

    # Owner (người deploy registry)
    owner: str

    def __init__(self, market_contract_addr: str):
        self.market_contract_address = market_contract_addr
        self.registry_question = TreeMap()
        self.registry_creator = TreeMap()
        self.registry_deadline = TreeMap()
        self.registry_created_at = TreeMap()
        self.registry_count = u256(0)
        self.owner = str(gl.message.sender_account)

    # =========================================================
    #  CẬP NHẬT ĐỊA CHỈ MARKET CONTRACT
    # =========================================================

    @gl.public.write
    def set_market_contract(self, new_address: str) -> None:
        """Chỉ owner mới được cập nhật địa chỉ Market contract."""
        if str(gl.message.sender_account) != self.owner:
            raise gl.UserError("ONLY_OWNER")
        self.market_contract_address = new_address

    # =========================================================
    #  TẠO MARKET (qua cross-contract call)
    # =========================================================

    @gl.public.write
    def create_market(
        self,
        question: str,
        sources_json: str,
        deadline_timestamp: u256,
    ) -> u256:
        """
        Tạo market mới thông qua Market contract.

        Lưu metadata vào registry, gọi cross-contract call vào Market.create_market().

        Returns:
            market_id vừa được tạo trong Market contract
        """
        if not self.market_contract_address:
            raise gl.UserError("MARKET_CONTRACT_NOT_SET")

        # Validate cơ bản trước khi gọi cross-contract
        if int(deadline_timestamp) <= int(gl.block.timestamp):
            raise gl.UserError("DEADLINE_MUST_BE_FUTURE")

        try:
            sources = json.loads(sources_json)
            if not isinstance(sources, list) or len(sources) < 2:
                raise gl.UserError("NEED_AT_LEAST_2_SOURCES")
        except (json.JSONDecodeError, TypeError):
            raise gl.UserError("INVALID_SOURCES_JSON")

        # Cross-contract call: gọi Market.create_market()
        market_contract = gl.get_contract_at(Address(self.market_contract_address))
        market_id = market_contract.create_market(question, sources_json, deadline_timestamp)

        # Lưu metadata vào registry
        reg_id = self.registry_count
        self.registry_question[reg_id] = question
        self.registry_creator[reg_id] = str(gl.message.sender_account)
        self.registry_deadline[reg_id] = deadline_timestamp
        self.registry_created_at[reg_id] = u256(int(gl.block.timestamp))

        self.registry_count = u256(int(self.registry_count) + 1)

        return market_id

    # =========================================================
    #  VIEW FUNCTIONS
    # =========================================================

    @gl.public.view
    def get_market_contract_address(self) -> str:
        """Trả về địa chỉ Market contract đang được dùng."""
        return self.market_contract_address

    @gl.public.view
    def get_registry_count(self) -> u256:
        """Tổng số market đã đăng ký."""
        return self.registry_count

    @gl.public.view
    def get_registry_entry(self, registry_id: u256) -> str:
        """Trả về metadata của một market trong registry."""
        if int(registry_id) >= int(self.registry_count):
            raise gl.UserError("REGISTRY_ENTRY_NOT_FOUND")

        data = {
            "registry_id": int(registry_id),
            "question": self.registry_question[registry_id],
            "creator": self.registry_creator[registry_id],
            "deadline": int(self.registry_deadline[registry_id]),
            "created_at": int(self.registry_created_at[registry_id]),
        }
        return json.dumps(data)

    @gl.public.view
    def list_recent_markets(self, limit: u256) -> str:
        """
        Liệt kê các market gần nhất (tối đa limit=50).
        Frontend dùng để hiển thị trang danh sách.
        """
        count = int(self.registry_count)
        max_limit = min(int(limit), 50)
        start = max(0, count - max_limit)

        markets = []
        for i in range(start, count):
            rid = u256(i)
            markets.append({
                "registry_id": i,
                "question": self.registry_question[rid],
                "creator": self.registry_creator[rid],
                "deadline": int(self.registry_deadline[rid]),
                "created_at": int(self.registry_created_at[rid]),
            })

        return json.dumps(markets)

    @gl.public.view
    def get_owner(self) -> str:
        """Trả về địa chỉ owner của registry."""
        return self.owner
