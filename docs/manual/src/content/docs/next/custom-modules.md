---
title: Custom modules
description: Write your own Module in one YAML file. What works now, and what is still coming.
---

The seven first-party Modules cover what Atlas was first built for. **Custom modules** let you add your own, in one short YAML file: a number from your home server, a list from any JSON API.

:::caution[Partly built]
The file loader, URL sources, secrets and the **Stat** and **List** Widgets work today. The in-app editor and the other Widget types are still coming; see [what is still coming](#still-coming).
:::

## What works now

- **Drop a file in.** Each file in `config/custom/` is one Custom module, named by its file name. Add, edit or delete it and the change shows within a few seconds, with no restart.
- **Pull from a URL.** Atlas makes a GET request to the address you give and reads the JSON that comes back. Atlas does the fetching, not your browser, so the other server needs no CORS setup. Answers are cached for a minute and nothing is stored.
- **Secrets.** A module declares the secrets it needs (`secrets: [token]`) and uses them by name in a header value or the URL query. The Owner enters each value on the **Status** screen. Atlas stores it encrypted and apart from the file, and never shows it again, so a module file is always safe to share. A secret is bound to the host it was entered for: point the module at a new host and it asks again.
- **The Owner holds the keys.** Anyone who can open Atlas can rearrange Boards; only the Owner, unlocked with a passphrase, can enter or remove a module's secrets.
- **A new Area, or an existing one.** A module can bring an Area of its own, with its own icon and accent, or add its Widgets to an Area Atlas already has (`area: weather`).
- **A broken file is a Problem** on that module, shown on its Widgets and on the Status screen, naming the file and the line or field. It never stops Atlas from starting or touches another module.

## The two Widget types that work

A Custom module never brings its own drawing: it picks a built-in type and fills it, so every Widget looks like it belongs.

| Type | Sizes | For |
|---|---|---|
| **Stat** | S M | one value |
| **List** | M L XL | rows with a title, detail, value and status dot |

### Stat

```yaml
- id: temperature
  type: stat
  title: Living room
  source: {url: "http://homeassistant.local:8123/api/states/sensor.living_room_temperature"}
  value: state        # a dot path into the JSON response
  format: number      # number, or text (the default)
  decimals: 1
  unit: "°C"
```

### List

```yaml
- id: lights
  type: list
  title: Lights
  source: {url: "http://homeassistant.local:8123/api/states"}
  items: "."          # a dot path to the array; "." is the whole response
  where:              # keep rows whose field matches; every pattern must match
    entity_id: "light.*"
  limit: 10           # default 10, at most 50
  row:                # dot paths, each read inside one row
    title: attributes.friendly_name
    detail: entity_id
    value: state
    status: state
  status_map:         # raw values, compared as text → a dot
    ok: ["on"]
    bad: ["unavailable"]
```

- The row fields sit under `row:` because a Widget already has a `title` of its own. Only `row.title` is required.
- `status_map` takes `ok`, `warn` and `bad`, each a value or a list of values. A value it doesn't list gets no dot. Put `on`, `off`, `yes` and `no` in quotes: YAML otherwise reads them as true and false.
- A Stat shows its value, with the unit set small beside it. A List shows as many rows as its Size has room for, and counts the rest of the rows up to its `limit`.

## Example: Home Assistant

[`config.example/custom/home-assistant.yaml`](https://github.com/Fazorath/atlas-dashboard/blob/main/config.example/custom/home-assistant.yaml) shows one sensor as a Stat and your lights as a List, with every line commented.

1. Copy it to `config/custom/home-assistant.yaml`.
2. Change `homeassistant.local:8123` to the address you open Home Assistant at, and the sensor's entity id to one you have.
3. In Home Assistant, open your profile, then **Security**, then **Long-lived access tokens**, and create one.
4. In Atlas, unlock as Owner, open **Status**, find **Home Assistant** and paste the token.

The Widgets then appear in the Widget gallery. If the token is missing or wrong, or Home Assistant can't be reached, they say so and point you to Status. The example is not added to a fresh install: it only exists if you copy it.

## Still coming {#still-coming}

- **The in-app editor.** Paste or upload a file in Edit mode, see it checked line by line, preview it at every Size, and save. Until then you edit the files in `config/custom/` by hand.
- **More Widget types:** **Stats** (a few numbers side by side), **Meter** (a value against a maximum), **Links** (shortcuts to your other apps) and **Note** (text you write). A module that uses only these shows nothing yet, and a mixed module skips them without an error.
- **Secrets from the environment,** as `${ENV}` references. For now a secret is entered in the app.
- **A fresh install's two examples,** a Links module and a Welcome note, which appear once Links and Note are built.
- **A catalog of community modules** to browse and install from inside Atlas.

Ideas and requests are welcome as [issues](https://github.com/Fazorath/atlas-dashboard/issues).
