# Output template: release-notes.md

Validated when `validate-step-output.mjs` is invoked with `--template output-template-release.md`.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: What Changed
## REQUIRED: What's Improved
## REQUIRED: Known Issues
## REQUIRED: Migration Notes
## REQUIRED: How to Verify
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Known Issues
## TABLE: Appendix

The What Changed section MUST be in user-language (not "FR-014 implemented"; say "you can now share a project with a teammate"). Implementation language belongs in the runbook, not the release notes.

The Known Issues table MUST list every Major-bucket and post-launch-backlog item from sign-off.md `§3.4 Updated Deferral Backlog` with a tracking reference (issue ID, ticket, or doc anchor).

The How to Verify section MUST list at least one user-runnable check (e.g., "Sign in, click Settings, confirm the new 'Notification preferences' tab appears").
