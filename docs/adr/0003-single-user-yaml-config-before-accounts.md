# The first open-source release is single-user, configured by YAML files

To make Atlas something a stranger can clone and run, the first release keeps one owner per install and moves every non-secret setting into `config/atlas.yaml` (name, timezone, which modules are on) and `config/modules/<module>.yaml` (each module's settings). Secrets stay in `.env`. Module ids are the ones the M1 manifest design fixed (`open_meteo`, `securo`, `audiobookshelf`, `canvas`, `google_health`, `habits`, `work`), so each module file is exactly the `config:` block that module's manifest will later describe.

## Considered Options

- Full M1 (manifests + loader) and M2 (local accounts, encrypted per-connection credentials) before any release — rejected for now: months before anyone can try it, and the YAML files carry straight over into M2's connect forms.
- Keep everything in `.env` — rejected: one flat list of 25 variables mixes secrets with coordinates, and can't say which modules are on.

## Consequences

- YAML wins over the environment where both set a value; no `config/atlas.yaml` means every module on, which is how Atlas behaved before.
- Joining other compose stacks' networks moved out of `docker-compose.yml` into a local `docker-compose.override.yml`, so a fresh clone boots without Securo or Audiobookshelf.
- Still no login: the README says to put Atlas behind Tailscale or an authenticating proxy until M2.
