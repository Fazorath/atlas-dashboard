#!/bin/sh
# Atlas installer. Run from a release:
#
#   curl -fsSL https://github.com/Fazorath/atlas-dashboard/releases/latest/download/install.sh | sh
#
# It needs only Docker with the Compose plugin. It makes ./atlas (or $ATLAS_DIR)
# holding the release docker-compose.yml, a generated .env and config/, starts
# Atlas from the published images (nothing is built here), waits for it, and
# prints the URL and the one-time setup code. Safe to run again in the same
# folder: it keeps .env, config/ and the pinned version.
#
# Settings (all optional, from the environment):
#   ATLAS_DIR      install folder                 (default ./atlas)
#   ATLAS_VERSION  image/release version to pin   (default: this script's release)
#   WEB_PORT, API_PORT   host ports               (default 8188, 8187)
#
# The release workflow replaces the tag below; a copy straight from the repo
# has no release of its own, so it needs ATLAS_VERSION.
set -eu

ATLAS_TAG="@ATLAS_TAG@"
RELEASES="${ATLAS_RELEASES_URL:-https://github.com/Fazorath/atlas-dashboard/releases}"

# Every docker call has stdin from /dev/null: under `curl | sh` the script itself
# arrives on stdin, and a docker command would swallow the rest of it.
say() { printf '%s\n' "$*"; }
die() {
  printf '\nCould not install Atlas: %s\n' "$*" >&2
  exit 1
}

# --- where and which version ----------------------------------------------------

DIR="${ATLAS_DIR:-./atlas}"

env_value() { # env_value KEY FILE: the last KEY=value in FILE
  [ -f "$2" ] || return 0
  sed -n "s/^$1=//p" "$2" | tail -n 1
}

tag_version=""
case "$ATLAS_TAG" in
  @*) ;;                       # not stamped: running from a repo copy
  v*) tag_version="${ATLAS_TAG#v}" ;;
  *) tag_version="$ATLAS_TAG" ;;
esac

pinned="$(env_value ATLAS_VERSION "$DIR/.env")"
VERSION="${ATLAS_VERSION:-${pinned:-$tag_version}}"
[ -n "$VERSION" ] || die "this copy of install.sh isn't from a release. Use the one on the Releases page, or set ATLAS_VERSION=<version>."
case "$VERSION" in
  *[!0-9A-Za-z._-]*) die "'$VERSION' is not a version number." ;;
esac
VERSION="${VERSION#v}"

# --- checks, before anything is written -----------------------------------------

command -v docker >/dev/null 2>&1 ||
  die "Docker isn't installed. Install Docker (https://docs.docker.com/engine/install/) and run this again."
docker compose version >/dev/null 2>&1 </dev/null ||
  die "Docker is here but the Compose plugin isn't. Install 'docker compose' (https://docs.docker.com/compose/install/) and run this again."
docker info >/dev/null 2>&1 </dev/null ||
  die "Docker is installed but not answering. Start it, or add your user to the 'docker' group, and run this again."

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  die "Neither curl nor wget is installed, so the compose file can't be downloaded."
fi
command -v openssl >/dev/null 2>&1 || [ -f "$DIR/.env" ] ||
  die "openssl isn't installed, and it makes the two secrets. Install it and run this again."

mkdir -p "$DIR" 2>/dev/null || die "can't create '$DIR'. Pick a folder you can write to: ATLAS_DIR=/some/folder"
[ -w "$DIR" ] || die "'$DIR' isn't writable by you. Pick a folder you can write to: ATLAS_DIR=/some/folder"

saved_web="$(env_value WEB_PORT "$DIR/.env")"
saved_web="${saved_web:-8188}"
saved_api="$(env_value API_PORT "$DIR/.env")"
saved_api="${saved_api:-8187}"
WEB_PORT="${WEB_PORT:-$saved_web}"
API_PORT="${API_PORT:-$saved_api}"
for pair in "WEB_PORT:$WEB_PORT" "API_PORT:$API_PORT"; do
  case "${pair#*:}" in
    '' | *[!0-9]*) die "${pair%%:*} must be a port number, not '${pair#*:}'." ;;
  esac
done

port_in_use() { # port_in_use PORT: true if something is listening on it
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v p=":$1" '$4 ~ p"$" { found = 1 } END { exit !found }'
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk -v p=":$1" '$4 ~ p"$" { found = 1 } END { exit !found }'
  else
    return 1 # can't tell; compose will say if it is taken
  fi
}

# Ports held by this very install (a re-run) aren't a clash.
running=""
if [ -f "$DIR/docker-compose.yml" ] && [ -f "$DIR/.env" ]; then
  running="$(cd "$DIR" && docker compose ps --status running -q 2>/dev/null </dev/null || true)"
