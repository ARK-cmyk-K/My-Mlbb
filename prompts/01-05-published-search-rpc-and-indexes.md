# Task 01-05 — Published Search RPC and Indexes

Read the master protocol, current state, schema, and RLS migrations. Confirm actual searchable columns before implementing.

Enable PostgreSQL full-text search and `pg_trgm` typo-tolerant matching. Implement a safe `search_published_content` RPC that searches published heroes, skins, achievements, and timeline entries and returns categorized results with stable identifiers and concise display fields. Support sensible query limits, empty/short query handling, ranking, and input validation. Avoid exposing drafts through joins, function ownership, `SECURITY DEFINER`, or grants.

If using `SECURITY DEFINER`, set a safe `search_path`, qualify objects, restrict execute grants, and explain why it is needed; otherwise prefer invoker-safe behavior. Add appropriate GIN/trigram indexes and verification SQL. Do not return private columns.

Acceptance criteria: anonymous search can retrieve published results only, drafts cannot leak, result types are documented, and actual database execution status is honestly recorded. Update state and prompt index.
