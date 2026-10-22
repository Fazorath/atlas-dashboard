# Atlas

A self-hosted personal dashboard you open every day. Atlas pulls the things you
would otherwise check in six apps (weather, money, school, sleep, habits,
listening, work shifts) into one page of widgets you arrange yourself, and keeps
its own archive of whatever it can.

Each subject is a **module** you switch on in one YAML file. A fresh install
starts with just Weather and Habits, which need no account; switch on the rest
as you connect the services you already run or use.

| Module | Area | Needs | Example config |
|---|---|---|---|
| `open_meteo` | Weather | nothing: your coordinates | on |
| `habits` | Habits | nothing | on |
| `work` | Work | nothing: you enter your weekly shifts | off |
| `securo` | Money | a self-hosted Securo | off |
| `audiobookshelf` | Listening | a self-hosted Audiobookshelf + API key | off |
| `canvas` | School | a Canvas calendar-feed URL | off |
| `google_health` | Health | a Google Cloud OAuth client (Fitbit / Pixel Watch) | off |

## Run it

```bash
git clone https://github.com/Fazorath/atlas-dashboard.git atlas && cd atlas
cp .env.example .env && chmod 600 .env     # secrets: DB password, tokens
$EDITOR .env                               # set POSTGRES_PASSWORD (not change-me)
cp -r config.example config                # everything else
$EDITOR config/atlas.yaml                  # your name, timezone, modules to add
$EDITOR config/modules/open_meteo.yaml     # your coordinates
docker compose up -d --build
```

Then open <http://127.0.0.1:8188>. Weather fills in at the next :07, or now with
`curl -X POST 127.0.0.1:8187/api/sync/weather`.

### Configuration

```
.env                         secrets only: DB password, logins, tokens, feed URLs
config/atlas.yaml            name (the greeting), timezone, which modules are on
config/modules/<module>.yaml that module's settings; each file explains itself
```

Remove a module from `atlas.yaml` and its screen, widgets and sync disappear;
nothing it stored is deleted, so adding it back brings the history with it.
After changing `config/`: `docker compose restart atlas-api`. After changing `.env`:
`docker compose up -d atlas-api` (a restart keeps the old environment). Then reload the page.

With no `config/atlas.yaml` at all, every module is on and each one without
settings says "needs setup".

### Demo data

To look around before connecting anything, fill an empty install with a
made-up student's week: habits with streaks, five weeks of sleep and activity,
assignments and class sessions, and work shifts.

```bash
# config/atlas.yaml: add `demo: true`, and turn on work, canvas, google_health
docker compose restart atlas-api
docker compose exec atlas-api python -m app.demo
curl -X POST 127.0.0.1:8187/api/sync/weather       # weather stays real
```

`demo: true` makes Canvas and Google Health count as set up without an account,
and stops their syncs from touching the seeded rows. The script only runs in
demo mode and only on empty tables (`--force` deletes those tables and reseeds),
so it can't land on top of real data. Remove `demo: true` before connecting
real accounts.

### On your phone

Open Atlas in Safari or Chrome and use **Add to Home Screen**: it gets the Atlas
icon and opens like an app, without the browser bars.

### Reaching your other apps

Securo and Audiobookshelf are reached by container name, so `atlas-api` has to
join their docker networks. Copy `docker-compose.override.example.yml` to
`docker-compose.override.yml` (compose loads it automatically) and name the
networks there; `docker network ls` lists them.

### Getting to it

Ports bind to `127.0.0.1` (`BIND_ADDRESS`, `WEB_PORT` in `.env`). **Atlas has no
login yet**, so put it behind something that does the gatekeeping: Tailscale
(`tailscale serve --bg --https=443 http://127.0.0.1:8188`), or a reverse proxy
with auth. Don't publish it to the open internet as is.

## Shape

| Service | Port | Role |
|---|---|---|
| `atlas-db` | — | postgres:17, named volume `atlas_pgdata` |
| `atlas-api` | `127.0.0.1:8187` | FastAPI, everything under `/api`, docs at `/api/docs` |
| `atlas-web` | `127.0.0.1:8188` | nginx serving the built SPA, proxies `/api` to `atlas-api` |
| `atlas-cron` | — | busybox crond, curls `POST /api/sync/<source>` on a schedule |

