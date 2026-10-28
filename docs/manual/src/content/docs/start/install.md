---
title: Install
description: Run Atlas with Docker Compose, claim it with the setup code, and put it somewhere only you can reach.
---

You need a machine that runs Docker with the Compose plugin, and `git`. Atlas is four small containers; a Raspberry Pi 4 or any home server is plenty.

## 1. Get the code

```bash
git clone https://github.com/Fazorath/atlas-dashboard.git atlas
cd atlas
```

The folder name becomes the Compose project name, so two copies in two folders (a test install beside your real one, say) get their own containers and their own database.

## 2. Two secrets: `.env`

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32     # copy this for ATLAS_SECRET_KEY
$EDITOR .env
```

A first run needs two lines:

- `POSTGRES_PASSWORD`: anything but `change-me`. `openssl rand -hex 24` makes a good one.
- `ATLAS_SECRET_KEY`: a random string of 32 or more characters. It seals the passwords and tokens you enter in Setup, so a database dump alone reveals none of them, and it signs the Owner's unlock cookie. **Back it up with `.env`**: losing or changing it means entering those secrets again. Without it, `atlas-api` refuses to start and its log prints the `openssl` command.

:::caution[Watch for `$` in `.env` values]
Docker Compose expands `$` in `.env`, so an unquoted `POSTGRES_PASSWORD=$ecretPass1` becomes empty and Postgres refuses to start, and `SECURO_PASSWORD=Tr0ub$dor&3` quietly becomes `Tr0ub&3`. Either avoid `$` (the `openssl rand -hex` command above never produces one) or wrap the value in single quotes: `SECURO_PASSWORD='Tr0ub$dor&3'`.
:::

| Key | Default | What it is |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_DB` | `atlas` | The database Atlas creates for itself. |
| `POSTGRES_PASSWORD` | `change-me` | **Change it.** |
| `ATLAS_SECRET_KEY` | none | **Required.** 32+ random characters. |
| `BIND_ADDRESS` | `127.0.0.1` | Where the ports are published. Keep it on loopback. |
| `API_PORT` | `8187` | The API, for `curl` by hand. |
| `WEB_PORT` | `8188` | The dashboard. |
| `TZ` | `America/New_York` | Container clocks: logs and cron. Atlas's own "today" is the time zone you pick in Setup. |
| `LOG_LEVEL` | `info` | |
| `WITH_VISION` | `false` | `true`, `1`, `yes` or `on` (any case) builds in [Work](/atlas-dashboard/modules/work/)'s schedule-photo reader. Rebuild after changing it. |

The rest of the file lists each Module's secrets. Leave them blank and enter them in Setup instead; one you do set here wins, and Setup shows it as "Set in .env".

## 3. Start it

```bash
docker compose up -d --build
```

The first build takes a few minutes. Database migrations run each time `atlas-api` starts, so there is no separate migration step.

## 4. Setup

Atlas prints a one-time **setup code** in its log while nobody owns it yet:

```bash
docker compose logs atlas-api | grep 'setup code'
```

Open <http://127.0.0.1:8188>. With no `config/atlas.yaml` yet, every page leads to Setup, four short steps:

1. **Owner.** Enter the setup code and pick a passphrase. The code proves you can read the machine's logs, which works however your traffic reaches Atlas; the passphrase is what you'll use from then on. It is stored hashed.
2. **You.** The name for Today's greeting, and your time zone (it starts as your browser's).
3. **Place.** Search for your city, or type coordinates. Atlas suggests °F or °C from the country, and offers the city's time zone if it differs.
4. **Modules.** Switch on what you use. Each one shows its form: addresses, logins, keys. **Test** runs the same fetch its sync uses, with what you typed, and stores nothing. **Save** works even when Test fails: the Module then shows up as a Problem on the Status screen until it connects.

Finish lands on Today. Weather fills in at the next `:07` past the hour, or right away from Status → Sources → the sync button.

Setup writes the same files you could write by hand (see [Configuration](/atlas-dashboard/start/configuration/)), plus two example Custom module files in `config/custom/`. Everything applies at once; nothing needs a restart.

### Changing settings later

Avatar → **Status**. Below Sources and Notifications are the same forms, one section each: You, Place, Modules, and Owner (change the passphrase, lock this device). They are Owner-only: a device unlocks with the passphrase for 30 days.

### Lost the passphrase

From the machine running Atlas:

```bash
docker compose exec atlas-api python -m app.owner reset
```

That clears the passphrase and locks every device. Your settings and saved secrets are kept. Open Atlas and claim it again with the new setup code from the log.

## 5. Getting to it from your phone

The ports bind to `127.0.0.1` on purpose. The passphrase only guards *settings*: anyone who can open the page can read your dashboard and tick your habits. Don't publish it to the open internet as is.

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
| `atlas-api` | `127.0.0.1:8187` | FastAPI. Everything under `/api`; interactive docs at `/api/docs`. Reads and writes `config/`. |
| `atlas-web` | `127.0.0.1:8188` | nginx serving the web app and proxying `/api` to `atlas-api`. |
| `atlas-cron` | none | busybox crond. Calls `POST /api/sync/<source>` on a schedule. |

Every container is `atlas-`-prefixed, so Atlas can join another stack's Docker network (to reach Securo or Audiobookshelf) without its names colliding with that stack's `db` or `redis`.

## Next

- [Try the demo data](/atlas-dashboard/start/demo-data/) to see every Area filled in.
- [How the config files work](/atlas-dashboard/start/configuration/), if you'd rather edit YAML.
