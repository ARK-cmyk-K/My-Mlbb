# Task 02-03 — Draft/Published State Service

Inspect the schema, RLS, auth, and current application data access patterns.

Create a typed server-side service for reading and mutating draft content and reading the currently published release. Admin mutations must require verified admin authorization. Public queries must target published data only. Model publication state explicitly and avoid duplicating business rules across route handlers and UI components.

Add validation, typed error handling, and tests for unauthorized draft reads/writes, public reads, missing releases, and invalid transitions. Do not implement the full release UI or publishing workflow in this task.

Acceptance criteria: service boundaries are documented, no privileged key reaches the browser, tests are run or clearly marked unavailable, and project state is updated.
