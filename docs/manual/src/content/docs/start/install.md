---
title: Install
description: Run Atlas with Docker Compose, claim it with the setup code, and put it somewhere only you can reach.
---

## What you need

Atlas runs on a machine of your own that stays on and has Docker with the Compose plugin: a NAS, a Raspberry Pi 4 or 5, an old laptop or mini PC, or a VPS (about $5 a month is plenty). Atlas is four small containers.

A laptop works too, but Atlas only syncs and keeps its archive while the laptop is awake and on. A hosted Atlas that someone else runs for you doesn't exist; it's your install, on your machine.

If that machine isn't the one in front of you, don't open its ports to the internet. Reach it through an SSH tunnel (`ssh -L 8188:127.0.0.1:8188 <user>@<host>`, then open <http://127.0.0.1:8188> on your own computer) or a private network such as Tailscale. See [Getting to it from your phone](#5-getting-to-it-from-your-phone).

## Quick install

```bash
curl -fsSL https://github.com/Fazorath/atlas-dashboard/releases/latest/download/install.sh | sh
```

This makes an `atlas` folder in the current directory (or `$ATLAS_DIR`) with the release `docker-compose.yml`, a `.env` holding two freshly generated secrets, and `config/`. It starts Atlas from the published images (nothing is built on your machine), waits until it answers, then prints the address, the setup code, and a reminder to **back up `atlas/.env`**. It pins the version it came from, so a later `latest` never changes your install by surprise. If port 8188 or 8187 is taken it says so; rerun with `WEB_PORT=` or `API_PORT=` set. Running it again in the same folder keeps your `.env`, `config/` and version and prints the setup code again while nobody has claimed Atlas. Then skip to [Setup](#4-setup).

To follow the steps yourself, or build from source, use the next section.

## Build from source

Steps 1 to 3 are what the installer does for you, except that this builds the images from the code on your machine.

### 1. Get the code

```bash
git clone https://github.com/Fazorath/atlas-dashboard.git atlas
cd atlas
```

The folder name becomes the Compose project name, so two copies in two folders (a test install beside your real one, say) get their own containers and their own database.

### 2. Two secrets: `.env`

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
| `WITH_VISION` | `false` | `true`, `1`, `yes` or `on` (any case) builds in [Work](/atlas-dashboard/modules/work/)'s schedule-photo reader. Rebuild after changing it. Source builds only: the prebuilt release images never include it. |

The rest of the file lists each Module's secrets. Leave them blank and enter them in Setup instead; one you do set here wins, and Setup shows it as "Set in .env".

### 3. Start it

```bash
docker compose up -d --build
```

The first build takes a few minutes. Database migrations run each time `atlas-api` starts, so there is no separate migration step.

## 4. Setup

Atlas prints a one-time **setup code** in its log while nobody owns it yet:

```bash
docker compose logs atlas-api | grep 'setup code'
```

Run it from the install folder, the one with `docker-compose.yml` in it: the folder the installer set up, or the folder you cloned. Setup's Owner step shows the same command.

**Why the code is in the log.** Atlas has no accounts and no email, so something has to prove that whoever opens the page also runs the machine. The log is that proof: only someone with the host can read it, and that holds whether your traffic arrives directly, through a reverse proxy or over Tailscale, where every request would look local.

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
