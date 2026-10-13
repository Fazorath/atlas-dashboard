# Every screen is an arrangeable grid of Widgets

Today and every Area screen are Boards: grids of Widgets the user adds, removes, reorders and resizes. Today accepts Widgets from any Area; an Area's own screen accepts only that Area's Widgets, including Area-only Widgets (e.g. Sleep history, Past assignments) that are too detailed for Today. There is no fixed, non-widget content on any screen — Source connection controls (e.g. Google Health connect/reconnect) live on the Status screen instead of inside an Area.

## Considered Options

- Custom-designed Area pages with separate compact Widgets for Today — rejected: two designs of every piece of data to keep in sync.
- A fixed block below each Area's grid for history/connection content — rejected: a second layout rule on every screen.
- Any Widget allowed anywhere — rejected: history-sized Widgets don't belong on a glanceable Today.

## Consequences

- A module's manifest declares where each Widget may be placed (Today and its Area, or its Area only).
- Every Board needs a default arrangement for a fresh account.
