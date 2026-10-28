"""Secrets entered in the app — a Custom module's, or a first-party Module's
from Setup (ADRs 0004, 0008).

Never in a YAML file, never returned by any endpoint. `ciphertext` is
Fernet under ATLAS_SECRET_KEY and also seals module, name and host, so a
database dump alone reveals nothing and a row can't be moved to another one.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CustomSecret(Base):
    __tablename__ = "custom_secrets"

    module: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    #: The URL host the value was entered for. A source pointing anywhere else
    #: doesn't get it, and the row is dropped the first time that's noticed.
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
