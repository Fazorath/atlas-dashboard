---
title: Install
description: Run Atlas with Docker Compose, open it, and put it somewhere only you can reach.
---

You need a machine that runs Docker with the Compose plugin, and `git`. Atlas is four small containers; a Raspberry Pi 4 or any home server is plenty.

## 1. Get the code

```bash
git clone https://github.com/Fazorath/atlas-dashboard.git atlas
cd atlas
```

The folder name becomes the Compose project name, so two copies in two folders (a test install beside your real one, say) get their own containers and their own database.

## 2. Secrets: `.env`

```bash
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Set `POSTGRES_PASSWORD` to something other than `change-me`. That is the only line a first run needs. The rest of the file holds the secrets for Modules you have not turned on yet; leave them blank.

| Key | Default | What it is |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_DB` | `atlas` | The database Atlas creates for itself. |
| `POSTGRES_PASSWORD` | `change-me` | **Change it.** |
| `BIND_ADDRESS` | `127.0.0.1` | Where the ports are published. Keep it on loopback. |
| `API_PORT` | `8187` | The API, for `curl` by hand. |
| `WEB_PORT` | `8188` | The dashboard. |
| `TZ` | `America/New_York` | Container clocks: logs and cron. Atlas's own "today" is `timezone` in `atlas.yaml`. |
| `LOG_LEVEL` | `info` | |

## 3. Everything else: `config/`

```bash
cp -r config.example config
$EDITOR config/atlas.yaml               # your name, your timezone
$EDITOR config/modules/open_meteo.yaml  # your coordinates
```

[Configuration](/atlas-dashboard/start/configuration/) explains every file. For a first run, your name, timezone and coordinates are enough.

## 4. Start it

```bash
docker compose up -d --build
```

The first build takes a few minutes. Database migrations run each time `atlas-api` starts, so there is no separate setup step.

Open <http://127.0.0.1:8188>. You should see Today with a Weather Widget and a Habits Widget, and no Problem chip. Weather fills in at the next `:07` past the hour, or right away with:

```bash
curl -X POST 127.0.0.1:8187/api/sync/weather
```

## 5. Getting to it from your phone

The ports bind to `127.0.0.1` on purpose. **Atlas has no login yet**: anyone who can open the page can read it and tick your habits. Don't publish it to the open internet as is.

Put something in front that does the gatekeeping:

- a **reverse proxy with authentication** (Caddy, nginx, Traefik with forward auth, Authelia…) pointing at `127.0.0.1:8188`, or
- a **private network** you already trust. With Tailscale, for example: `tailscale serve --bg --https=443 http://127.0.0.1:8188`.

An HTTPS address is also what [Health](/atlas-dashboard/modules/health/) needs for Google's sign-in redirect.

### Add to Home Screen

Open Atlas in Safari or Chrome on your phone and use **Add to Home Screen**. It gets the Atlas icon and opens like an app, without the browser bars.

## What's running

| Container | Port | Role |
|---|---|---|
| `atlas-db` | none | Postgres 17. Everything Atlas stores lives in its named volume. |
| `atlas-api` | `127.0.0.1:8187` | FastAPI. Everything under `/api`; interactive docs at `/api/docs`. |
| `atlas-web` | `127.0.0.1:8188` | nginx serving the web app and proxying `/api` to `atlas-api`. |
| `atlas-cron` | none | busybox crond. Calls `POST /api/sync/<source>` on a schedule. |

Every container is `atlas-`-prefixed, so Atlas can join another stack's Docker network (to reach Securo or Audiobookshelf) without its names colliding with that stack's `db` or `redis`.

## Next

- [Try the demo data](/atlas-dashboard/start/demo-data/) to see every Area filled in.
- [Turn on more Modules](/atlas-dashboard/start/configuration/).
