# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

class Contract(gl.Contract):
    variable: str
    market_count: u256

    def __init__(self):
        self.variable = "initial value"
        self.market_count = u256(0)

    @gl.public.view
    def read_method(self) -> str:
        return self.variable

    @gl.public.view
    def get_count(self) -> u256:
        return self.market_count
