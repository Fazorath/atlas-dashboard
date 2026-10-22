---
title: Backups
description: What to back up, how to dump and restore the database, and what's sensitive.
---

## What to back up

| What | Where | Why |
|---|---|---|
| The database | the `pgdata` volume | Habit ticks, work shifts, School ticks, Board layouts and the archives. Some of it exists nowhere else. |
| `config/` | the repo folder | Your settings. Small, easy to rebuild, but no reason to. |
| `.env` | the repo folder | Your secrets. Back it up somewhere as private as the original, or not at all. |

What's **not** worth backing up: Money and Listening store nothing in Atlas, and the weather archive can't be refetched for past hours, but losing it costs only history.

Your Habits and Work rows, your School done-ticks and your Board layouts are the irreplaceable part: you are their only upstream.

## Dump the database

```bash
docker compose exec -T atlas-db pg_dump -U atlas -Fc atlas > atlas-$(date +%F).dump
```

Use your `POSTGRES_USER` and `POSTGRES_DB` if you changed them from `atlas`. The dump is consistent while Atlas is running; there's no need to stop it.

A nightly cron line on the host does it unattended:

```bash
15 3 * * *  cd /path/to/atlas && docker compose exec -T atlas-db pg_dump -U atlas -Fc atlas > backups/atlas-$(date +\%F).dump
```

## Restore

Into a running stack, replacing what's there:

```bash
docker compose stop atlas-api atlas-cron
docker compose exec -T atlas-db pg_restore -U atlas -d atlas --clean --if-exists < atlas-2026-10-01.dump
docker compose start atlas-api atlas-cron
```

On a new machine: clone, copy over `config/` and `.env`, `docker compose up -d atlas-db`, restore as above, then `docker compose up -d --build`.

## Treat the dump as sensitive

The dump contains your Google Health sign-in tokens (`oauth_tokens`) as well as your sleep and activity history. Store it like you store `.env`. If one leaks, press **Disconnect** on the Status screen, which revokes the token at Google, and connect again.

## Removing everything

`docker compose down -v` stops Atlas **and deletes its database volume**. Only do it on purpose, with a dump in hand.
