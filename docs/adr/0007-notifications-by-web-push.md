# Notifications go out by Web Push from the Home Screen app, checked by cron

Atlas sends Notifications for a few Alerts: homework due tomorrow, a last call before a due time, overdue the morning after, a Shift reminder, and next week's Shifts not entered yet. They are sent by **Web Push** to the Atlas Home Screen app (or any browser that supports it). The browser subscribes with a VAPID key that Atlas makes on first use and keeps in the database. Every 5 minutes the cron container calls the hidden `notify` source. That run works out which Alerts are due, skips anything already in `notify_sent`, groups what's left into one Notification per Alert, and sends it.

## Considered Options

- **ntfy** (a self-hosted or ntfy.sh topic, plus the ntfy app). Rejected for v1. It needs a second app, and on iOS a self-hosted server still relays wake-ups through ntfy.sh. Each public install would also have to set up a topic. Web Push needs nothing beyond the app you already have, its payload is encrypted end to end, and a tap opens Atlas on the right Area. ntfy can be added later as a second channel if someone asks.
- **An in-API scheduler loop.** Rejected. Cron already drives every Source. As a hidden Source, each run is a `sync_runs` row like any other, so a dead notifier is visible on the Status screen without new plumbing.
- **Quiet hours.** Considered and dropped: every Alert already has its own time, and you can switch any of them off.
- **Settings in YAML.** Rejected. Notifications are switched on from the device itself (the browser has to ask permission), so their settings sit beside that switch on the Status screen and are stored in the database. Defaults live in code, and an Alert with no row runs at its defaults.

## Consequences

- On an iPhone, Notifications only work from the Home Screen app (iOS 16.4+), never a Safari tab. An icon added before Atlas had a manifest has to be removed and added again.
- The push services (Apple, Google, Mozilla) are on the internet. Atlas's server must be able to reach them, but the phone never has to reach Atlas for a Notification to arrive.
- Each thing alerts once: the sent key names it (an Assignment and its due time, a Shift's date and start, next Week and today, a Habit and today, a Source and when its failures began, a Google consent). A moved due time is a new key and can alert again.
- Rules are windows, not instants: a 19:00 Alert is due from 19:00 until midnight, and a lead-time Alert from its lead until the thing starts. A late or missed cron run still sends, and turning a device on mid-window sends what is already due.
- Nothing is evaluated or marked sent while no Device is on. If no Device accepts a Notification, it isn't marked sent, so the next run retries while the window is open.
- No Owner gate yet: anyone who can reach Atlas can change these settings, as with Boards. It arrives with Custom modules.
