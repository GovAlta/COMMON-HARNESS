#!/usr/bin/env bash
# restore.sh — restore a backup-YYYYMMDDTHHMMSSZ.dump into the application DB.
#
# !! DESTRUCTIVE !! This script DROPS the target schema before restoring. It
# is intended for DR exercises and disaster recovery, not for refreshing dev
# data. It will refuse to run against a URL whose database name contains
# 'prod' unless ALLOW_PROD_RESTORE=true is set in the environment.
#
# Usage:
#   ./scripts/restore.sh path/to/backup-YYYYMMDDTHHMMSSZ.dump
#
# Required env vars:
#   DATABASE_URL    Target database (postgresql://USER:PASS@host:port/db).
#   ALLOW_PROD_RESTORE  Optional safety override ('true' to allow prod target).

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.dump>"
  exit 1
fi

dump="$1"

if [ ! -f "$dump" ]; then
  echo "[restore] ERROR: backup file '$dump' not found"
  exit 1
fi

# Safety guard against accidental prod overwrites.
if echo "$DATABASE_URL" | grep -qi 'prod' && [ "${ALLOW_PROD_RESTORE:-false}" != "true" ]; then
  echo "[restore] ERROR: DATABASE_URL appears to point at production. Set ALLOW_PROD_RESTORE=true to override."
  exit 1
fi

echo "[restore] verifying dump header"
pg_restore --list "$dump" > /dev/null

echo "[restore] dropping + recreating public schema (DESTRUCTIVE)"
psql "$DATABASE_URL" --set ON_ERROR_STOP=on <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL

echo "[restore] restoring from $dump (parallel jobs=4)"
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --jobs=4 \
  --exit-on-error \
  "$dump"

echo "[restore] complete. Verify by running the app's readiness probe:"
echo "  curl -sf \$API_BASE_URL/health/readiness | jq ."
