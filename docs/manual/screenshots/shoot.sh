#!/usr/bin/env bash
# Regenerate the manual's screenshots from a throwaway, demo-seeded Atlas.
#
#   docs/manual/screenshots/shoot.sh            # up, seed, shoot, tear down
#   docs/manual/screenshots/shoot.sh up         # just start + seed the stack
#   docs/manual/screenshots/shoot.sh shoot      # just take the pictures
#   docs/manual/screenshots/shoot.sh down       # remove the stack and its volume
#   docs/manual/screenshots/shoot.sh gif        # record the README demo GIF instead
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
#
# `gif` starts the same stack plus a tiny static JSON server (demo-json, only in
# this throwaway stack), records record_gif.py's demo, and turns the video into
# readme-demo.gif with ffmpeg in a container. No internet or secrets needed.
set -euo pipefail

# Fixed on purpose: nothing here comes from the caller's environment. An
# exported PROJECT=atlas would make `down -v` delete the real database volume,
# a preset WORK would be rm -rf'd, and WEB_PORT=8188 would screenshot the real
# install into public assets. PLAYWRIGHT_IMAGE is the only override.
PROJECT="atlas-manualshots"
API_PORT=8297
WEB_PORT=8298
BIND_ADDRESS=127.0.0.1
WORK="/tmp/atlas-manualshots"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright/python:v1.55.0-noble}"
FFMPEG_IMAGE="${FFMPEG_IMAGE:-docker.io/jrottenberg/ffmpeg:7.1-alpine}"
JSON_IMAGE="docker.io/library/python:3.13-alpine"
GIF_MAX_BYTES=5000000

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OUT="$REPO/docs/manual/src/assets/screens"

if [ "$PROJECT" = "atlas" ]; then
  echo "refusing to run under the project name 'atlas' (your real install)" >&2
  exit 1
fi

# Compose lets exported variables override the .env file, so run it with an
# empty environment (only what the client needs to find its daemon) and the
# generated .env as the sole source of settings.
compose() {
  env -i PATH="$PATH" HOME="$HOME" \
    ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} \
    ${DOCKER_CONTEXT:+DOCKER_CONTEXT="$DOCKER_CONTEXT"} \
    ${DOCKER_CONFIG:+DOCKER_CONFIG="$DOCKER_CONFIG"} \
    ${XDG_RUNTIME_DIR:+XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR"} \
    docker compose -p "$PROJECT" --project-directory "$WORK" \
    --env-file "$WORK/.env" -f "$WORK/docker-compose.yml" \
    ${DEMO_JSON:+-f "$WORK/docker-compose.demo.yml"} "$@"
}

up() {
  # A previous run's database volume still holds its old random password, so
  # start from nothing: remove that project's containers and volumes first.
  [ -f "$WORK/docker-compose.yml" ] && DEMO_JSON= compose down -v --remove-orphans || true
  docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" \
    | xargs -r docker volume rm >/dev/null || true
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
ATLAS_SECRET_KEY=screenshots-only-$(date +%s)-0123456789abcdef0123456789
BIND_ADDRESS=$BIND_ADDRESS
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

  mkdir -p "$WORK/config/custom"
  if [ -n "${DEMO_JSON:-}" ]; then
    mkdir -p "$WORK/demo-json"
    cp "$HERE/demo/services.json" "$WORK/demo-json/"
    cat >"$WORK/docker-compose.demo.yml" <<EOF
services:
  demo-json:
    image: $JSON_IMAGE
    command: python -m http.server 8000 --directory /srv
    volumes:
      - ./demo-json:/srv:ro
EOF
  fi

  compose up -d --build
  echo "waiting for atlas-api..."
  healthy=
  for _ in $(seq 60); do
    if curl -fs "http://127.0.0.1:$API_PORT/api/config" >/dev/null; then
      healthy=1
      break
    fi
    sleep 2
  done
  if [ -z "$healthy" ]; then
    echo "error: timed out after 120s waiting for atlas-api at /api/config" >&2
    exit 1
  fi
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

gif() {
  local out="$REPO/docs/manual/src/assets/screens" video="$WORK/video"
  mkdir -p "$out" "$video"
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$HERE:/shots:ro" -v "$video:/out" -v "$WORK/config/custom:/custom" \
    "$PLAYWRIGHT_IMAGE" \
    sh -c "pip install -q --disable-pip-version-check playwright==1.55.0 \
           && cd /shots && python record_gif.py http://127.0.0.1:$WEB_PORT /out /custom /shots/demo/homelab.yaml"
  # Two-pass palette (palettegen/paletteuse): a small GIF that keeps the dark
  # theme's colours. Over budget: drop the fps first, then narrow it.
  local width fps size=0 setting
  for setting in "960 15" "960 12" "800 12" "800 10"; do
    set -- $setting; width=$1; fps=$2
    docker run --rm --user "$(id -u):$(id -g)" -v "$video:/work" --entrypoint ffmpeg "$FFMPEG_IMAGE" \
      -v error -y -i /work/demo.webm \
      -vf "fps=$fps,scale=$width:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
      -loop 0 /work/readme-demo.gif
    size=$(stat -c %s "$video/readme-demo.gif")
    echo "readme-demo.gif at ${width}px, ${fps} fps: $size bytes"
    [ "$size" -le "$GIF_MAX_BYTES" ] && break
  done
  if [ "$size" -gt "$GIF_MAX_BYTES" ]; then
    echo "error: readme-demo.gif is $size bytes, over the $GIF_MAX_BYTES budget" >&2
    exit 1
  fi
  cp "$video/readme-demo.gif" "$out/readme-demo.gif"
  echo "wrote readme-demo.gif"
}

down() {
  [ -f "$WORK/docker-compose.yml" ] && DEMO_JSON= compose down -v --rmi local --remove-orphans || true
  rm -rf "$WORK"
}

case "${1:-all}" in
  up) up ;;
  shoot) shoot ;;
  down) down ;;
  all) trap down EXIT; up; shoot ;;
  gif) trap down EXIT; DEMO_JSON=1; up; gif ;;
  *) echo "usage: $0 [up|shoot|gif|down]" >&2; exit 2 ;;
esac
