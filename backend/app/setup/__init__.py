"""Setup: the guided first run, and the same forms on Status afterwards (ADR 0008).

files     writing config/*.yaml, keeping what it does not show
secrets   first-party secrets in the encrypted store, bound to a host
fields    each Module's form, declared once for the frontend to render
probes    each Module's Test: its sync's fetch, storing nothing
"""
