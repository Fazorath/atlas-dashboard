"""Secrets the Owner enters in the app, sealed with ATLAS_SECRET_KEY.

crypto      Fernet sealing of the secrets entered in the app (ADR 0004)

Custom modules (config/custom/) build on this; so do first-party Modules'
secrets entered in Setup (app/setup, ADR 0008).
"""
