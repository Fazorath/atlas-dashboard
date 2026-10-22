---
title: Custom modules
description: Coming next. Write your own Module in one YAML file and add it from inside the app.
---

:::note[Not built yet]
This page describes the design for the next release. Nothing on it works today.
:::

The seven first-party Modules cover what Atlas was first built for. **Custom modules** let you add your own, from inside the app, in one short YAML file: links to the apps you run, a note, a number from your home server, a list from any JSON API.

## What one looks like

A Custom module either brings a new Area of its own, with its own accent, or adds its Widgets to an existing Area. Its Widgets show content written into the file, or data Atlas pulls from a URL.

```yaml
atlas: 1                  # the format version
name: Home

area:                     # a new Area; or `area: weather` to join an existing one
  label: Home
  icon: house             # any Lucide icon name
  accent: amber           # a palette name, or a hex colour

secrets: [token]          # entered in the app, never written here

source:
  url: http://homeassistant.local:8123/api/states/sensor.living_room_temperature
  headers:
    Authorization: "Bearer {{secrets.token}}"

widgets:
  - id: living_room
    type: stat
    title: Living room
    value: state          # a dot path into the JSON response
    format: number
```

The exact format will be in this manual when it ships. This is the shape, not the spec.

## Widget types

A Custom module never brings its own drawing: it picks one of six built-in types and fills it, so every Widget looks like it belongs.

| Type | Sizes | For |
|---|---|---|
| **Stat** | S M | one number |
| **Stats** | M L | a few numbers side by side |
| **Meter** | S M | a value against a maximum |
| **List** | M L XL | rows with a title, detail, value and status dot |
| **Links** | S to XL | shortcuts to your other apps |
| **Note** | S M L | text you write |

## How it will work

- **Add from the app.** In Edit mode, the Widget gallery gets a **Custom** tab: paste or upload a file, see it validated line by line, preview it live at every Size, and save.
- **Files are the source of truth.** Each Custom module is a file in `config/custom/`. The app writes them, and a file you drop in by hand works too.
- **Pulls are live and cached**, for a minute by default. Nothing is archived. Atlas does the fetching, not your browser.
- **Secrets are entered in the app, not the file.** A module declares the secrets it needs (`secrets: [token]`) and refers to them by name. Atlas asks for each one when you add it, stores it encrypted and apart from the file, and never shows it again. So a module file is always safe to share. A secret is bound to the host it was entered for: point the module at a new host and it asks again.
- **The Owner holds the keys.** Anyone who can open Atlas can rearrange Boards; only the Owner, unlocked with a passphrase set in `.env`, can add, change or remove Custom modules or enter their secrets.
- **A fresh install starts with two examples**, a Links module and a Welcome note, both deletable.
- **A broken file is a Problem on that module**, shown on its Widgets and the Status screen. It never stops Atlas from starting.

## Examples it's designed for

- **Links** to the apps you run: Home Assistant, Uptime Kuma, your router.
- **Home Assistant** sensor states, with a long-lived access token.
- **Uptime Kuma** monitors as a List with ok / warn / bad dots.
- A **Note** with the Wi-Fi password for guests.

## After that

A catalog of community modules to browse and install from inside Atlas.

Ideas and requests are welcome as [issues](https://github.com/Fazorath/atlas-dashboard/issues).
