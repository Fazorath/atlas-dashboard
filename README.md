# Atlas

Self-hosted personal life dashboard. Aggregates weather, Securo finances,
Audiobookshelf listening, habits, Canvas assignments and Fitbit sleep into one
tailnet-only page.

Full architecture notes, naming rules and per-phase gotchas live in an internal
runbook not included in this public copy — see the comments in
`backend/app/sources/` and `backend/app/sync/registry.py` instead.

## Run it

```bash
cd atlas
cp .env.example .env && chmod 600 .env    # already done if .env exists
docker compose up -d --build
curl -s 127.0.0.1:8187/api/health
```

Ingress (once only):

```bash
tailscale serve --bg --https=8446 http://127.0.0.1:8188
```

Then: <https://your-tailnet-host.ts.net:8446>

## Shape

| Service | Port | Role |
|---|---|---|
| `atlas-db` | — | postgres:17, named volume `atlas_pgdata` |
| `atlas-api` | `127.0.0.1:8187` | FastAPI, everything under `/api`, docs at `/api/docs` |
| `atlas-web` | `127.0.0.1:8188` | nginx serving the built SPA, proxies `/api` to `atlas-api` |
| `atlas-cron` | — | busybox crond, curls `POST /api/sync/<source>` on a schedule |

Every service is `atlas-`-prefixed because this stack joins `securo_default` and
`nas_default` as external networks, and securo already owns the container names
`backend`, `db` and `redis` there.

No app-level auth: Tailscale is the boundary, same as homarr and glances. Nothing
binds beyond `127.0.0.1`.

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

A source whose phase has not landed keeps its card's shape and colour and shows
a rounded skeleton where its number will go, plus a "Needs setup" chip and one
line saying what switches it on. There is no bare em-dash and no "phase N" text
in the UI.

## Weather (phase 2)

Open-Meteo, no API key. The hourly sync archives a 120-hour window (2 days back,
3 forward) into `weather_observations`, upserting on the hour — so a row written
as a forecast is overwritten by the real reading once that hour has passed. The
card reads the archive, never the upstream, which is why a failed sync costs
freshness and not the card.

Each sync makes three calls: hourly forecast (UTC, now with UV index), daily
forecast in the local zone into `weather_daily` (7-day strip, sunrise/sunset,
peak UV), and Open-Meteo's air-quality host for hourly US AQI. A failed AQI call
is logged and skipped without touching the AQI already archived.

Set your home coordinates in `.env`. The two lines in `.env` are the whole setup;
changing location is editing them and restarting:

```bash
WEATHER_LAT=40.7128
WEATHER_LON=-74.0060

docker compose up -d atlas-api
curl -X POST 127.0.0.1:8187/api/sync/weather
```

Temperatures are stored metric and formatted for display in
`frontend/src/lib/weather.ts` (`DISPLAY_UNIT`).

Open-Meteo's free tier sometimes answers **`503 The service is overloaded`**,
mostly at the top of the hour when every cron job on the internet fires. So the
sync runs at **:07**, and retries a 429/5xx or a dropped connection twice (5s,
then 15s) before recording a failure. A bad request (400) is never retried.

## Money (phase 3)

Securo, **live-proxied**. Nothing financial is written to Atlas's database and
there is no migration for this phase: money already has a source of truth two
containers away, and a second copy that drifts is worse than no copy.

Reached at `http://backend:8000` over `securo_default`. The browser never calls
Securo — its CORS policy allows only its own frontend origin, and going through
`atlas-api` keeps the credentials out of the bundle.

```bash
SECURO_EMAIL=you@example.com
SECURO_PASSWORD=...
# optional; blank uses the account's oldest workspace, as Securo's own UI does
SECURO_WORKSPACE_ID=

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
linking to `SECURO_PUBLIC_URL` (blank renders no link).

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

## Listening (phase 4)

Audiobookshelf, **live-proxied and read-only**. Like money there is no table and
no migration — the number on the card is a *position in a book*, and a position
stops being true the moment you press play on your phone. An archived copy could
only ever be behind the device in your pocket.

Nothing in this phase issues a write to ABS. No progress write means no way for
a dashboard bug to lose your place, which is the one piece of state here that
cannot be re-derived from anything else.

Reached at `http://audiobookshelf:80` over `nas_default`. Auth is a static API
key with no expiry and no refresh, so unlike Securo there is no login, no token
cache and no lock:

