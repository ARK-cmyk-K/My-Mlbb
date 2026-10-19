# Task 04-05 — Release Diff and Immutable Snapshots

Inspect the release schema and draft/published service.

Implement typed release snapshots that preserve the content/configuration associated with a named version and cannot be silently edited after creation. Build a side-by-side diff of draft versus selected published release for supported content and appearance fields. Protect release metadata and snapshot access with admin authorization. Use stable ordering and meaningful field-level differences.

Do not activate publishing or rollback in this task. Add tests for snapshot immutability, missing releases, and diff accuracy. Update state.
