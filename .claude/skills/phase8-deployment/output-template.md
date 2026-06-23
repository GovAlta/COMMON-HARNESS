# Output template, runbook.md

Read by `validate-step-output.mjs`. Release notes use `output-template-release.md` in the same dir.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Deploy Summary
## REQUIRED: Pre-deploy Checklist
## REQUIRED: Migration Apply
## REQUIRED: Build and Push
## REQUIRED: Service Deploy
## REQUIRED: Smoke Test Results
## REQUIRED: Rollback Plan
## REQUIRED: Monitoring
## REQUIRED: On-call
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Deploy Summary
## TABLE: Pre-deploy Checklist
## TABLE: Migration Apply
## TABLE: Smoke Test Results
## TABLE: Appendix

The Deploy Summary table MUST cite at least: Mode (Nexus or local), Image tag, Deploy timestamp, Deploy URL, Deployer.

The Pre-deploy Checklist table MUST list every Phase 1 check (sync-docs, blueteam, build, idempotency proof, secret inventory, health probe) with a definitive `pass` or `fail` outcome. `fail` entries are not allowed in a successful runbook.

The Migration Apply table MUST list every NNN_*.sql file in migrations/ with applied-status. Idempotency-proof timestamp MUST be cited (rule #9).

The Rollback Plan section MUST contain concrete commands (not prose). For cloud path: traffic-revert command. For local path: prior-tag run command.

The Monitoring section MUST cite where alerts route AND name a real human or rotation that receives them.

The On-call section MUST cite a primary contact with a real name + channel, empty or placeholder is not allowed.
