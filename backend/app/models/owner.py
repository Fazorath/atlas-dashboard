"""The Owner (ADR 0008): one row, created when the install is claimed.

The passphrase is kept as a stdlib scrypt hash. `generation` goes into every
unlock cookie; bumping it (a new passphrase, or `python -m app.owner reset`)
makes every cookie already handed out worthless.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Owner(Base):
    __tablename__ = "owner"

    #: Always 1 — an install has one Owner until M2 brings accounts.
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: `scrypt$n$r$p$salt$hash`, or "" after a reset: claimed again with a code.
    passphrase_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
