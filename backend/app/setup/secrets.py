"""First-party secrets entered in Setup, in the encrypted `custom_secrets` table.

Rows are keyed (module, name) like a Custom module's — first-party ids are
reserved, so the two never collide — and sealed with the host they were
entered for (ADR 0008): Securo's password and Audiobookshelf's token are bound
to their URL's host; Canvas's feed URL and Google's client secret to none ("").
app/config leaves a bound secret out whenever its URL points somewhere else.
"""

import logging

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import live
from app.config import APP_SECRETS, settings
from app.custom import crypto
from app.models import CustomSecret

log = logging.getLogger(__name__)

#: (module, secret name) <-> Settings field, for every secret Setup asks for.
FIELDS: dict[tuple[str, str], str] = {
    ("securo", "password"): "securo_password",
    ("audiobookshelf", "token"): "abs_token",
    ("canvas", "ics_url"): "canvas_ics_url",
    ("google_health", "client_secret"): "google_oauth_client_secret",
}
assert set(FIELDS.values()) == set(APP_SECRETS)


async def load(session: AsyncSession) -> dict[str, tuple[str, str]]:
    """Every stored first-party secret, opened: field -> (host, value)."""
    rows = (await session.execute(select(CustomSecret))).scalars()
    out: dict[str, tuple[str, str]] = {}
    for row in rows:
        field = FIELDS.get((row.module, row.name))
        if field is None:
            continue  # a Custom module's
        try:
            value = crypto.unseal(
                settings.atlas_secret_key,
                row.ciphertext,
                module=row.module,
                name=row.name,
                host=row.host,
            )
        except (crypto.SecretUnreadable, crypto.SecretKeyMissing) as exc:
            log.warning(
                "secret %s/%s can't be opened (%s); enter it again", row.module, row.name, exc
            )
            continue
        out[field] = (row.host, value)
    return out


async def stored_host(session: AsyncSession, module: str, name: str) -> str | None:
    row = await session.get(CustomSecret, (module, name))
    return None if row is None else row.host


async def save(session: AsyncSession, module: str, name: str, host: str, value: str) -> None:
    await session.execute(
        delete(CustomSecret).where(CustomSecret.module == module, CustomSecret.name == name)
    )
    ciphertext = crypto.seal(
        settings.atlas_secret_key, module=module, name=name, host=host, value=value
    )
    session.add(CustomSecret(module=module, name=name, host=host, ciphertext=ciphertext))


async def clear(session: AsyncSession, module: str, name: str) -> None:
    await session.execute(
        delete(CustomSecret).where(CustomSecret.module == module, CustomSecret.name == name)
    )


async def apply(session: AsyncSession) -> None:
    """Commit, then make the stored secrets the ones `settings` uses."""
    await session.commit()
    live.set_secrets(await load(session))
