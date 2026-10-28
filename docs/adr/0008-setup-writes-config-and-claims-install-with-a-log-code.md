# Setup writes config/ itself, keeps secrets in the encrypted store, and claims an install with a log code

Atlas gets a guided **Setup** (issue #14) so a fresh install needs no hand-edited YAML. Setup writes the same `config/atlas.yaml` and `config/modules/*.yaml` that you can still edit by hand, so `config/` is mounted read-write instead of `:ro`. Secrets entered in the app go to the encrypted `custom_secrets` store (ADR 0004, `ATLAS_SECRET_KEY`), never to `.env`; a variable set in `.env` still wins and shows as "Set in .env" in Settings. Saving applies at once, with no restart, and so does a hand edit. While an install has no Owner, the API prints a setup code to its log on every boot; Setup asks for it before the Owner passphrase can be created. The passphrase is stored hashed in the database, not in `.env`. After that, Setup's forms live on the Status screen and are Owner-only. A lost passphrase is reset from the host with `python -m app.owner reset`.

## Considered Options

- **A separate settings file or table that overrides the YAML.** Rejected. Two sources of truth, and hand-edited YAML would silently lose to the app's copy.
- **The app writes `.env`.** Rejected. Container env is fixed at start, so it needs a restart to take effect, and secrets in a plaintext file the app rewrites are worse than the encrypted store.
- **Limit claiming to localhost or the private network.** Rejected. Behind a reverse proxy or Tailscale serve every request looks local. A code only someone with the host's logs can read does not depend on how traffic arrives.
- **Passphrase in `.env` (`OWNER_PASSPHRASE`, as ADR 0004 first had it).** Rejected. Setup would end with "now edit `.env` and restart", and there would be two ways to become Owner.
- **Recover the passphrase by email or in the UI.** Rejected. There are no accounts and no mail; host access is the proof of ownership.
- **Generate `ATLAS_SECRET_KEY` automatically.** Rejected. Kept in the database it would undo the point of encrypting (a dump would reveal everything); kept in a file it is one more thing to back up. It is a required `.env` value beside `POSTGRES_PASSWORD`.

## Consequences

- The setup code is needed whenever there is no Owner, including existing installs that already have `config/atlas.yaml`, so nobody who merely reaches the URL can claim one. A fresh code is printed on each boot until the install is claimed, and it is discarded once the passphrase exists.
- The passphrase is hashed with stdlib `scrypt` (no new dependency). Changing or resetting it invalidates every unlock cookie; it does not touch stored secrets, which are keyed by `ATLAS_SECRET_KEY`.
- No `ATLAS_SECRET_KEY` (or one under 32 characters) stops the API at boot with the command to make one.
- The app rewrites YAML it wrote, so comments in a hand-edited file would be lost. Setup only rewrites files it created or that you let it take over, and warns first. It keeps keys it doesn't show (such as `demo:`).
- Files the app writes take the owner of the `config/` folder, so they stay hand-editable without sudo. A committed `config/.gitkeep` makes the folder exist on a fresh clone, so Docker never creates it root-owned.
- A broken hand edit while Atlas runs keeps the last good config and shows a Problem on the Status screen. A broken file at boot still stops Atlas, as before.
- First-party secrets are host-bound like Custom ones: changing the Securo or Audiobookshelf URL to another host clears its password or token, and the form says so. Canvas's feed URL is itself the secret, so the whole URL is stored encrypted, with no host binding.
- No `config/atlas.yaml` now means Setup, not "every Module on". Setup's defaults write the example config, including `custom/links.yaml` and `welcome.yaml`.
- Each Module declares its form fields once in the backend; the same renderer can later serve Custom module setup. Each Module's Test fetches with its sync's code but stores nothing.
- This needs the secret store from the `custom-modules` branch first, plus the Owner passphrase and unlock cookie, which are not built yet. It also fulfils ADR 0007's "Owner gate arrives later" for Notification settings.
- Networking (Compose networks) stays in `docker-compose.override.yml`; Setup only explains an unreachable address. The Schedule photo build flag (`WITH_VISION`) stays in `.env`; Setup only notes it.
