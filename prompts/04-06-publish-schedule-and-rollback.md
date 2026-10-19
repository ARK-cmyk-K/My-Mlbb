# Task 04-06 — Publish, Schedule, and Rollback

Inspect release tables, snapshots, preview, draft service, and authorization.

Implement controlled publishing that validates a draft, creates an immutable named snapshot, and updates the active published release in a transaction or a documented safe equivalent. Add scheduled publishing only with a reliable server-side scheduler/cron mechanism; if unavailable, document the required provider setup and do not simulate it in the browser. Rollback must republish a prior snapshot while preserving release history.

Invalidate CDN/cache only through an actual supported integration and report missing configuration. Add concurrency protections, audit metadata, authorization checks, and tests for failed publication, rollback, and schedule handling. Update state.