fi
for pair in "WEB_PORT:$WEB_PORT:$saved_web" "API_PORT:$API_PORT:$saved_api"; do
  name="${pair%%:*}"
  rest="${pair#*:}"
  port="${rest%%:*}"
  saved="${rest#*:}"
  # A port this install already holds (a re-run) isn't a clash.
  [ -n "$running" ] && [ "$port" = "$saved" ] && continue
  if port_in_use "$port"; then
    die "port $port is already in use. Pick another with $name=<port>, for example: $name=$((port + 100)) (and the same variables on this command)."
  fi
done

# --- files ----------------------------------------------------------------------

say "Installing Atlas $VERSION in $DIR"

if [ ! -f "$DIR/docker-compose.yml" ] || [ "$VERSION" != "$pinned" ]; then
  tmp="$DIR/.docker-compose.yml.part"
  fetch "$RELEASES/download/v$VERSION/docker-compose.yml" "$tmp" ||
    { rm -f "$tmp"; die "couldn't download docker-compose.yml for v$VERSION from $RELEASES. Check the version and your connection."; }
  mv "$tmp" "$DIR/docker-compose.yml"
fi

set_env() { # set_env KEY VALUE: replace the line in .env, or add it (file stays private)
  (
    umask 077
    { grep -v "^$1=" "$DIR/.env" || true; printf '%s=%s\n' "$1" "$2"; } >"$DIR/.env.part"
  )
  mv "$DIR/.env.part" "$DIR/.env"
}

if [ -f "$DIR/.env" ]; then
  say "Keeping your existing .env"
  [ "$VERSION" = "$pinned" ] || set_env ATLAS_VERSION "$VERSION"
  [ "$WEB_PORT" = "$saved_web" ] || set_env WEB_PORT "$WEB_PORT"
  [ "$API_PORT" = "$saved_api" ] || set_env API_PORT "$API_PORT"
else
  (
    umask 077
    {
      printf 'ATLAS_VERSION=%s\n' "$VERSION"
      printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
      printf 'ATLAS_SECRET_KEY=%s\n' "$(openssl rand -base64 32)"
      [ "$WEB_PORT" = 8188 ] || printf 'WEB_PORT=%s\n' "$WEB_PORT"
      [ "$API_PORT" = 8187 ] || printf 'API_PORT=%s\n' "$API_PORT"
    } >"$DIR/.env"
  )
fi
chmod 600 "$DIR/.env"

# Made here, as you, so Docker never creates it root-owned (ADR 0008).
mkdir -p "$DIR/config"

# --- start and wait -------------------------------------------------------------

say "Starting Atlas (the first run downloads the images)..."
(cd "$DIR" && docker compose up -d </dev/null) || die "docker compose couldn't start Atlas. Run 'docker compose logs' in $DIR to see why."

api() { (cd "$DIR" && docker compose exec -T atlas-api python -c "import sys, urllib.request; sys.stdout.write(urllib.request.urlopen('http://127.0.0.1:8000$1', timeout=3).read().decode())" 2>/dev/null </dev/null); }

say "Waiting for Atlas to answer..."
tries=0
until api /api/health >/dev/null; do
  tries=$((tries + 1))
  [ "$tries" -lt "${ATLAS_WAIT_TRIES:-90}" ] || die "Atlas didn't come up in time. Run 'docker compose logs atlas-api' in $DIR to see why."
  sleep 2
done

# --- tell the user --------------------------------------------------------------

URL="http://127.0.0.1:$WEB_PORT"
owner="$(api /api/owner || true)"
case "$owner" in
  *'"claimed":true'* | *'"claimed": true'*) state=claimed ;;
  *'"claimed":false'* | *'"claimed": false'*) state=open ;;
  *) state=unknown ;;
esac

say ""
say "Atlas is running."
say ""
say "  Open:        $URL"
case "$state" in
  claimed) say "  This install already has an Owner; sign in with your passphrase." ;;
  open)
    code="$(cd "$DIR" && docker compose logs --no-log-prefix atlas-api 2>/dev/null </dev/null | sed -n 's/.*setup code: //p' | tail -n 1)"
    if [ -n "$code" ]; then
      say "  Setup code:  $code"
    else
      say "  Setup code:  not in the log yet. Get it with: cd $DIR && docker compose logs atlas-api | grep 'setup code'"
    fi
    ;;
  *) say "  Setup code:  get it with: cd $DIR && docker compose logs atlas-api | grep 'setup code'" ;;
esac
say ""
say "Back up $DIR/.env now. It holds the key that seals the passwords you enter in Setup;"
say "if it's lost, you enter them again."
say ""
say "Atlas has no login of its own yet, so it listens on this machine only (127.0.0.1)."
say "Don't publish it openly: reach it through a reverse proxy with authentication,"
say "or a private network such as Tailscale. See the Install page in the manual."
say "On a remote machine, open it through an SSH tunnel (ssh -L $WEB_PORT:127.0.0.1:$WEB_PORT <user>@<this-host>) or Tailscale; never publish the ports."
