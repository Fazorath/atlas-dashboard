---
title: Configuration
description: Where each setting lives, how Setup writes it, and editing the files by hand.
---

[Setup](/atlas-dashboard/start/install/#4-setup) and the Settings sections on the Status screen are the usual way to configure Atlas. They write plain files you can also edit yourself:

| Where | Holds | Written by |
|---|---|---|
| `config/atlas.yaml` | Your name, your time zone, which Modules are on. | Setup, or you |
| `config/modules/<module>.yaml` | That Module's settings: addresses, coordinates, labels. | Setup, or you |
| `config/custom/*.yaml` | Custom modules (two examples to start). | Setup's defaults, or you |
| Encrypted store, in the database | Passwords, tokens, the Canvas feed URL, Google's client secret. | Setup only |
| `.env` | The database password, `ATLAS_SECRET_KEY`, ports — and optionally any Module secret. | You |

`config/` and `.env` are yours: both are ignored by git, so pulling an update never overwrites them. Their committed templates are `config.example/` and `.env.example`. `config/` is mounted read-write, and every file Atlas writes there takes the owner of the folder, so you can still edit it without `sudo`.

## Secrets

A secret entered in Setup goes to the `custom_secrets` table, encrypted with `ATLAS_SECRET_KEY`. It is never written to a YAML file and never shown again: the form only says **Saved**.

- **`.env` wins.** A secret set in `.env` (`SECURO_PASSWORD`, `ABS_TOKEN`, `CANVAS_ICS_URL`, `GOOGLE_OAUTH_CLIENT_SECRET`) is used instead, and the form shows it read-only as "Set in .env". Nothing is migrated between the two.
- **Bound to a host.** Securo's password and Audiobookshelf's key are only ever sent to the host they were entered for. Point the address at another host and the saved one is cleared (the form warns you first); a hand edit to another host stops it being sent.
- **Canvas's feed URL is the secret**, so the whole URL is stored encrypted.

## `config/atlas.yaml`

```yaml
name: Sam
timezone: America/New_York
modules:
  - open_meteo
  - habits
  # - work
  # - securo
  # - audiobookshelf
  # - canvas
  # - google_health
# demo: true
```

| Key | Meaning |
|---|---|
| `name` | The name in Today's greeting and the avatar's initial. |
| `timezone` | An IANA zone (`Europe/Berlin`, `America/Chicago`…). Every "day" in Atlas is a local day in this zone. |
| `modules` | The Module ids that are on. Order doesn't matter. Leaving the key out turns every Module on. |
| `demo` | `true` only for a [demo install](/atlas-dashboard/start/demo-data/). Never on a real one. Setup keeps it. |

**No `atlas.yaml` at all** means a fresh install: Atlas opens Setup.

## Module files

| File | Keys |
|---|---|
| `open_meteo.yaml` | `latitude`, `longitude`, `units`, `place` (the city's name, for display) |
| `securo.yaml` | `base_url`, `email`, `public_url`, `workspace_id` |
| `audiobookshelf.yaml` | `base_url`, `public_url` |
| `canvas.yaml` | `course_labels` |
| `google_health.yaml` | `client_id`, `redirect_uri` |
| `work.yaml` | `photo` (hand-edited only; see [Work](/atlas-dashboard/modules/work/)) |

Each Module's page lists what its keys do.

## Editing by hand

You can, and **changes apply within a few seconds**: Atlas checks the files for changes, and again whenever a page loads its config. No restart. A change to `.env` still needs `docker compose up -d`, because a container's environment is fixed when it starts. Give it no service name: it recreates every service whose settings changed, so `WEB_PORT` and `BIND_ADDRESS` reach `atlas-web`, and `TZ` reaches `atlas-cron` and `atlas-db` as well as `atlas-api`. Naming only `atlas-api` would leave the others on the old values.

### Changing the database password

`POSTGRES_PASSWORD` is only used the **first time** Postgres starts, to create the database in its volume. Editing it in `.env` afterwards does not change the password Postgres holds, so `atlas-api` can no longer sign in. To change it for real, do it in two steps:

```bash
# 1. Set the new password inside Postgres (use your POSTGRES_USER and POSTGRES_DB if not `atlas`).
docker compose exec atlas-db psql -U atlas -d atlas -c "ALTER USER atlas PASSWORD 'the-new-password';"
# 2. Put the same password in POSTGRES_PASSWORD in .env, then:
docker compose up -d
```

Do step 1 first, while `atlas-api` still works. If you already edited `.env` and Atlas can't connect, put the old password back, run `docker compose up -d`, and then do both steps. If you'd rather not change it, leave it: it stays valid as long as the volume exists. A single quote in the new password has to be doubled (`''`) inside the SQL.

A file Setup wrote starts with `# Written by Atlas Setup.` Setup rewrites those freely. **A file you wrote yourself is left alone**: before saving over it, Setup asks, because rewriting YAML drops its comments. Keys Setup doesn't show (`demo:`, Work's `photo:`) are kept either way.

## When something is wrong

- **Broken YAML while Atlas runs** is not applied: Atlas keeps using the last settings that worked, and the Status screen says which file and line is wrong until you fix it.
- **Broken YAML, or a value that isn't valid, at start-up stops `atlas-api`**, and the log names the file (and the key, for a bad value): `config/modules/canvas.yaml: not valid YAML — …` or ``config/modules/open_meteo.yaml: `units`: Input should be 'fahrenheit' or 'celsius'``. The page then shows **API unreachable**. A dashboard that is quietly wrong would be worse.
- **Unknown keys and unknown Module ids only warn**, in `docker compose logs atlas-api`, with the list of keys it does know.
- A value in YAML wins over the same setting in the environment.

## Reaching your other apps

Weather, Habits, School and Health talk to the internet or to nobody, and Work needs nothing unless you use its photo reader. **Money and Listening** reach a Securo or Audiobookshelf you run yourself, by container name, so `atlas-api` has to join their Docker networks. So does the **Work photo reader**, which reaches your Ollama: without that network every read fails with "Couldn't reach the vision model". See [Work](/atlas-dashboard/modules/work/#read-a-week-from-a-photo-optional).

Copy the example override (Compose loads `docker-compose.override.yml` automatically) and name the networks:

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
docker network ls        # a stack's default network is <project>_default
$EDITOR docker-compose.override.yml
docker compose up -d
```

```yaml
services:
  atlas-api:
    networks:
      - default
      - securo
      - audiobookshelf
      - ollama          # only for the Work photo reader

networks:
  securo:
    external: true
    name: <securo-project>_default   # as `docker network ls` shows it
  audiobookshelf:
    external: true
    name: <audiobookshelf-project>_default
  ollama:               # only for the Work photo reader
    external: true
    name: <ollama-project>_default
```

If Securo or Audiobookshelf runs on another machine, skip the override and set `base_url` to an address `atlas-api` can reach over the network instead. The same goes for Ollama: set `photo.ollama_url` in `work.yaml` to an address `atlas-api` can reach.
