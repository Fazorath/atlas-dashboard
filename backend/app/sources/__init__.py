"""One module per upstream integration.

Phase 2 adds weather.py, Phase 3 securo.py, Phase 4 audiobookshelf.py. Each
keeps its provider-specific parsing to itself and exposes a small internal
shape, so swapping a provider is a one-module change.
"""
