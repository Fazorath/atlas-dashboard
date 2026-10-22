---
title: What Atlas is
description: The handful of words the rest of this manual uses, and how the pieces fit.
---

Atlas gathers the things you would otherwise check in half a dozen apps into one place, and keeps its own archive of whatever it can. It is a small Docker Compose stack: a Postgres database, an API, a web app and a cron container that asks the API to sync each Source on a schedule.

The manual uses a few words precisely. They are the same words the app and its code use.

## The words

| Word | Meaning |
|---|---|
| **Area** | A subject of your life that has a screen: Health, School, Money, Habits, Weather, Listening, Work. Each Area owns one accent colour. |
| **Source** | The upstream that feeds an Area: Open-Meteo, Securo, Audiobookshelf, Canvas, Google Health. Habits and Work have none: **you** are their upstream. |
| **Module** | One switchable unit of Atlas: an Area plus the Source that feeds it. You turn Modules on by their id in `config/atlas.yaml` (`open_meteo`, `habits`, `canvas`…). |
| **Widget** | One focused view of one Area's data, such as Money's "Upcoming bills". Each Area offers several. |
| **Size** | A Widget's footprint: **S** (1×1), **M** (2×1), **L** (2×2) or **XL** (4×2). A bigger Size shows more, never the same thing stretched. |
| **Board** | A screen made of an arrangeable grid of Widgets. **Today** takes Widgets from every Area; each Area's own screen is a Board that takes only its own. |
| **Freshness** | How recently a Source was last read ("checked 29m ago"), or "live" for a Source read on every request. |
| **Problem** | A Source that needs you to act: signed out, unreachable, not set up. The only plumbing Today ever shows. |

## The Modules

| Module | Area | Source | Needs |
|---|---|---|---|
| [`open_meteo`](/atlas-dashboard/modules/weather/) | Weather | Open-Meteo | nothing but your coordinates |
| [`habits`](/atlas-dashboard/modules/habits/) | Habits | you | nothing |
| [`work`](/atlas-dashboard/modules/work/) | Work | you | nothing: you type in your weekly shifts |
| [`securo`](/atlas-dashboard/modules/money/) | Money | Securo | a self-hosted Securo |
| [`audiobookshelf`](/atlas-dashboard/modules/listening/) | Listening | Audiobookshelf | a self-hosted Audiobookshelf and an API key |
| [`canvas`](/atlas-dashboard/modules/school/) | School | Canvas | your Canvas calendar-feed URL |
| [`google_health`](/atlas-dashboard/modules/health/) | Health | Google Health API | a Google Cloud OAuth client (Fitbit / Pixel Watch) |

## Archive or live

Each Source is one of two kinds, and it changes what Atlas keeps:

- **Archived** Sources (Weather, School, Health) are synced on a schedule into Atlas's own tables. The Widgets read that archive, never the upstream, so a failed sync costs Freshness, not the Widget. You also keep history the upstream forgets.
- **Live** Sources (Money, Listening) are read straight through on every request and **store nothing** in Atlas. Your money already has a source of truth, and a book position stops being true the moment you press play on your phone; a copy could only ever be behind.

Habits and Work are neither: they have no Source, and the rows you enter are the only record.

## Switching a Module off

Remove a Module from `config/atlas.yaml` and its Widgets, its sync and its Area all disappear. **Nothing it stored is deleted**, so adding it back brings its history with it.
