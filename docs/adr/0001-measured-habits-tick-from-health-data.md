# Measured habits tick themselves from Health data; a manual tick always wins

Habits used to have no Source: you were its only upstream. Habits like "sleep 8 hours" or "walk 10k steps" duplicated figures Atlas already archives from Health and went unticked, so a Habit may now be linked to a Health figure and a target and is ticked automatically when that day's data arrives. A manual tick or untick always overrides the measured result and is never overwritten by a later sync, so Habits stays trustworthy as the one place you are the authority.

## Consequences

- This is the first time one Area reads another Area's data; the module system must allow it rather than isolate modules completely.
- A measured habit's day follows the linked figure's own day rule (a Night belongs to the date you woke up), and may tick late because steps are only final once the day has synced.
