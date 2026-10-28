"""One module per upstream integration.

Each (weather.py, securo.py, audiobookshelf.py, …) keeps its provider-specific parsing to itself and exposes a small internal
shape, so swapping a provider is a one-module change.
"""


class Unreachable(RuntimeError):
    """Nothing answered at the address: a network problem, not a bad setting.
    Setup's Test turns it into "can't reach …" with a link to the networking
    docs (app/setup/probes)."""
