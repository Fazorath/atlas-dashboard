---
title: Notifications
description: Get told when homework is due, a Shift is coming up, a streak is at risk or a Source needs you, on your phone or desktop, without opening Atlas.
---

Atlas can send Notifications for School, Work and Habits, and when a Source needs you. They use Web Push, so there's no extra app and no account anywhere. Nothing is sent until you turn them on for a device.

## Turn them on

1. Open **Status** from the avatar menu.
2. In **Notifications**, tap **Turn on for this device** and allow notifications when asked.
3. Tap **Test** next to the device. A Notification should arrive within a few seconds.

**On iPhone or iPad**, notifications only work from the Home Screen app (iOS 16.4 or later), not a Safari tab. In Safari, tap Share → **Add to Home Screen**, open Atlas from the new icon, then turn them on there. If you added the icon before, remove it and add it again.

Turn them on for each device you want them on. **Remove** stops a device getting them.

## The Alerts

| Alert | Area | When | Default |
|---|---|---|---|
| Due tomorrow | School | every evening, what's due tomorrow and not ticked | 19:00 |
| Last call | School | before each due time, if not ticked | 3 h before |
| Overdue | School | the morning after the due day, if still not ticked | 08:00 |
| Shift reminder | Work | before each Shift starts | 90 min before |
| Next week not entered | Work | from Friday, once a day, until next week's Shifts are in | 18:00 |
| Streak at risk | Habits | every evening, each streak that breaks at midnight unless you tick it today | 20:00 |
| Google Health reconnect | Health | before Google's 7-day sign-in runs out, and again once it has or Google refuses it | 24 h before |
| Source failing | any | when a Source has failed every sync for a while | 6 h after |

Each Alert has its own switch and time in **Notifications**. An Alert only shows when its module is on in `atlas.yaml`; Source failing is always there. Class sessions never alert, and neither does a day off in an entered Week.

A streak needs two days or more to be at risk. Measured habits never alert, because Atlas ticks them itself when the day's data arrives, which can be the next morning. Source failing counts from the first failed sync after the last good one, so each outage alerts once. A Source that was never set up doesn't count as failing, and neither does Google Health once its sign-in has run out, since the reconnect Alert already covers that.

Each thing alerts once. If several things are due at once, they arrive as one Notification ("3 due tomorrow"). Tapping it opens the Alert's Area, or the Status screen for Google Health reconnect and Source failing. If an Assignment's due time moves, it can alert again.

## How it runs

`atlas-cron` calls the hidden `notify` source every 5 minutes, so a Notification arrives within 5 minutes of its time. The **Notifications** card shows when it last checked, and any error. To run a check by hand:

```bash
curl -X POST 127.0.0.1:8187/api/sync/notify
```

Your Atlas server sends each Notification to the push service of the device's browser (Apple, Google or Mozilla), so it needs outbound internet access. The phone doesn't need to reach Atlas for a Notification to arrive. The content is end-to-end encrypted, so the push service can't read it.

The signing keys are created on first use and kept in the database. Restoring a backup from before notifications were turned on means turning them on again on each device.
