"""Sealing secrets entered in the app with ATLAS_SECRET_KEY (ADRs 0004, 0008).

The key in `.env` is any long random string; a Fernet key is derived from it
with HKDF under a purpose label, so the same `.env` value also signs the
Owner's unlock cookie (app/owner.py) under a different label without the two
uses ever sharing key material.

What gets sealed is not just the value but the row it belongs to — module,
secret name and bound host. Copying a ciphertext into another row (say, onto
a module that points somewhere else) therefore fails to open instead of
quietly sending one app's token to another.
"""

import base64
import json
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MIN_KEY_LENGTH = 32
_PURPOSE = b"atlas/custom-secrets/v1"


class SecretKeyMissing(RuntimeError):
    """ATLAS_SECRET_KEY is unset or too short to be a key."""


class SecretUnreadable(RuntimeError):
    """Wrong key, a tampered row, or a row moved from where it was sealed."""


def check_key(key: str) -> None:
    if len(key.strip()) < MIN_KEY_LENGTH:
        raise SecretKeyMissing(
            "Set ATLAS_SECRET_KEY in .env to a random string of at least "
            f"{MIN_KEY_LENGTH} characters (e.g. `openssl rand -base64 32`), "
            "then run docker compose up -d atlas-api."
        )


def subkey(key: str, purpose: bytes) -> bytes:
    """32 bytes of key material for one use of ATLAS_SECRET_KEY."""
    check_key(key)
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=purpose).derive(
        key.strip().encode()
    )


@lru_cache(maxsize=4)
def _fernet(key: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(subkey(key, _PURPOSE)))


def seal(key: str, *, module: str, name: str, host: str, value: str) -> str:
    payload = json.dumps({"m": module, "n": name, "h": host, "v": value}).encode()
    return _fernet(key).encrypt(payload).decode()


def unseal(key: str, token: str, *, module: str, name: str, host: str) -> str:
    try:
        payload = json.loads(_fernet(key).decrypt(token.encode()))
    except (InvalidToken, ValueError) as exc:
        raise SecretUnreadable("secret can't be opened with this ATLAS_SECRET_KEY") from exc
    if (payload.get("m"), payload.get("n"), payload.get("h")) != (module, name, host):
        raise SecretUnreadable("secret was sealed for a different module, name or host")
    return payload["v"]
