"""A Custom module's secrets, in the encrypted `custom_secrets` table (ADRs 0004, 0008).

Each is sealed with the host it was entered for. If the module's source host
changes, the row is dropped the first time that is noticed and the secret reads
as missing, so a token is never sent anywhere it wasn't entered for. A module
whose file is gone loses its rows too. Values leave this module only as the
argument to a pull; nothing here logs one.
"""

import logging

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import yaml_config
from app.config import settings
from app.custom import crypto, loader
from app.custom.loader import Module
from app.models import CustomSecret
from app.setup.secrets import FIELDS

log = logging.getLogger(__name__)

MAX_LENGTH = 4096


async def read(session: AsyncSession, module: Module) -> dict[str, str]:
    """The declared secrets that are set and usable for this module's host: name -> value."""
    if not module.secrets or module.host is None:
        return {}
    rows = (
        await session.execute(select(CustomSecret).where(CustomSecret.module == module.id))
    ).scalars().all()
    out: dict[str, str] = {}
    stale = []
    for row in rows:
        if row.name not in module.secrets or row.host != module.host:
            stale.append(row)
            continue
        try:
            out[row.name] = crypto.unseal(
                settings.atlas_secret_key, row.ciphertext, module=row.module, name=row.name, host=row.host
            )
        except (crypto.SecretUnreadable, crypto.SecretKeyMissing) as exc:
            log.warning("secret %s/%s can't be opened (%s); enter it again", row.module, row.name, exc)
    # Undeclared names are left alone: a typo in the file shouldn't cost the token.
    dropped = [r for r in stale if r.name in module.secrets]
    if dropped:
        log.info("custom/%s: source host changed, dropping %s", module.id, ", ".join(r.name for r in dropped))
        for row in dropped:
            await session.execute(
                delete(CustomSecret).where(CustomSecret.module == row.module, CustomSecret.name == row.name)
            )
        await session.commit()
    return out


async def put(session: AsyncSession, module: Module, name: str, value: str) -> None:
    assert module.host is not None
    await session.execute(
        delete(CustomSecret).where(CustomSecret.module == module.id, CustomSecret.name == name)
    )
    ciphertext = crypto.seal(
        settings.atlas_secret_key, module=module.id, name=name, host=module.host, value=value
    )
    session.add(CustomSecret(module=module.id, name=name, host=module.host, ciphertext=ciphertext))
    await session.commit()


async def remove(session: AsyncSession, module_id: str, name: str) -> None:
    await session.execute(
        delete(CustomSecret).where(CustomSecret.module == module_id, CustomSecret.name == name)
    )
    await session.commit()


async def prune(session: AsyncSession) -> None:
    """Drop the secrets of every module whose file is gone. First-party rows are kept."""
    on_disk = {p.stem for p in loader.files(yaml_config.CONFIG_DIR)}
    first_party = {module for module, _ in FIELDS}
    rows = (await session.execute(select(CustomSecret.module).distinct())).scalars().all()
    gone = [m for m in rows if m not in on_disk and m not in first_party]
    if gone:
        log.info("custom: dropping the secrets of removed module(s) %s", ", ".join(gone))
        await session.execute(delete(CustomSecret).where(CustomSecret.module.in_(gone)))
        await session.commit()
