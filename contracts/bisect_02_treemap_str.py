# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

class Contract(gl.Contract):
    variable: str
    market_count: u256
    markets_question: TreeMap[str, str]

    def __init__(self):
        self.variable = "initial value"
        self.market_count = u256(0)
        self.markets_question = TreeMap()

    @gl.public.view
    def read_method(self) -> str:
        return self.variable

    @gl.public.write
    def add_market(self, q: str) -> None:
        mid = str(int(self.market_count))
        self.markets_question[mid] = q
        self.market_count = u256(int(self.market_count) + 1)

    @gl.public.view
    def get_count(self) -> u256:
        return self.market_count
