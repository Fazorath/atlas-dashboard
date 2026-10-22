---
title: Configuration
description: Where each setting lives, what restarts it needs, and how Modules are switched on.
---

Atlas reads three places. The rule is simple: **secrets go in `.env`, everything else goes in `config/`.**

| File | Holds |
|---|---|
| `.env` | Secrets only: the database password, logins, tokens, feed URLs. |
| `config/atlas.yaml` | Your name, your timezone, which Modules are on. |
| `config/modules/<module>.yaml` | That Module's settings. Each file explains itself. |

`config/` and `.env` are yours: both are ignored by git, so pulling an update never overwrites them. Their committed templates are `config.example/` and `.env.example`.

## `config/atlas.yaml`

```yaml
# The greeting on Today: "Hello, Sam!". Leave blank for just "Hello!".
name: Sam

# Where "today" starts and ends: habit ticks, the day's weather high/low,
# which night counts as last night. Any IANA zone name.
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
| `modules` | The Module ids that are on. Order doesn't matter. |
| `demo` | `true` only for a [demo install](/atlas-dashboard/start/demo-data/). Never on a real one. |

**No `atlas.yaml` at all** means every Module is on, and each one without settings says "needs setup". Handy for a quick look; the example file is the better start.

## Module files

Each Module that has settings reads `config/modules/<id>.yaml`. A Module with nothing to set (Habits, Work) has no file.

| File | Keys |
|---|---|
| `open_meteo.yaml` | `latitude`, `longitude`, `units` |
| `securo.yaml` | `base_url`, `public_url`, `workspace_id` |
| `audiobookshelf.yaml` | `base_url`, `public_url` |
| `canvas.yaml` | `course_labels` |
| `google_health.yaml` | `redirect_uri` |

Each Module's page lists what its keys do, and which secrets it needs in `.env`.

## Applying a change

| You changed | Run |
|---|---|
| anything in `config/` | `docker compose restart atlas-api` |
| `.env` | `docker compose up -d atlas-api` |

Then reload the page. A plain `restart` keeps the container's old environment, which is why `.env` changes need `up -d`.

## When something is wrong

- **Broken YAML stops `atlas-api` from starting**, and the log names the file: `config/modules/canvas.yaml: not valid YAML — …`. A dashboard that is quietly wrong would be worse.
- **Unknown keys and unknown Module ids only warn**, in `docker compose logs atlas-api`, with the list of keys it does know. Check the log after editing if a setting seems ignored; a typo is the usual reason.
- A value in YAML wins over the same setting in the environment.

## Reaching your other apps

Weather, Habits, Work, School and Health talk to the internet or to nobody. **Money and Listening** reach a Securo or Audiobookshelf you run yourself, by container name, so `atlas-api` has to join their Docker networks.

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

networks:
  securo:
    external: true
    name: <securo-project>_default   # as `docker network ls` shows it
  audiobookshelf:
    external: true
    name: <audiobookshelf-project>_default
```

If Securo or Audiobookshelf runs on another machine, skip the override and set `base_url` to an address `atlas-api` can reach over the network instead.
