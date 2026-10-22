---
title: Troubleshooting
description: Symptoms, what they mean, and the fix.
---

Start with the two things Atlas already tells you: the **Status screen** (avatar menu), and the API's log.

```bash
docker compose logs --tail=100 atlas-api
curl -s 127.0.0.1:8187/api/sync/status | python3 -m json.tool
```

## The page

| Symptom | Likely cause | Fix |
|---|---|---|
| The page won't load at all | `atlas-api` didn't start, often broken YAML | `docker compose logs atlas-api`: the error names the file. |
| A Module's Area is missing | It isn't in `modules:`, or the id is misspelt | Check `atlas.yaml`; unknown ids are listed in the log. Then `docker compose restart atlas-api`. |
| A setting seems ignored | A typo in a key, or not restarted | Unknown keys are warned about in the log, with the list of known ones. |
| Changed `.env`, nothing happened | `restart` keeps the old environment | `docker compose up -d atlas-api`. |
| Habit ticks land on the wrong day | `timezone` in `atlas.yaml` | Set your IANA zone and restart. `TZ` in `.env` only sets container clocks. |
| A Widget says **Set up** | Its Module is on but its settings or secrets are missing | See that Module's page. Status says which. |

## Sources

| Symptom | Likely cause | Fix |
|---|---|---|
| Weather: `503 The service is overloaded` | Open-Meteo's free tier is busy | Nothing: retried automatically, and the next hourly run repairs the gap. |
| Weather: `400` | Bad coordinates | Check `latitude`/`longitude` are decimal degrees in range. |
| Money: unreachable | Securo stopped, or `atlas-api` isn't on its network | Check the [compose override](/atlas-dashboard/start/configuration/#reaching-your-other-apps) and `base_url`. |
| Money: "requires 2FA" | The Securo account has two-factor auth on | Use an account without it. |
| Listening: problem names `ABS_TOKEN` | The API key was revoked or mistyped | Mint a new one in Audiobookshelf, **Settings → API Keys**. |
| Listening: no "open in Audiobookshelf" link | `public_url` is blank | Set it to the address your browser uses. |
| School: `HTTP 404, was the feed URL reset in Canvas?` | The feed URL was reset | Copy the new one into `CANVAS_ICS_URL`, `docker compose up -d atlas-api`. |
| School: nothing changes after a sync | The feed came back empty | Deliberate: an empty feed changes nothing. Open the URL in a browser to check it. |
| Health: `redirect_uri_mismatch` | `redirect_uri` doesn't match the client exactly | Same scheme, host, port and path in both places. |
| Health: 403 mentioning `UberMint` | The Fitbit account is a legacy Fitbit login | In the Fitbit app, sign in with "Continue with Google", then reconnect. |
| Health: 403 on resting heart rate | The third scope wasn't granted | Reconnect and allow all three scopes. |
| Health: Reconnect banner every week | Google's Testing mode, by design | Tap Reconnect. See [Health](/atlas-dashboard/modules/health/#gotchas). |
| Health: last night missing in the morning | The watch hasn't synced since you woke | Open the Fitbit app; the :40 run picks it up. |

## Sync by hand

Every Source can be run on demand, which prints what happened:

```bash
curl -s -X POST 127.0.0.1:8187/api/sync/weather | python3 -m json.tool
```

The names are `weather`, `finance`, `listening`, `school` and `sleep`. A `204` with no body means that Module is switched off.

## Still stuck

[Open an issue](https://github.com/Fazorath/atlas-dashboard/issues) with what you expected, what happened, and the relevant lines of `docker compose logs atlas-api`. **Check the log for secrets before pasting it.**
