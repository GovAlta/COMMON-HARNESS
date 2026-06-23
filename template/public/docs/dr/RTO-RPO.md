# Disaster Recovery: RTO / RPO

Every application deployed from this template MUST set explicit Recovery Time
Objective (RTO) and Recovery Point Objective (RPO) values before it goes to
production. The values below are **placeholder defaults** that reflect the
template's out-of-the-box capability with the bundled `scripts/backup.sh` +
`scripts/restore.sh` pair. Teams that need stricter targets must add managed
backups, replication, or change-data-capture as appropriate.

## Definitions

- **RTO (Recovery Time Objective)**: the maximum acceptable wall-clock time
  to restore service after a disaster begins. Measured from the moment of
  declaration to the moment a healthy instance is accepting traffic.
- **RPO (Recovery Point Objective)**: the maximum acceptable amount of data
  loss measured in time. An RPO of 24h means we may lose up to a day of
  writes; an RPO of 5 minutes means we may lose at most 5 minutes of writes.

## Template defaults (`scripts/backup.sh` daily cron + `scripts/restore.sh`)

| Target | Value | Justification |
|---|---|---|
| RTO | **4 hours** | Time-budget: 1 hr to provision/identify replacement DB host, 30 min `pg_restore -j 4`, 30 min smoke tests, 2 hr buffer for incident-coordination overhead on a typical < 50 GB schema. |
| RPO | **24 hours** | `backup.sh` runs once daily; any change since the last successful dump is at risk. Retention is `BACKUP_RETAIN=7` dumps by default. |

These defaults are appropriate for **internal staff tools** and **public-information
catalogue apps**. They are **NOT** appropriate for transactional citizen-services
apps or any system processing Protected B data. See the upgrade paths below.

## When to tighten

| Trigger | Recommended target | Required infrastructure change |
|---|---|---|
| App processes Protected B data | RTO ≤ 1 hr, RPO ≤ 15 min | Add managed cloud Postgres (Azure DB for PostgreSQL, RDS) with **continuous WAL archiving** + point-in-time-recovery (PITR) enabled. Replace the daily `backup.sh` cron with the cloud-managed backup. |
| App is a system-of-record (payments, benefits, records that cannot be re-derived) | RTO ≤ 15 min, RPO ≤ 1 min | Add a **read replica** in a second availability zone + automated failover (Azure DB read replica + auto-failover group; RDS Multi-AZ). |
| App is on a published Canada-wide SLA | RTO ≤ 5 min, RPO ≤ 0 (zero data loss) | Synchronous replication or active-active multi-region. This template's footprint is too small to support this. Escalate the architecture rather than retrofitting. |

## Operational requirements (template default)

1. **Daily backup cron**: schedule `scripts/backup.sh` from a host that has
   `pg_dump` available and read access to the prod DB. The included Dockerfile
   adds `postgresql-client` so any cron sidecar from the same image works.
   ```cron
   0 2 * * * /app/scripts/backup.sh >> /var/log/backup.log 2>&1
   ```
2. **Retention**: `BACKUP_RETAIN=7` (a week of daily dumps) is the default.
   Override per deployment via env var.
3. **Off-host storage**: copy dumps to a managed object store as a post-step
   (Azure Blob `azcopy sync`, S3 `aws s3 sync`). The script writes to local
   disk only. A dump on the same host as the source DB does not count as
   a backup.
4. **Quarterly restore drill**: run `scripts/restore.sh` against a non-prod
   target with a recent dump. Record the wall-clock time. If it exceeds the
   stated RTO, escalate before the next quarter.

## Backup verification

`backup.sh` already runs `pg_restore --list` against the produced file before
declaring success. This catches truncated / corrupted dumps. It does NOT
catch logical corruption (e.g. an application bug that wrote bad rows that
also got dumped). The quarterly restore drill is the only defense against
that.

## Recording the choice

A deployment's actual RTO/RPO target must be recorded in
`.ai/data/risk_acceptances.json` as:

```json
{
  "id": "RA-DR-RTO-RPO",
  "title": "DR RTO/RPO targets",
  "severity": "INFO",
  "justification": "RTO=<value>, RPO=<value>. Selected per docs/dr/RTO-RPO.md based on <classification + transaction model>. Backup mechanism: <scripts/backup.sh|cloud-managed>.",
  "approved_by": "<security-officer>",
  "approved_on": "<YYYY-MM-DD>",
  "review_on": "<YYYY-MM-DD-plus-1-year>"
}
```

If this entry is missing, the blueteam DR-resilience assessment will continue
to flag DRG-001 ("No RTO or RPO defined") as a Critical gap.
