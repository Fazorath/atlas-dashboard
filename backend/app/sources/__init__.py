"""One module per upstream integration.

Each (weather.py, securo.py, audiobookshelf.py, …) keeps its provider-specific parsing to itself and exposes a small internal
shape, so swapping a provider is a one-module change.
"""
