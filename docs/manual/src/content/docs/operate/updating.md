---
title: Updating
description: Pull a new version, rebuild, and pick up any new settings.
---

Atlas updates in place. Your data lives in the database volume and your settings in `config/` and `.env`, none of which git touches.

## The short version

```bash
cd atlas
# 1. back up first: see Backups
git pull
docker compose up -d --build
```

Database migrations run automatically every time `atlas-api` starts, so there's no separate migrate step. Watch them go by with `docker compose logs -f atlas-api`.

## Pick up new settings

A new release can add a setting or a Module. Your copies of the config don't change on their own, so compare them with the templates:

```bash
git diff ORIG_HEAD -- config.example .env.example   # what this pull changed
diff -ru config.example config                      # your config against the template
```

Copy across any new keys you want, then `docker compose restart atlas-api` (for `config/`) or `docker compose up -d` (for `.env`).

A key Atlas doesn't know only produces a warning in the log, and a missing one falls back to its default, so an older `config/` keeps working; you just won't have the new thing until you add it.

## Pin a version

To stay on a known version, check out a tag or commit instead of following `main`:

```bash
git fetch --tags
git checkout <tag>
docker compose up -d --build
```

A checked-out tag doesn't follow `main`, so `git pull` stops working. To follow `main` again, run `git checkout main` before you pull.

## Rolling back

Migrations only go forward, so going back to an older version means going back to the [backup](/atlas-dashboard/operate/backups/) you took before updating. Anything written since that dump is lost.

Do it in this order. The newer code must not start against the restored data, and the restore has to go into an empty database:

```bash
docker compose stop atlas-api atlas-cron
git fetch --tags
git checkout <tag>
docker compose exec -T atlas-db dropdb -U atlas --force atlas
docker compose exec -T atlas-db createdb -U atlas atlas
docker compose exec -T atlas-db pg_restore -U atlas -d atlas < atlas-2026-10-01.dump
docker compose up -d --build
```

Use your `POSTGRES_USER` and `POSTGRES_DB` if you changed them from `atlas`.

Don't skip the drop and create. A plain `pg_restore --clean` only removes what's in the dump, so tables added by the newer version stay behind. When you next update, the newer migrations run again, find those tables already there, and `atlas-api` stops at boot with `DuplicateTable`.

## Clean up

Each rebuild leaves the previous images behind. Reclaim the space now and then:

```bash
docker image prune
```
