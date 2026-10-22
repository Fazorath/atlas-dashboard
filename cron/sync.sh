#!/bin/sh
# Fire one sync endpoint and log the outcome. Never exits non-zero: a failed
# upstream is recorded in sync_runs by the API, and crond mailing about it here
# would just be noise.
set -u

SOURCE="$1"
API="${ATLAS_API:-http://atlas-api:8000}"

BODY_FILE=$(mktemp)
CODE=$(curl -fsS -m 120 -o "$BODY_FILE" -w '%{http_code}' -X POST "${API}/api/sync/${SOURCE}" 2>&1) || {
  echo "[atlas-cron] $(date -Is) ${SOURCE}: request failed: ${CODE}"
  rm -f "$BODY_FILE"
  exit 0
}
BODY=$(cat "$BODY_FILE")
rm -f "$BODY_FILE"
# 204 = that module is switched off in config/atlas.yaml. Stay quiet rather
# than log an empty line every run that reads like a failure.
[ "$CODE" = "204" ] && exit 0
echo "[atlas-cron] $(date -Is) ${SOURCE}: ${BODY}"
