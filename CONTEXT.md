# Atlas

A personal life dashboard: it gathers what you'd otherwise check in six apps (health, money, school, habits, weather, listening) into one place, and keeps its own archive of what it can.

## Language

### Structure

**Area**:
A top-level subject of your life that Atlas has a screen for: Health, Money, School, Habits, Weather, Listening. Each has one accent colour.
_Avoid_: Section (for this meaning), tab, category, page

**Section**:
A titled part inside an Area's screen (e.g. Sleep and Activity inside Health).
_Avoid_: Sub-area, panel

**Source**:
An upstream that feeds an Area (Google Health, Securo, Canvas, Audiobookshelf, Open-Meteo). An Area may have several Sources; Habits has none — you are its upstream.
_Avoid_: Integration, provider, connector

### Health

**Health**:
The Area for body data: sleep and daily activity, from any health Source.
_Avoid_: Sleep (as the Area's name), Fitness, Body

**Night**:
One main sleep session, filed under the local date you woke up. Naps are not Nights.
_Avoid_: Sleep session (in UI copy), sleep log

**Activity day**:
One local calendar day's steps, resting heart rate, active minutes, light minutes and calories. A missing figure means the Source had nothing, never zero.
_Avoid_: Stats, daily summary

### Habits

**Habit**:
Something you intend to do each day, tracked as ticks per local calendar day.
_Avoid_: Goal, routine, task

**Tick**:
A Habit marked done for one local day. No tick means not done; there is no "failed" state.
_Avoid_: Check, completion, entry

**Measured habit**:
A Habit linked to a figure from another Area and a target (e.g. Night asleep ≥ 8h), which Atlas ticks automatically when that day's data arrives.
_Avoid_: Auto habit, smart habit, linked habit

**Manual tick**:
A tick or untick you made by hand. On a Measured habit it overrides the measured result and is never overwritten.
_Avoid_: Override (as a noun in UI)

### Screens

**Today**:
The home screen: a Board of Widgets from any Area, about today only. It never shows stale data dressed as current.
_Avoid_: Home, dashboard, overview

**Card**:
Retired: Today's fixed one-per-Area summaries before it became a Board. Their job is now done by Widgets; tapping a Widget opens its Area — still the only way into Areas with no nav entry (Weather, Listening).
_Avoid_: Tile, widget, panel

### Money

**In / Out**:
Money that arrived / left this calendar month, from Securo. Out is always a positive magnitude.
_Avoid_: Income/expenses (in UI copy), credits/debits

**Uncategorised**:
Out that Securo has no category for yet. Shown as a to-do beside the category breakdown, never as a category of its own.
_Avoid_: Sem categoria, Other, Misc

### Health of the plumbing

**Freshness**:
How recently an Area's Source was last read ("checked 29m ago"), or "live" for a Source Atlas reads on every request. Shown in the Area screen's header.
_Avoid_: Last sync, staleness

**Problem**:
A Source that needs you to act (signed out, unreachable, misconfigured). The only plumbing fact Today ever shows.
_Avoid_: Error, alert, warning

**Status screen**:
The screen listing every Source with its Freshness and Problems; later also accounts and connections.
_Avoid_: Settings (until it holds settings), admin, diagnostics

### School

**Assignment**:
A Canvas to-do with a due time. The only School thing you tick or that counts toward "Due this week".
_Avoid_: Task, homework, deadline

**Class session**:
A scheduled live class meeting you join, from Canvas's calendar. A time, not a to-do: never ticked, never counted.
_Avoid_: Lecture (Canvas uses it in Assignment titles), event, meeting

### Widgets

**Board**:
A screen whose content is an arrangeable grid of Widgets. Today is a Board that takes Widgets from any Area; each Area's screen is a Board that takes only that Area's Widgets.
_Avoid_: Dashboard, page, layout (for the screen itself)

**Edit mode**:
The state of a Board in which Widgets can be added, removed, resized and reordered. Outside it, tapping a Widget opens its Area.
_Avoid_: Customize, layout mode

**Widget gallery**:
The sheet, opened from Edit mode, listing every Widget that can be placed on the current Board, grouped by Area.
_Avoid_: Store, picker, catalog (reserved for the marketplace)

**Area-only widget**:
A Widget that may be placed only on its own Area's Board (e.g. Sleep history, Past assignments), never on Today.
_Avoid_: Detail widget, page section

**Widget**:
One focused view of one Area's data (e.g. Money's "Upcoming bills"). An Area offers several; each looks deliberate at every Size it supports.
_Avoid_: Card, tile, module

**Size**:
One of S (1×1), M (2×1), L (2×2), XL (4×2). A bigger Size shows more information, never the same content stretched. On a phone XL stands tall (2×4) with the same information.
_Avoid_: Small/medium/large in code, span, width

**Greeting**:
The "Hello, there!" line in Today's toolbar, beside Edit. Not a Widget: the
Greeting Widget (date, greeting and the day's rings) was retired 2026-10-12,
so every Widget now belongs to an Area.
_Avoid_: Hero, header, welcome card
