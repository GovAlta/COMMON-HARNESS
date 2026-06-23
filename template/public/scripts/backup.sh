#!/usr/bin/env bash
# backup.sh — snapshot the application Postgres database to a compressed dump.
#
# Idempotent, cron-friendly. Designed to be invoked from a scheduled job:
#   0 2 * * *  /app/scripts/backup.sh
#
# Outputs `backup-YYYYMMDDTHHMMSSZ.dump` in $BACKUP_DIR.
# Uses pg_dump's custom format (-Fc) so restore can be parallelised with -j.
#
# Required env vars:
#   DATABASE_URL    Standard libpq URL (postgresql://USER:PASS@host:port/db).
#   BACKUP_DIR      Filesystem directory to write the dump (default: ./backups).
#   BACKUP_RETAIN   Number of dumps to keep (default: 7). Older dumps are deleted.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (postgresql://USER:PASS@host:port/db)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETAIN="${BACKUP_RETAIN:-7}"

mkdir -p "$BACKUP_DIR"

stamp=$(date -u +"%Y%m%dT%H%M%SZ")
target="${BACKUP_DIR}/backup-${stamp}.dump"

echo "[backup] writing dump to ${target}"

# -Fc = custom format (compressed, supports parallel restore)
# --no-owner / --no-acl keep the dump portable across environments.
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$target" \
  "$DATABASE_URL"

# Verify the file is non-empty + readable as a pg_dump archive header.
if [ ! -s "$target" ]; then
  echo "[backup] ERROR: dump file is empty"
  rm -f "$target"
  exit 1
fi
pg_restore --list "$target" > /dev/null

# Prune older dumps beyond the retention count.
count=$(ls -1t "${BACKUP_DIR}"/backup-*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -gt "$BACKUP_RETAIN" ]; then
  echo "[backup] retention=${BACKUP_RETAIN}; pruning $((count - BACKUP_RETAIN)) older dump(s)"
  ls -1t "${BACKUP_DIR}"/backup-*.dump | tail -n +"$((BACKUP_RETAIN + 1))" | xargs -r rm -f
fi

echo "[backup] complete: $(ls -la "$target")"
