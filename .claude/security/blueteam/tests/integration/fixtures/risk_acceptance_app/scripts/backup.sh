#!/usr/bin/env bash
# backup.sh: Daily SQLite database backup script
# Called by cron: 0 2 * * * /opt/app/scripts/backup.sh
#
# TC-11: RA-010 PENDING — shell comment marker, unencrypted backup to NFS share
# RISK_ACCEPTED: RA-010
tar -czf /mnt/backup/app-db-$(date +%Y%m%d).tar.gz ./data/app.db

echo "Backup completed: /mnt/backup/app-db-$(date +%Y%m%d).tar.gz"
echo "NOTE: Backup is unencrypted. RA-010 (PENDING) documents accepted risk while"
echo "      encrypted backup solution is being evaluated for Q3."
