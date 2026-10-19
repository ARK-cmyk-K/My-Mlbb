# Task 01-03 — Core Supabase Database Schema

Read the master protocol and current state. Inspect existing migrations before creating new ones. Never reset or destructively replace a database.

Create a versioned Supabase PostgreSQL migration for the core data model: heroes, skins, account stats, achievements, timeline entries, draft/published release metadata, immutable release snapshots, media metadata, and appearance/section settings. Use appropriate UUID keys, timestamps, constraints, uniqueness rules, indexes, and foreign keys. Prevent accidental deletion of media referenced by content. Include clear ownership and publication-state relationships so later RLS policies can reliably separate drafts from public data.

Use enums or constrained text consistently with project conventions. Include sensible checks for percentages, nonnegative counts, and valid dates. Do not add broad public grants or assume tables are secure merely because RLS will be added later.

Acceptance criteria: migration is ordered, repeatable within the project's migration workflow, documented, and reviewed for referential integrity. State clearly whether it was applied to a real Supabase project or only locally authored. Update state and index.
