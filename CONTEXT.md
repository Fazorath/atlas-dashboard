# Atlas

A personal life dashboard: it gathers what you'd otherwise check in six apps (health, money, school, habits, weather, listening) into one place, and keeps its own archive of what it can.

## Language

### Structure

**Area**:
A top-level subject of your life that Atlas has a screen for: Health, Money, School, Habits, Weather, Listening. Each has one accent colour. An Area exists while at least one Module that feeds it is on, first-party or Custom.
_Avoid_: Section (for this meaning), tab, category, page

**Section**:
A titled part inside an Area's screen (e.g. Sleep and Activity inside Health).
_Avoid_: Sub-area, panel

**Source**:
An upstream that feeds an Area (Google Health, Securo, Canvas, Audiobookshelf, Open-Meteo). An Area may have several Sources; Habits has none — you are its upstream.
_Avoid_: Integration, provider, connector

**Module**:
One switchable unit of Atlas, named by its id in `config/atlas.yaml` (`open_meteo`, `securo`, `canvas`…): an Area plus the Source that feeds it, if any. Switching it off removes its Widgets and sync, and its Area too unless another Module still feeds it; never its stored data.
_Avoid_: Plugin, app, integration

**Custom module**:
A Module you write yourself in one YAML file rather than one shipped with Atlas. It either brings a new Area of its own or adds its Widgets to an existing Area, as its author chooses. Its Widgets show content written into the file, or data Atlas pulls from a URL.
_Avoid_: Custom widget, user widget, plugin

**Owner**:
The one person an install belongs to. Anyone who can open Atlas may look and rearrange Boards; only the Owner may add, change or remove a Custom module or enter its secrets.
_Avoid_: Admin, user (until there are accounts)

**Setup**:
The guided first run on a fresh install: you create the Owner passphrase, say who the dashboard is for and where you are, pick Modules and connect each one. Afterwards the same forms are edited one section at a time from the Status screen, Owner-only. Every Module can be saved before it works; a failing one shows up as a Problem.
_Avoid_: Wizard, onboarding, installer

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

**Habit icon**:
An optional single emoji or character shown in place of a Habit's first letter. Decoration only: a Habit is always named by its name.
_Avoid_: Avatar, symbol, short name

**Tick**:
A Habit marked done for one local day. No tick means not done; there is no "failed" state.
_Avoid_: Check, completion, entry

**Backfill**:
Ticking or unticking a past day, after the fact. Any day up to today can be backfilled, including days before the Habit was added.
_Avoid_: Catch up, edit history, late tick

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
_Avoid_: Error, warning, alert (that's a Notification kind)

**Status screen**:
The screen listing every Source with its Freshness and Problems, then the Settings sections: Setup's forms, one section each, Owner-only. Later also accounts.
_Avoid_: admin, diagnostics

### School

**Assignment**:
A Canvas to-do with a due time. The only School thing you tick or that counts toward "Due this week".
_Avoid_: Task, homework, deadline

**Class session**:
A scheduled live class meeting you join, from Canvas's calendar. A time, not a to-do: never ticked, never counted.
_Avoid_: Lecture (Canvas uses it in Assignment titles), event, meeting

**Study plan**:
The School Widget that lays the next week's open Assignments out as Study blocks in free time, earliest due first, with each one's effort guessed from its title.
_Avoid_: Schedule (that's Work's), timetable, planner (in UI copy)

**Study block**:
A suggested stretch of free time to work on one open Assignment, placed around Class sessions and Shifts by the Study plan. Worked out on every read, never stored or ticked: ticking the Assignment is what clears its blocks.
_Avoid_: Session (that's a Class session), study slot, task

### Work

**Shift**:
The hours you work on one date: one start and one end on the same day. A date has at most one Shift.
_Avoid_: Schedule (for a single day), slot, hours

**Close**:
The end of the working day, written "C" on the Schedule photo ("3 to C"). Its time depends on the weekday, so a Shift that ends at Close ends at that weekday's closing time.
_Avoid_: End of day, closing shift

**Week**:
Monday to Sunday of Shifts, entered all at once. Once entered, a day with no Shift is a day off; a Week nobody has entered is "not entered", not a week off.
_Avoid_: Rota, schedule (for the stored week)

**Schedule photo**:
A photo of the printed staff schedule, which lists many people's hours by weekday. Atlas reads your row from it to fill in a Week for you to check; the photo itself is never kept.
_Avoid_: Scan, upload, roster (for the photo)

**Draft week**:
The Shifts Atlas read from a Schedule photo, waiting for you to check. Nothing in a Draft week counts until you Save it; saving makes it the Week.
_Avoid_: Pending week, suggestion, import

### Notifications

**Alert**:
One kind of thing Atlas tells you without being opened, with one rule for when: "Due tomorrow" at 19:00, "Shift reminder" 90 minutes before. Each Alert has its own switch and time on the Status screen, and sends about each thing once.
_Avoid_: Reminder (for the kind), rule, trigger

**Notification**:
What one Alert sends in one go, shown by the device. Several things due at once arrive as one Notification ("3 due tomorrow"); tapping it opens the Alert's Area, or the Status screen for an Alert about a Source.
_Avoid_: Push, message, alert (for the thing on screen)

**Device**:
A browser or Home Screen app you turned Notifications on for. Nothing is sent while there are none.
_Avoid_: Subscription, client

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

**Widget type**:
One of the built-in ways a Custom module's Widget can be drawn: Stat, Stats, Meter, List, Links or Note. A Custom module chooses a type and fills it; it never brings its own drawing.
_Avoid_: Template, component, renderer

**Size**:
One of S (1×1), M (2×1), L (2×2), XL (4×2). A bigger Size shows more information, never the same content stretched. On a phone XL stands tall (2×4) with the same information.
_Avoid_: Small/medium/large in code, span, width

**Greeting**:
The "Hello, Sam!" line in Today's toolbar (the name is `name` in `config/atlas.yaml`), beside Edit. Not a Widget: the
Greeting Widget (date, greeting and the day's rings) was retired,
so every Widget now belongs to an Area.
_Avoid_: Hero, header, welcome card
