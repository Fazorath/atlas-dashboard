#!/usr/bin/env bats
# Tests for install.sh with a stubbed docker, curl and ss. Run: bats tests/installer

setup() {
  ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  WORK="$(mktemp -d)"
  STUBS="$WORK/stubs"
  mkdir -p "$STUBS" "$WORK/releases/download/v0.1.0"
  echo "services: {}" >"$WORK/releases/download/v0.1.0/docker-compose.yml"

  # install.sh as the release job stamps it.
  sed 's/@ATLAS_TAG@/v0.1.0/' "$ROOT/install.sh" >"$WORK/install.sh"

  cat >"$STUBS/docker" <<'STUB'
#!/bin/sh
echo "docker $*" >>"$STUB_LOG"
[ "$1" = info ] && exit "${STUB_INFO_RC:-0}"
[ "$1" = compose ] || exit 0
shift
case "$1" in
  version) exit "${STUB_COMPOSE_RC:-0}" ;;
  ps) [ -n "${STUB_RUNNING:-}" ] && echo abc123; exit 0 ;;
  up) exit "${STUB_UP_RC:-0}" ;;
  exec)
    case "$*" in
      *api/owner*) echo "{\"claimed\":${STUB_CLAIMED:-false},\"unlocked\":false}" ;;
      *) echo '{"status":"ok"}' ;;
    esac ;;
  logs) echo "atlas-api  | INFO Starting"
        [ -z "${STUB_NO_CODE:-}" ] && echo "WARNING This Atlas has no Owner yet. Open it in a browser and enter the setup code: ${STUB_CODE:-ABCD-2345}" ;;
esac
exit 0
STUB
  cat >"$STUBS/curl" <<'STUB'
#!/bin/sh
# curl -fsSL URL -o FILE: serve from $RELEASES_DIR
url=""; out=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift ;; -*) ;; *) url="$1" ;; esac
  shift
done
echo "curl $url" >>"$STUB_LOG"
f="$RELEASES_DIR/${url#"$ATLAS_RELEASES_URL"/}"
[ -f "$f" ] || exit 22
cp "$f" "$out"
STUB
  cat >"$STUBS/ss" <<'STUB'
#!/bin/sh
for p in $STUB_BUSY_PORTS; do echo "LISTEN 0 4096 0.0.0.0:$p 0.0.0.0:*"; done
exit 0
STUB
  cat >"$STUBS/sleep" <<'STUB'
