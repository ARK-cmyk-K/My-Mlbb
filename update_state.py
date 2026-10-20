with open("D:\Mlbb\My-Mlbb\PROJECT_STATE.md", "r") as f:
    content = f.read()

old = "| `03-06` | SQL export and restore safeguards | VERIFIED | Implemented documentation and explicit safeguards instead of in-browser SQL execution. Added `docs/sql-backup-restore.md` outlining safe export paths (Supabase CLI `supabase db dump`, `pg_dump`), restore requirements (separate confirmation, format/version validation, preview, explicit destructive-action warning, environment targeting, no arbitrary SQL in browser), limits (PITR/provider settings/permissions, JSON export scope), and verification checklist. Created `app/lib/export/sql-backup.ts` with `SQL_BACKUP_SAFEGUARDS` (explicit `inAppSqlExport=false`, `inAppSqlRestore=false`, documented methods/requirements/limits, `docsPath`). Added `app/lib/export/sql-backup.test.ts` verifying the safeguards. Updated `app/admin/import-export/page.tsx` to replace the "Not built yet" placeholder with a documented safeguards section. All tests pass. No new SQL migrations; no writes to database. |"

new = old + "\n| `04-06` | Publish, Schedule, and Rollback | IN_PROGRESS | Controlled publishing that validates a draft, creates an immutable named snapshot, and updates the active published release in a transaction. Rollback republishes a prior snapshot while preserving release history. Scheduled publishing documented with required provider setup. CDN/cache invalidation reported as missing configuration. Concurrency protections, audit metadata, authorization checks, and tests for failed publication, rollback, and schedule handling. |"

if old in content:
    content = content.replace(old, new)
    with open("D:\Mlbb\My-Mlbb\PROJECT_STATE.md", "w") as f:
        f.write(content)
    print("Done - added 04-06 entry")
else:
    print("Pattern not found. Looking for partial...")
    # Try just finding the 03-06 line
    if "| `03-06`" in content:
        print("Found 03-06 marker in file")
    else:
        print("Cannot find 03-06 marker either")