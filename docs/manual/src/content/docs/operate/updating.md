---
title: Updating
description: Pull a new version, rebuild, and pick up any new settings.
---

Atlas updates in place. Your data lives in the database volume and your settings in `config/` and `.env`, none of which git touches.

## The short version

Installed with the one-command installer? Your install pins a version in `.env` (`ATLAS_VERSION`). To move to a newer release, [back up](/atlas-dashboard/operate/backups/) first, then either edit that line:

```bash
cd atlas
$EDITOR .env        # ATLAS_VERSION=<new version>
docker compose pull
docker compose up -d
```

or re-run the installer from the folder that holds `atlas/` (or with the same `ATLAS_DIR` you installed with, otherwise it makes a second, empty install), with the version you want. It updates that one line, keeps your secrets and `config/`, then pulls and restarts:

```bash
curl -fsSL https://github.com/Fazorath/atlas-dashboard/releases/latest/download/install.sh | ATLAS_VERSION=<new version> sh
```

The versions are on the [Releases](https://github.com/Fazorath/atlas-dashboard/releases) page, with what changed in each.

Built from source instead? Back up, then:

```bash
cd atlas
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

An installed Atlas is already pinned: it stays on `ATLAS_VERSION` until you change it. A source build can stay on a known version by checking out a tag or commit instead of following `main`:

```bash
git fetch --tags
git checkout <tag>
docker compose up -d --build
```

A checked-out tag doesn't follow `main`, so `git pull` stops working. To follow `main` again, run `git checkout main` before you pull.

## Rolling back

Migrations only go forward, so going back to an older version means going back to the [backup](/atlas-dashboard/operate/backups/) you took before updating. Anything written since that dump is lost.

**Installed from a release:** from the install folder, in this order:

```bash
docker compose stop atlas-api atlas-cron
$EDITOR .env        # ATLAS_VERSION=<old version>
docker compose pull
docker compose exec -T atlas-db dropdb -U atlas --force atlas
docker compose exec -T atlas-db createdb -U atlas atlas
docker compose exec -T atlas-db pg_restore -U atlas -d atlas < ~/atlas-backups/atlas-2026-10-01.dump
docker compose up -d
```

**Built from source,** in this order. The newer code must not start against the restored data, and the restore has to go into an empty database:

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

## What's new

The first time you open Atlas after an update, a short sheet shows the version, its date and what changed. Tap **Got it** and it stays gone for that version on that device. Reopen it, or read older releases, from **Status → What's new**. A fresh install doesn't show it, and a build you made yourself from the repo has no version, so it shows nothing. The notes come from `CHANGELOG.md`.

## Clean up

Each rebuild leaves the previous images behind. Reclaim the space now and then:

```bash
docker image prune
```
