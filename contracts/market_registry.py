# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
TruthMarket — MarketRegistry v6 (FINAL)
Safe types only: TreeMap[str, str], no bool/u256 values, no u256 scalars.
"""
import json
from genlayer import *


class Contract(gl.Contract):
    registry_question:   TreeMap[str, str]
    registry_creator:    TreeMap[str, str]
    registry_deadline:   TreeMap[str, str]   # str(int unix ts)
    registry_created_at: TreeMap[str, str]   # str(int unix ts)

    # config/counter stored as str in TreeMap (u256 scalar doesn't persist)
    state: TreeMap[str, str]  # state["count"], state["market_addr"], state["owner"]

    def __init__(self, market_contract_addr: str):
        self.registry_question   = TreeMap()
        self.registry_creator    = TreeMap()
        self.registry_deadline   = TreeMap()
        self.registry_created_at = TreeMap()
        self.state               = TreeMap()
        self.state["count"]        = "0"
        self.state["market_addr"]  = market_contract_addr
        self.state["owner"]        = str(gl.message.sender_address)

    @gl.public.write
    def set_market_contract(self, new_address: str) -> None:
        if str(gl.message.sender_address) != self.state.get("owner", ""):
            raise gl.UserError("ONLY_OWNER")
        self.state["market_addr"] = new_address

    @gl.public.write
    def register_market(
        self,
        question: str,
        sources_json: str,
        deadline_timestamp: u256,
    ) -> u256:
        market_addr = self.state.get("market_addr", "")
        if not market_addr:
            raise gl.UserError("MARKET_CONTRACT_NOT_SET")

        if int(deadline_timestamp) <= int(gl.block.timestamp):
            raise gl.UserError("DEADLINE_MUST_BE_FUTURE")

        try:
            sources = json.loads(sources_json)
            if not isinstance(sources, list) or len(sources) < 2:
                raise gl.UserError("NEED_AT_LEAST_2_SOURCES")
        except (json.JSONDecodeError, TypeError):
            raise gl.UserError("INVALID_SOURCES_JSON")

        # Cross-contract call into Market
        market_contract = gl.get_contract_at(Address(market_addr))
        market_id = market_contract.create_market(question, sources_json, deadline_timestamp)

        reg_id = str(int(self.state.get("count", "0")))
        self.registry_question[reg_id]   = question
        self.registry_creator[reg_id]    = str(gl.message.sender_address)
        self.registry_deadline[reg_id]   = str(int(deadline_timestamp))
        self.registry_created_at[reg_id] = str(int(gl.block.timestamp))
        self.state["count"] = str(int(reg_id) + 1)

        return market_id

    @gl.public.view
    def get_registry_count(self) -> u256:
        return u256(int(self.state.get("count", "0")))

    @gl.public.view
    def get_market_contract(self) -> str:
        return self.state.get("market_addr", "")

    @gl.public.view
    def get_registry_entry(self, reg_id: u256) -> str:
        rid = str(int(reg_id))
        return json.dumps({
            "question":   self.registry_question.get(rid, ""),
            "creator":    self.registry_creator.get(rid, ""),
            "deadline":   int(self.registry_deadline.get(rid, "0")),
            "created_at": int(self.registry_created_at.get(rid, "0")),
        })