#!/bin/sh
exit 0
STUB
  chmod +x "$STUBS"/*

  export STUB_LOG="$WORK/log"
  : >"$STUB_LOG"
  export RELEASES_DIR="$WORK/releases"
  export ATLAS_RELEASES_URL="https://example.test/releases"
  export ATLAS_DIR="$WORK/atlas"
  export PATH="$STUBS:$PATH"
  unset ATLAS_VERSION WEB_PORT API_PORT
}

teardown() { rm -rf "$WORK"; }

run_install() { run sh "$WORK/install.sh"; }

@test "fresh install: folder, mode 600 .env, config/, URL, code and back-up note" {
  run_install
  [ "$status" -eq 0 ]
  [ -f "$ATLAS_DIR/docker-compose.yml" ]
  [ -d "$ATLAS_DIR/config" ]
  [ "$(stat -c %a "$ATLAS_DIR/.env" 2>/dev/null || stat -f %Lp "$ATLAS_DIR/.env")" = 600 ]
  [[ "$output" == *"http://127.0.0.1:8188"* ]]
  [[ "$output" == *"ABCD-2345"* ]]
  [[ "$output" == *"Back up"*".env"* ]]
  grep -q "docker compose up -d" "$STUB_LOG"
}

@test "pins the version of the tag the script came from, never latest" {
  run_install
  [ "$status" -eq 0 ]
  grep -qx 'ATLAS_VERSION=0.1.0' "$ATLAS_DIR/.env"
  ! grep -q latest "$ATLAS_DIR/.env"
  grep -q "download/v0.1.0/docker-compose.yml" "$STUB_LOG"
}

@test "ATLAS_VERSION overrides the pin" {
  mkdir -p "$RELEASES_DIR/download/v0.2.0"
  echo "services: {}" >"$RELEASES_DIR/download/v0.2.0/docker-compose.yml"
  ATLAS_VERSION=0.2.0 run sh "$WORK/install.sh"
  [ "$status" -eq 0 ]
  grep -qx 'ATLAS_VERSION=0.2.0' "$ATLAS_DIR/.env"
}

@test "secrets: right shape, no dollar sign, never printed" {
  run_install
  pw="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ATLAS_DIR/.env")"
  key="$(sed -n 's/^ATLAS_SECRET_KEY=//p' "$ATLAS_DIR/.env")"
  [[ "$pw" =~ ^[0-9a-f]{48}$ ]]
  [ "${#key}" -ge 32 ]
  [[ "$pw$key" != *'$'* ]]
  [[ "$output" != *"$pw"* ]]
  [[ "$output" != *"$key"* ]]
}

@test "a script that isn't from a release needs ATLAS_VERSION" {
  run sh "$ROOT/install.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"ATLAS_VERSION"* ]]
  [ ! -e "$ATLAS_DIR/.env" ]
}

@test "re-run keeps .env, config/ contents and the pinned version; reprints the code" {
  run_install
  echo "x: 1" >"$ATLAS_DIR/config/atlas.yaml"
  echo "POSTGRES_USER=mine" >>"$ATLAS_DIR/.env"
  before="$(cat "$ATLAS_DIR/.env")"
  sed 's/@ATLAS_TAG@/v9.9.9/' "$ROOT/install.sh" >"$WORK/install.sh"   # a newer script
  STUB_CODE=WXYZ-9876 run sh "$WORK/install.sh"
  [ "$status" -eq 0 ]
  [ "$(cat "$ATLAS_DIR/.env")" = "$before" ]
  [ -f "$ATLAS_DIR/config/atlas.yaml" ]
  [[ "$output" == *"WXYZ-9876"* ]]
}

@test "re-run on a claimed install doesn't print a code" {
  run_install
  STUB_CLAIMED=true run sh "$WORK/install.sh"
  [ "$status" -eq 0 ]
  [[ "$output" != *"Setup code"* ]]
  [[ "$output" == *"already has an Owner"* ]]
}

@test "re-run doesn't call its own running ports a clash" {
  run_install
  STUB_RUNNING=1 STUB_BUSY_PORTS="8187 8188" run sh "$WORK/install.sh"
  [ "$status" -eq 0 ]
}

@test "no docker: plain message, nothing written" {
  mkdir "$WORK/bin"
  for t in sh sed awk tail mkdir mv rm chmod printf cat grep dirname; do ln -s "$(command -v $t)" "$WORK/bin/$t"; done
  PATH="$WORK/bin" run "$(command -v sh)" "$WORK/install.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Docker isn't installed"* ]]
  [ ! -e "$ATLAS_DIR" ]
}

@test "no compose plugin" {
  STUB_COMPOSE_RC=1 run_install
  [ "$status" -ne 0 ]
  [[ "$output" == *"Compose plugin"* ]]
  [ ! -e "$ATLAS_DIR" ]
}

@test "busy port 8188 suggests WEB_PORT=" {
  STUB_BUSY_PORTS=8188 run_install
  [ "$status" -ne 0 ]
  [[ "$output" == *"8188"*"WEB_PORT="* ]]
  [ ! -e "$ATLAS_DIR/.env" ]
}

@test "busy port 8187 suggests API_PORT=" {
  STUB_BUSY_PORTS=8187 run_install
  [ "$status" -ne 0 ]
  [[ "$output" == *"API_PORT="* ]]
}

@test "WEB_PORT is saved in .env and shown in the URL" {
  WEB_PORT=9000 run_install
  [ "$status" -eq 0 ]
  grep -qx 'WEB_PORT=9000' "$ATLAS_DIR/.env"
  [[ "$output" == *"http://127.0.0.1:9000"* ]]
}

@test "unwritable folder fails early" {
  mkdir -p "$ATLAS_DIR"
  chmod 500 "$ATLAS_DIR"
  [ "$(id -u)" -ne 0 ] || skip "root can write anywhere"
  run_install
  chmod 700 "$ATLAS_DIR"
  [ "$status" -ne 0 ]
  [[ "$output" == *"writable"* ]]
}

@test "never touches BIND_ADDRESS and repeats the don't-publish warning" {
  run_install
  ! grep -q BIND_ADDRESS "$ATLAS_DIR/.env"
  [[ "$output" == *"Don't publish it openly"* ]]
  [[ "$output" == *"SSH tunnel"* ]]
}

@test "failed download leaves no half file and says so" {
  rm "$RELEASES_DIR/download/v0.1.0/docker-compose.yml"
  run_install
  [ "$status" -ne 0 ]
  [[ "$output" == *"couldn't download"* ]]
  [ ! -e "$ATLAS_DIR/.env" ]
}

@test "waits, then gives up with a pointer to the log" {
  cat >"$STUBS/docker" <<'STUB'
#!/bin/sh
case "$*" in *"exec"*) exit 1 ;; esac
exit 0
STUB
  ATLAS_WAIT_TRIES=3 run_install
  [ "$status" -ne 0 ]
  [[ "$output" == *"docker compose logs atlas-api"* ]]
}

@test "works piped into sh: docker must not swallow the rest of the script" {
  cat >"$STUBS/docker" <<'STUB'
#!/bin/sh
cat >/dev/null   # a docker command that reads stdin, as `compose exec -T` does
case "$*" in
  *"api/owner"*) echo '{"claimed":false}' ;;
  *"logs"*) echo "x | enter the setup code: PIPE-1234" ;;
esac
exit 0
STUB
  run sh -c "cat '$WORK/install.sh' | sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PIPE-1234"* ]]
  [[ "$output" == *"Don't publish it openly"* ]]
}

@test "re-run with a new WEB_PORT saves it, file stays private" {
  run_install
  WEB_PORT=9100 run sh "$WORK/install.sh"
  [ "$status" -eq 0 ]
  grep -qx 'WEB_PORT=9100' "$ATLAS_DIR/.env"
  [ "$(stat -c %a "$ATLAS_DIR/.env" 2>/dev/null || stat -f %Lp "$ATLAS_DIR/.env")" = 600 ]
}

@test "re-run adds ATLAS_VERSION when .env has none" {
  run_install
  grep -v ATLAS_VERSION "$ATLAS_DIR/.env" >"$WORK/e"
  cp "$WORK/e" "$ATLAS_DIR/.env"
  run sh "$WORK/install.sh"
  [ "$status" -eq 0 ]
  grep -qx 'ATLAS_VERSION=0.1.0' "$ATLAS_DIR/.env"
}

@test "a non-numeric port is refused before anything is written" {
  WEB_PORT=abc run_install
  [ "$status" -ne 0 ]
  [[ "$output" == *"port number"* ]]
  [ ! -e "$ATLAS_DIR/.env" ]
}

@test "re-run with a different busy port is still refused" {
  run_install
  STUB_RUNNING=1 STUB_BUSY_PORTS=8190 WEB_PORT=8190 run sh "$WORK/install.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"8190"* ]]
}
