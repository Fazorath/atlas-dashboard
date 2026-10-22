# Custom modules declare their secrets; the owner enters them in the app

A Custom module that pulls an authenticated API (Pi-hole, Home Assistant, Uptime Kuma) lists the secrets it needs in its YAML (`secrets: [token]`) and refers to them by name (`{{secrets.token}}`). When the module is added, Atlas asks for each one in the app and stores the values apart from the YAML: never written into the file, never shown again, never exported with it. A value may instead be `${ENV_VAR}`, read from `.env`. This amends ADR 0003, where secrets lived only in `.env`.

## Considered Options

- `.env` only, referenced from the YAML (Homepage's approach) — rejected: adding a module from the phone would end with SSH, edit `.env`, restart, which defeats adding modules from the app.
- Secrets inline in the YAML — rejected: every shared or exported module file would leak its owner's keys.

## Consequences

- A Custom module's YAML is always safe to share; the secrets are a separate, per-install thing.
- Atlas now holds credentials for other apps, so it needs a place to keep them that isn't the YAML. This is the first slice of M2's per-connection credentials.
- A secret is bound to the host it was entered for. Changing a module's URL to another host drops its secrets and asks again, so editing a module can't send its token somewhere new.
- Only the Owner (proven by a passphrase set in `.env`, until M2 brings accounts) may add or change Custom modules or enter secrets.