Every service is `atlas-`-prefixed so it can join other stacks' networks without
colliding with their `db`, `redis` or `backend`.

`GET /api/config` is what the dashboard reads first: the name and the modules
that are on. `backend/app/modules.py` maps each module to its Area and sync
source; a switched-off source answers cron with `204`.

## Adding a source

1. Write `backend/app/sources/<name>.py` — all provider-specific parsing stays in
   that one module, behind a small internal shape.
2. Write `backend/app/sync/` glue that returns the number of rows written, and
   `register("<name>", fn, is_configured=...)` in `app/sync/registry.py`. The
   name must match its key in `frontend/src/lib/sources.ts` exactly, or the card
   sits on "Needs setup" with no error anywhere.
3. Add a migration: `docker compose exec atlas-api alembic revision -m "..."`.
   A live proxy has none — it stores nothing. Pass `live=True` to `register()`
   instead, and let its `run` be a reachability probe returning 0.
4. Uncomment or add the line in `cron/crontab`.
5. Build the widget against `GET /api/<name>/`.

Every attempt lands in `sync_runs`, which is what the Status screen and each
Area's Freshness line ("checked 29m ago") read. Register plumbing with
`hidden=True` (the `noop` heartbeat) to keep it off the Status screen. Check it with:

```bash
curl -s 127.0.0.1:8187/api/sync/status | python3 -m json.tool
```

## Design

Dark and rounded, closer to an iOS home screen than a dashboard. Cards have
26–32px corners, no border and no shadow — a card is separated from the page
only by colour.

Each area of the app owns one accent: violet for Today and Sleep, mint for
Habits, coral for School and Listening, amber for Money, sky for Weather. A
card sits on a dark **tint** of its accent and spends the full accent on its
title, icon and data marks.

The accent is inherited, not passed. A `data-accent` attribute rebinds
`--accent`, `--accent-tint`, `--accent-track` and `--accent-soft` for its whole
subtree, and the Tailwind aliases are declared `@theme inline` so utilities
compile to `var(--accent)` rather than a baked colour. That is why
`text-accent` on a ring, a chip or a chart bar means "whatever area I am
inside", with no per-accent class maps anywhere.

Retune the whole look from the token block at the top of
`frontend/src/index.css`. Nothing below it names a colour, a radius or a font.

Areas: Health, School, Money and Habits are in the nav; Weather and Listening
are reached only by tapping their Today Card. Every Today Card opens its Area —
the title is the link, and a tap anywhere off a control follows it. Each Area
header shows its Source's Freshness. Today shows no plumbing except one Problem
chip when a Source needs you; the full list is the **Status screen** (`/status`,
behind the avatar menu), which also holds the Google Health connection.

Navigation splits at 900px: a segmented pill nav in the header above it, a
floating icon tab bar at the bottom below it, where the active tab lights up in
its own section's accent.

A source that isn't set up yet keeps its card's shape and colour and shows
a rounded skeleton where its number will go, plus a "Needs setup" chip and one
line saying what switches it on. There is no bare em-dash in the UI.

## Weather

Open-Meteo, no API key. The hourly sync archives a 120-hour window (2 days back,
3 forward) into `weather_observations`, upserting on the hour — so a row written
as a forecast is overwritten by the real reading once that hour has passed. The
card reads the archive, never the upstream, which is why a failed sync costs
freshness and not the card.

Each sync makes three calls: hourly forecast (UTC, now with UV index), daily
forecast in the local zone into `weather_daily` (7-day strip, sunrise/sunset,
peak UV), and Open-Meteo's air-quality host for hourly US AQI. A failed AQI call
is logged and skipped without touching the AQI already archived.

`config/modules/open_meteo.yaml` is the whole setup; changing location is
editing it and restarting:

```bash
# config/modules/open_meteo.yaml
latitude: 40.7128
longitude: -74.0060
units: fahrenheit        # or celsius

docker compose restart atlas-api
curl -X POST 127.0.0.1:8187/api/sync/weather
```

Temperatures are stored metric; `units` only changes how they are shown.

Open-Meteo's free tier sometimes answers **`503 The service is overloaded`**,
mostly at the top of the hour when every cron job on the internet fires. So the
sync runs at **:07**, and retries a 429/5xx or a dropped connection twice (5s,
then 15s) before recording a failure. A bad request (400) is never retried.

