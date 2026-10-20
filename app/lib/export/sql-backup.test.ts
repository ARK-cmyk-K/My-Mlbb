import assert from "node:assert/strict";
import test from "node:test";

import { SQL_BACKUP_SAFEGUARDS } from "./sql-backup.ts";

test("SQL backup safeguards are explicit and safe", () => {
  assert.equal(SQL_BACKUP_SAFEGUARDS.inAppSqlExport, false);
  assert.equal(SQL_BACKUP_SAFEGUARDS.inAppSqlRestore, false);
  assert.ok(SQL_BACKUP_SAFEGUARDS.reason.length > 0);
  assert.ok(Array.isArray(SQL_BACKUP_SAFEGUARDS.safeExportMethods));
  assert.ok(SQL_BACKUP_SAFEGUARDS.safeExportMethods.length >= 1);
  assert.ok(Array.isArray(SQL_BACKUP_SAFEGUARDS.restoreRequirements));
  assert.ok(SQL_BACKUP_SAFEGUARDS.restoreRequirements.includes("no execution of arbitrary uploaded SQL from the browser"));
  assert.ok(SQL_BACKUP_SAFEGUARDS.restoreRequirements.includes("explicit destructive-action warning and separate confirmation"));
  assert.ok(SQL_BACKUP_SAFEGUARDS.limits);
  assert.equal(SQL_BACKUP_SAFEGUARDS.docsPath, "docs/sql-backup-restore.md");
});
