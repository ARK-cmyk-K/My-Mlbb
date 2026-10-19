# Task 03-05 — JSON Backup Export and Media Manifest

Inspect schema, authorization, and media metadata first.

Implement an admin-only JSON export of the documented application data and a media manifest containing stable IDs, object paths/URLs as appropriate, MIME types, sizes, checksums if available, and reference relationships. Never expose secrets, auth tokens, service-role keys, or unrelated user data. Require server-side authorization and prevent public access to backup downloads. Use streaming or bounded exports where practical.

Document export format/version and test that drafts and private metadata are included only in authorized backups. Do not implement restore or SQL export in this task. Update state.
