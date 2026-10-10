#!/bin/sh
# Fire one sync endpoint and log the outcome. Never exits non-zero: a failed
# upstream is recorded in sync_runs by the API, and crond mailing about it here
# would just be noise.
set -u

SOURCE="$1"
API="${ATLAS_API:-http://atlas-api:8000}"

BODY=$(curl -fsS -m 120 -X POST "${API}/api/sync/${SOURCE}" 2>&1) || {
  echo "[atlas-cron] $(date -Is) ${SOURCE}: request failed: ${BODY}"
  exit 0
}
echo "[atlas-cron] $(date -Is) ${SOURCE}: ${BODY}"