## Money

Securo, **live-proxied**. Nothing financial is written to Atlas's database and
there is no migration for it: money already has a source of truth in Securo,
and a second copy that drifts is worse than no copy.

Reached at `base_url` in `config/modules/securo.yaml` (`http://backend:8000`
once `atlas-api` joins Securo's network). The browser never calls
Securo — its CORS policy allows only its own frontend origin, and going through
`atlas-api` keeps the credentials out of the bundle.

```bash
# .env
SECURO_EMAIL=you@example.com
SECURO_PASSWORD=...
# config/modules/securo.yaml: base_url, public_url, and optionally workspace_id
# (blank uses the account's oldest workspace, as Securo's own UI does)

docker compose up -d atlas-api
curl -s 127.0.0.1:8187/api/finance/ | python3 -m json.tool
```

All reading straight through: `GET /api/finance/` (the summary behind the Today
tile and the Money hero), `/categories`, `/trend?months=`, `/spending`
(categorised Out only, plus the Uncategorised amount and transaction count),
`/accounts`, `/bills?days=` (Securo's projected outflows from recurring
transactions) and `/goals`.

Securo's no-category bucket arrives named in the server's language ("Sem
categoria"); Atlas identifies it by its null `category_id` and calls it
**Uncategorised**. "Where it went" never draws it as a bar — it is a nudge line
linking to securo.yaml's `public_url` (blank renders no link).

Things worth knowing before touching it:

- **Auth is a 24h JWT with no refresh token.** `POST /api/auth/login`,
  form-urlencoded, fastapi-users `BearerTransport`. The token is cached in
  memory against its own `exp` claim, so it costs one login a day rather than
  one per card refresh, and a 401 re-logs in once and retries.
- **Two-factor auth on the Securo account stops this working.** Securo answers
  a 2FA-enabled login with `{"requires_2fa": true}` and HTTP 200 instead of a
  token, and there is no unattended way past a TOTP prompt. Atlas names that
  case explicitly in `sync_runs` rather than reporting a missing field.
- **`finance` is registered as a `live` source**, so its sync writes no rows.
  It is a reachability probe on a 15-minute cron whose only job is to put a
  dated row in `sync_runs` — which is why the Sources strip says "live" and
  "unreachable" for it rather than quoting the age of a sync that stored
  nothing.
- **A dead upstream is a 502, not an empty 200.** Weather can fall back on its
  archive; this cannot, so the card says it could not reach Securo instead of
  showing a blank where a balance was.
- Amounts are read from Securo's `_primary` fields, already converted into the
  workspace's primary currency. Expenses are stored as a positive magnitude and
  `net_month` is the signed number; the front end formats via `Intl` in
  `frontend/src/lib/money.ts` and never does arithmetic on money.
- **The trend's current month is projected; the summary's is actual.** For the
  month in progress `/api/dashboard/monthly-trend` returns Securo's *projected*
  expenses while `/api/dashboard/summary` returns what has been spent so far, so
  the last bar of the chart and the "Out" figure above it disagree slightly
  until the month closes. That is Securo answering two different questions —
  don't reconcile them here.
- The trend card names the window Securo actually returned, not the one asked
  for: with four months of history it says "Last 4 months" and draws four bars.

## Listening

Audiobookshelf, **live-proxied and read-only**. Like money there is no table and
no migration — the number on the card is a *position in a book*, and a position
stops being true the moment you press play on your phone. An archived copy could
only ever be behind the device in your pocket.

Atlas never issues a write to ABS. No progress write means no way for
a dashboard bug to lose your place, which is the one piece of state here that
cannot be re-derived from anything else.

Reached at `base_url` in `config/modules/audiobookshelf.yaml`
(`http://audiobookshelf:80` once `atlas-api` joins ABS's network). Auth is a static API
key with no expiry and no refresh, so unlike Securo there is no login, no token
cache and no lock:

```
# .env — mint in ABS under Settings -> API Keys
ABS_TOKEN=...

# config/modules/audiobookshelf.yaml
base_url: http://audiobookshelf:80
# where the *browser* reaches ABS, for the "open in Audiobookshelf" link
public_url: http://your-host:13378
```

```
GET  /api/listening/            # current book, everything in progress, today's time
GET  /api/listening/stats?days= # seconds per day + finished books (Listening screen)
GET  /api/listening/cover/{id}  # cover art, proxied
POST /api/sync/listening        # reachability probe; writes nothing
```

### Gotchas found building it

- **Progress lives in a different endpoint from metadata, and ABS never joins
  them.** `/api/me/items-in-progress` has the title, author, narrator, series
  and duration but *no progress*; `/api/me` → `mediaProgress[]` has `progress`,
  `currentTime` and `lastUpdate` but *no metadata at all*. One fetch of each,
  joined on `libraryItemId`, is the whole integration. They are requested
  concurrently, so the pair costs about one round trip.
- **ABS timestamps are epoch milliseconds, not seconds.** Reading `lastUpdate`
  as seconds silently lands in 1970 and the card says "55 years ago".
- **An ebook's position is in `ebookProgress`, not `progress`.** An item with no
  audio has `duration: 0` and leaves `progress` at 0 forever, so reading the
  wrong field shows every epub as untouched. Duration is what separates the two
  kinds — there is no media-type field that does it.
- **"Currently listening" is the most recently advanced *audiobook*,** not
  simply the most recent item. An epub opened once should not displace the book
  you are eight hours into on a card whose whole job is a listening position.
- **The cover has to be proxied.** ABS wants the API key on the cover request,
  and an `<img src>` pointing at ABS could only carry that key by publishing it
  to anyone with a view of the page. `atlas-api` fetches it and
  re-serves it same-origin with an hour of browser cache.
- **`public_url` is not `base_url`.** The first is where your browser
  reaches ABS, the second is a docker network name that means nothing to a
  laptop. Blank renders no deep link rather than a broken one.
- **A dead upstream is a 502, not an empty 200** — same rule as money, and for
  the same reason: no archive behind it means no last-good reading to show. A
  rejected API key is translated into a 502 that names `ABS_TOKEN`, because ABS
  answers a bad bearer with a bare 401 and an empty body.

## Habits

The one domain where **you are the upstream** — no sync, no cron line, no
registry entry (a "synced 4m ago" chip would describe nothing). The screens read
and write `/api/habits` directly.

```
habits          id, name, icon, sort_order, archived_at, created_at
habit_entries   (habit_id, date) PK, done_at   -- a tick is a row, an untick is its absence
```

```
GET    /api/habits/today?date=      # active habits, done-state on `date` (default today)
POST   /api/habits/{id}/toggle?date= # flip one day; past days allowed (backfill), future 422
GET    /api/habits/history?days=    # per-day done/total, oldest first — the heatmap
GET    /api/habits/?archived=       # definitions
POST   /api/habits/                 # {name}
PATCH  /api/habits/{id}             # {name?, icon?, sort_order?, archived?}
DELETE /api/habits/{id}             # hard delete, ticks included — archive is the normal way out
```

- **Days are local** (`settings.tz`, via `app/clock.py`, which weather now shares).
  In the browser, build dates with `localDate()` from `lib/habits.ts`, never
  `toISOString()` — that is the UTC date and flips to tomorrow in the evening anywhere west of UTC.
- **Streaks are computed, never stored** — gaps-and-islands over `habit_entries`
  on every read, so a backfilled tick repairs every figure. The current streak
  counts through yesterday until today is over; streak figures always answer for
  today, whichever day is selected.
- **A habit "begins"** at the earlier of its creation and its oldest tick, so
  backfilling before you added it counts, and the heatmap doesn't paint the
  months before it existed as failures. Archiving stops it counting from that
  day on without rewriting the months it was live.
- **Toggle is optimistic.** For today the streak moves by one immediately; for a
  past day it waits for the server, because it depends on the neighbours.
- The Habits week strip is the backfill picker: tap yesterday, then tick.
- **Measured habits** (ADR 0001, `app/measured.py`): in edit mode a habit can be
  linked to a Health figure (`sleep_hours`, `steps`, `active_minutes`) and a
  target. After every Health sync Atlas ticks the last 7 days where the figure
  reaches the target (`habit_entries.source = 'measured'`); linking re-checks 90
  days, never before the habit was created. A manual tick or untick on a
  measured habit is stored as `source = 'manual'` (an untick as `done = false`)
  and is never overwritten. Every count filters on `done`.

## School

Canvas via its **calendar feed**, archived hourly — the weather pattern. Canvas
OAuth needs a developer key only an institution admin can issue; the feed needs no
auth because the URL carries its own token, and it carries only title, due time
and course. No submission status, so *done* is yours:

```
assignments        ics_uid PK, title, course, due_at, all_day, url, first_seen, last_seen, removed_at
assignment_status  ics_uid PK/FK, done_at, notes    -- a tick is a row; the sync never names this table
```

```
# .env — Canvas -> Calendar -> Calendar Feed. The URL is a credential.
CANVAS_ICS_URL=https://<school>.instructure.com/feeds/calendars/user_<token>.ics

docker compose up -d atlas-api
curl -s -X POST 127.0.0.1:8187/api/sync/school
```

```
GET  /api/school/?days=7        # overdue, upcoming (done or not), week_done/week_total
GET  /api/school/past?days=30   # the archive the feed itself forgets
POST /api/school/{uid}/toggle   # flip your done tick
```

- **Course labels** are `course_labels` in `config/modules/canvas.yaml`:
  `fragment: Label` pairs, matched case-insensitively anywhere in Canvas's
  course name, first match wins (so `Calculus I` would also catch a later
  `…Calculus II` — put the longer fragment first). Applied on read; the
  table keeps Canvas's full name, and the UI shows it as a tooltip.
- The **Last 30 days** list never shows "late": an unticked old row is most
  likely handed in. Lateness is the Overdue card's job.
- **Registered as `school`**, the front end's key — not `canvas`.
- `event-assignment-*` UIDs are Assignments. `event-calendar-event-*` are
  **Class sessions** (calendar events, e.g. scheduled class meetings), archived to
  `class_sessions` with the meeting link pulled from the description; the API
  returns `next_class` and `classes`. Never ticked, never counted in "Due this
  week"; Today's Due card mentions one only on the day it happens.
  `Title [Course]` is split on the last bracketed suffix. Anything due at 11:59pm
  arrives as a bare DATE and is stored as 23:59 local with `all_day`, which the
  UI renders as "End of day". Calendar-month links are rebuilt into the
  assignment's own page.
- **Overdue is the last 7 days** (`OVERDUE_DAYS`). The first sync archives the
  whole term, and without a cut-off every assignment handed in but never ticked
  would sit on the card forever.
- An upcoming assignment that vanishes from the feed gets `removed_at` and
  hides; it returns if it reappears. An **empty feed changes nothing** — that is
  likelier a feed problem than a term with nothing due.
- **The feed URL never leaves `.env`.** Sync errors are written without it, and
  `app/main.py` holds the `httpx` logger at WARNING because httpx logs every
  request's full URL at INFO — at the default level the token would be in
  `docker logs`. A reset feed shows up as *HTTP 404 — was the feed URL reset in
  Canvas?*

## Health

The Area used to be called Sleep; `/sleep` redirects to `/health`, and
the API, the `sleep` source key and the OAuth redirect URI keep their names.

Fitbit through the **Google Health API** (`health.googleapis.com/v4`), archived
hourly — the weather pattern. **Not `dev.fitbit.com`**: the legacy Fitbit Web
API was turned down in September 2026, its tokens don't carry over, and nearly
every tutorial online still describes it.

```
oauth_tokens     provider PK, access/refresh token + expiries, invalid_at/reason
sleep_sessions   id PK (Google's data point id), start/end, wake_date, main/nap,
                 minutes asleep/awake/in period, stage minutes, stages JSONB, raw JSONB
daily_activity   date PK, steps, resting_hr, light/moderate/vigorous minutes, calories_kcal
```

```
GET  /api/sleep/?days=7          # connection, last night (+hypnogram), nights, activity
GET  /api/sleep/history?days=30  # main nights, oldest first
GET  /api/sleep/connect          # {url} for Google's consent screen
GET  /api/sleep/oauth/callback   # Google redirects the browser here
POST /api/sleep/oauth/complete   # {url} — paste-back, for a localhost redirect URI
POST /api/sleep/disconnect       # revoke + forget the token; nights are kept
```

### One-time setup (you, in Google Cloud console)

1. New project → APIs & Services → Library → enable **Google Health API**.
2. Google Auth Platform → **Branding**: app name + support email.
3. **Audience**: External, publishing status **Testing**, add your own Google
   account under Test users.
4. **Data Access** → add the three read-only scopes:
   `googlehealth.sleep.readonly`, `googlehealth.activity_and_fitness.readonly`,
   `googlehealth.health_metrics_and_measurements.readonly`.
5. **Clients** → Create → *Web application*, authorised redirect URI
   `https://<where you open Atlas>/api/sleep/oauth/callback`.
   **Copy the secret now** — Google shows it once.
6. Into `.env`, then `docker compose up -d atlas-api` and press **Connect
   Fitbit** on the Status screen:

```
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=...
# and in config/modules/google_health.yaml:
# redirect_uri: https://<where you open Atlas>/api/sleep/oauth/callback
```

Google accepts an HTTPS redirect on your own hostname (a reverse proxy, or
`tailscale serve`). Register it on the
client under **Authorized redirect URIs**; until you do, every sign-in fails
with `redirect_uri_mismatch`, which is the same error a wrong port gives. If it
is ever refused, register `http://localhost:8080/oauth/callback` instead and set that
as `redirect_uri`. The Status screen then opens Google in a new tab
and asks you to paste the address it lands on. No code change either way.

### Things worth knowing

- **The sign-in dies every 7 days, by design.** Every Google Health scope is
  *Restricted*, so a personal app stays in Testing, where a refresh token
  expires 7 days after consent however often it's used. Google reports the
  deadline (`refresh_token_expires_in`); Atlas stores it, and Today shows a
  Reconnect banner from two days out, and again once it has lapsed. Production
  status would need Google verification plus a paid annual security assessment.
- **Refresh tokens do not rotate at Google**, whatever the OAuth docs suggest.
  If a refresh ever does return one it is stored anyway.
- **`invalid_grant`** marks the token row invalid (kept, so the screen can say
  why) and fails the sync; the next runs don't call Google until you reconnect.
- **Your Fitbit account must be a Google account.** A legacy Fitbit login
  completes consent and then gets a 403 (`UberMint`); sign in to the Fitbit app
  with "Continue with Google". Atlas names this case.
- **Three scopes, not two.** Resting heart rate is a *health metric*; without
  that scope `daily-resting-heart-rate` is a 403. Unticking a box on the
  consent screen is caught and named.
- **Resting HR can't be rolled up** — `dailyRollUp` on it returns a personal
  *range*. It's read with `list` and a `daily_resting_heart_rate.date` filter
  (snake_case in filters, kebab-case in paths; mixing them is a 400).
- **No efficiency field exists.** It's asleep ÷ time in the sleep period,
  computed on read, so it can differ from the Fitbit app by a point.
- **Windows:** the first sync after connecting backfills 90 days; after that
  each hourly run re-reads the last 7, because Google finishes staging a night
  later (`processed: false`) and you can edit sessions. Within that window
  Google is the truth — a session it stops listing is deleted — but a sync that
  returns *no* sleep changes nothing (a watch that hasn't synced, not a week
  awake). `active-minutes` and `total-calories` refuse ranges over 14 days, so
  roll-ups are chunked; sleep pages at 25.
- **Hourly, not nightly.** Last night only exists once the watch syncs after
  you wake; a 4am run would leave the card a night behind all day.
- **A night belongs to the morning you woke** (`wake_date`, from the session's
  own UTC offset). Off-wrist days are null, not zero; a worn-but-idle day's
  steps are a true 0.
- `raw` keeps each sleep data point as Google sent it — the parser was written
  against docs whose own examples disagree with their schema (`main` vs
  `mainSleep`), so a wrong assumption is a re-parse, not lost history.
- Stage colours are one violet ramp (deep → awake), not four hues: stages are
  ordinal, and the hypnogram's rows carry the same order by position.

## Early testers

Atlas is being worked on in the open over the next few weeks, and early testers
are welcome. Install it, try it with demo data or your own, and open an issue
for anything that breaks or anything you wish it did.

Want to try it early? [Sign up as a tester](https://docs.google.com/forms/d/e/1FAIpQLSdxZBcTgOdY8poCUWc8kH8xmdDmS68RYQbLGJXGSs1on70KTw/viewform)
and I'll email you when new releases land.

## What's next

- **Custom modules**: add your own widgets from inside the app with a short
  YAML file, from static links and notes to numbers pulled from any JSON API
  you run.
- A catalog of community modules to browse and install.
