# Task 03-04 — CSV Merge Resolution Workflow

Read the existing dry-run importer and draft mutation service.

Build a preview UI for new entries and field-by-field differences for existing entries. Allow the admin to resolve conflicts using explicit choices such as keep existing, use imported value, or skip row. Validate the final selection again on the server and apply it only to drafts in a controlled operation. Show row-level errors and a final summary; do not partially commit silently.

Do not trust client-submitted preview data: revalidate or bind the commit to a server-generated preview identifier/hash. Add tests for authorization, stale previews, conflicting edits, and invalid selections. Update state.