```
# .env — mint in ABS under Settings -> API Keys
ABS_BASE_URL=http://audiobookshelf:80
ABS_TOKEN=...
# where the *browser* reaches ABS, for the "open in Audiobookshelf" link
ABS_PUBLIC_URL=http://your-tailnet-host.ts.net:13378
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
  to anything on the tailnet with a view of the page. `atlas-api` fetches it and
  re-serves it same-origin with an hour of browser cache.
- **`ABS_PUBLIC_URL` is not `ABS_BASE_URL`.** The first is where your browser
  reaches ABS, the second is a docker network name that means nothing to a
  laptop. Blank renders no deep link rather than a broken one — ABS is published
  straight on the tailnet IP at `:13378` and is not behind `tailscale serve`.
- **A dead upstream is a 502, not an empty 200** — same rule as money, and for
  the same reason: no archive behind it means no last-good reading to show. A
  rejected API key is translated into a 502 that names `ABS_TOKEN`, because ABS
  answers a bad bearer with a bare 401 and an empty body.

## Habits (phase 5)

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
  `toISOString()` — that is the UTC date and flips to tomorrow at 8pm here.
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

## School (phase 6)

Canvas via its **calendar feed**, archived hourly — the weather pattern. Canvas
OAuth needs an admin-issued developer key a student can't get; the feed needs no
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

- **Course labels** are `CANVAS_COURSE_LABELS` in `.env`: `fragment=Label` pairs
  split by `;`, matched case-insensitively anywhere in Canvas's course name,
  first match wins (so `Calculus I` would also catch a later `…II` — put
  the longer fragment first). Applied on read; the
  table keeps Canvas's full name, and the UI shows it as a tooltip.
- The **Last 30 days** list never shows "late": an unticked old row is most
  likely handed in. Lateness is the Overdue card's job.
- **Registered as `school`**, the front end's key — not `canvas`, which is what
  the phase-1 crontab stub said.
- `event-assignment-*` UIDs are Assignments. `event-calendar-event-*` are
  **Class sessions** (the weekly live online classes), archived to
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

## Health (phase 7)

The Area was called Sleep until 2026-10; `/sleep` redirects to `/health`, and
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
   `https://your-tailnet-host.ts.net:8446/api/sleep/oauth/callback`.
   **Copy the secret now** — Google shows it once.
6. Into `.env`, then `docker compose up -d atlas-api` and press **Connect
   Fitbit** on the Status screen:

```
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://your-tailnet-host.ts.net:8446/api/sleep/oauth/callback
```

Google accepts the `ts.net` redirect — confirmed 2026-09-22. Register it on the
client under **Authorized redirect URIs**; until you do, every sign-in fails
with `redirect_uri_mismatch`, which is the same error a wrong port gives. If it
is ever refused, register `http://localhost:8080/oauth/callback` instead and set that
as `GOOGLE_OAUTH_REDIRECT_URI`. The Status screen then opens Google in a new tab
and asks you to paste the address it lands on. No code change either way.

### Things worth knowing

- **The sign-in dies every 7 days, by design.** Every Google Health scope is
  *Restricted*, so a personal app stays in Testing, where a refresh token
  expires 7 days after consent however often it's used. Google reports the
  deadline (`refresh_token_expires_in`); Atlas stores it, and Today shows a
  Reconnect banner from two days out, and again once it has lapsed. Production
  status would need Google verification plus a paid annual security assessment.
- **Refresh tokens do not rotate at Google** — the plan's assumption was wrong.
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

## Phases

Built: **1** (scaffolding), **2** (weather), **3** (Securo), **4**
(Audiobookshelf), **5** (habits), **6** (Canvas), **7** (Fitbit — live
2026-09-22; Google accepted the `ts.net` redirect URI, first sync archived 73
nights and 90 days of activity).
