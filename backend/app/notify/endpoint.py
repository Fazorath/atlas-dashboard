"""Which push endpoints Atlas will POST to. Used when a device subscribes and
again right before every send, so a row stored earlier gets the same check."""

import re
from urllib.parse import urlsplit

#: Hosts a browser's push service lives on (Chrome/Edge, Firefox, Safari,
#: Windows). Atlas POSTs to the endpoint, so anything else would let a caller
#: aim the server at an address on your network.
PUSH_HOSTS = (
    "fcm.googleapis.com",
    "push.services.mozilla.com",
    "push.apple.com",
    "notify.windows.com",
)

_HOST = re.compile(r"[a-z0-9.-]+")


def is_push_service(endpoint: str) -> bool:
    """True only for an https address on a push service host. Never raises.

    The raw string is checked for characters that `urlsplit` and `requests`
    read differently (a backslash, or whitespace that `urlsplit` strips), so
    the host read here is the host a request would connect to."""
    try:
        if any(c == "\\" or c.isspace() or not c.isprintable() for c in endpoint):
            return False
        parts = urlsplit(endpoint)
        if parts.scheme != "https" or "@" in parts.netloc:
            return False
        if parts.port not in (None, 443):
            return False
        host = parts.hostname or ""
    except ValueError:
        return False
    if not _HOST.fullmatch(host):
        return False
    return any(host == h or host.endswith("." + h) for h in PUSH_HOSTS)
