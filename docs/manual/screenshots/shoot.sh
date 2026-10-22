#!/usr/bin/env bash
# Regenerate the manual's screenshots from a throwaway, demo-seeded Atlas.
#
#   docs/manual/screenshots/shoot.sh            # up, seed, shoot, tear down
#   docs/manual/screenshots/shoot.sh up         # just start + seed the stack
#   docs/manual/screenshots/shoot.sh shoot      # just take the pictures
#   docs/manual/screenshots/shoot.sh down       # remove the stack and its volume
#
# It never touches your own install: the repo is copied (without config/,
# .env or docker-compose.override.yml) to a temp folder and run there under
# its own compose project, on its own loopback ports, with a fresh database
# filled by `python -m app.demo` (persona "Sam"). Weather is real: it syncs
# Open-Meteo for the example coordinates. Money and Listening have no demo
# data, so they show as "needs setup".
#
# Needs docker and network access. The pictures are taken by the Playwright
# Python image with --network host, and land in docs/manual/src/assets/screens/.
set -euo pipefail

PROJECT="${PROJECT:-atlas-manualshots}"
API_PORT="${API_PORT:-8297}"
WEB_PORT="${WEB_PORT:-8298}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright/python:v1.55.0-noble}"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OUT="$REPO/docs/manual/src/assets/screens"
WORK="${WORK:-${TMPDIR:-/tmp}/$PROJECT}"

compose() {
  docker compose -p "$PROJECT" --project-directory "$WORK" -f "$WORK/docker-compose.yml" "$@"
}

up() {
  rm -rf "$WORK" && mkdir -p "$WORK"
  # The app only: no local config, secrets, override or docs.
  tar -C "$REPO" \
    --exclude=./.git --exclude=./config --exclude=./.env \
    --exclude=./docker-compose.override.yml --exclude=./docs \
    --exclude=node_modules --exclude=dist \
    -cf - . | tar -C "$WORK" -xf -

  cat >"$WORK/.env" <<EOF
POSTGRES_USER=atlas
POSTGRES_DB=atlas
POSTGRES_PASSWORD=screenshots-only-$(date +%s)
BIND_ADDRESS=127.0.0.1
API_PORT=$API_PORT
WEB_PORT=$WEB_PORT
TZ=America/New_York
EOF

  # Every module on; the four that need no account get demo rows or real
  # weather, Money and Listening stay unset on purpose.
  mkdir -p "$WORK/config/modules"
  cp "$REPO/config.example/modules/open_meteo.yaml" "$WORK/config/modules/"
  cat >"$WORK/config/atlas.yaml" <<'EOF'
name: Sam
timezone: America/New_York
modules:
  - open_meteo
  - habits
  - work
  - securo
  - audiobookshelf
  - canvas
  - google_health
demo: true
EOF

  compose up -d --build
  echo "waiting for atlas-api..."
  for _ in $(seq 60); do
    curl -fs "http://127.0.0.1:$API_PORT/api/config" >/dev/null && break
    sleep 2
  done
  compose exec -T atlas-api python -m app.demo
  for source in weather school sleep finance listening; do
    curl -fs -X POST "http://127.0.0.1:$API_PORT/api/sync/$source" >/dev/null || true
  done
  echo "Atlas demo at http://127.0.0.1:$WEB_PORT"
}

shoot() {
  mkdir -p "$OUT"
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$HERE:/shots:ro" -v "$OUT:/out" "$PLAYWRIGHT_IMAGE" \
    sh -c "pip install -q --disable-pip-version-check playwright==1.55.0 \
           && python /shots/capture.py http://127.0.0.1:$WEB_PORT /out"
}

down() {
  [ -f "$WORK/docker-compose.yml" ] && compose down -v --rmi local || true
  rm -rf "$WORK"
}

case "${1:-all}" in
  up) up ;;
  shoot) shoot ;;
  down) down ;;
  all) up; trap down EXIT; shoot ;;
  *) echo "usage: $0 [up|shoot|down]" >&2; exit 2 ;;
esac
