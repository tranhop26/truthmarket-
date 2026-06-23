# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

class Contract(gl.Contract):
    variable: str
    market_count: u256
    markets_question: TreeMap[str, str]
    markets_deadline: TreeMap[str, str]   # deadline lưu dạng str(int unix ts)
    markets_resolved: TreeMap[str, bool]

    def __init__(self):
        self.variable = "initial value"
        self.market_count = u256(0)
        self.markets_question = TreeMap()
        self.markets_deadline = TreeMap()
        self.markets_resolved = TreeMap()

    @gl.public.write
    def add_market(self, q: str, deadline: u256) -> u256:
        if int(deadline) <= int(gl.block.timestamp):
            raise gl.UserError("DEADLINE_MUST_BE_FUTURE")
        mid = str(int(self.market_count))
        self.markets_question[mid] = q
        self.markets_deadline[mid] = str(int(deadline))
        self.markets_resolved[mid] = False
        self.market_count = u256(int(self.market_count) + 1)
        return self.market_count

    @gl.public.view
    def get_count(self) -> u256:
        return self.market_count

    @gl.public.view
    def read_method(self) -> str:
        return self.variable
