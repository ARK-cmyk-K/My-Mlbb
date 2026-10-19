import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeCsvBytes,
  MAX_CSV_BYTES,
  validateCsvFileMeta,
} from "./upload.ts";

/**
 * Upload admission tests (task 03-03): declared type/size, strict UTF-8 and
 * binary rejection.
 */

test("accepts a .csv by extension even with an empty MIME type", () => {
  assert.equal(
    validateCsvFileMeta({ name: "heroes.csv", type: "", size: 120 }),
    null
  );
});

test("accepts a CSV MIME type without the extension", () => {
  assert.equal(
    validateCsvFileMeta({ name: "upload", type: "text/csv", size: 120 }),
    null
  );
});

test("rejects an empty file", () => {
  assert.match(
    validateCsvFileMeta({ name: "heroes.csv", type: "text/csv", size: 0 }) ?? "",
    /empty/
  );
});

test("rejects an oversized file before reading it", () => {
  const message = validateCsvFileMeta({
    name: "heroes.csv",
    type: "text/csv",
    size: MAX_CSV_BYTES + 1,
  });
  assert.match(message ?? "", /2 MiB or smaller/);
});

test("rejects a non-CSV file type and name", () => {
  const message = validateCsvFileMeta({
    name: "portraits.png",
    type: "image/png",
    size: 120,
  });
  assert.match(message ?? "", /Choose a \.csv file/);
});

test("decodes UTF-8 and strips a BOM", () => {
  const bytes = new TextEncoder().encode("\ufeffname,slug\nLayla,layla\n");
  assert.deepEqual(decodeCsvBytes(bytes), {
    ok: true,
    text: "name,slug\nLayla,layla\n",
  });
});

test("rejects binary content containing NUL bytes", () => {
  const result = decodeCsvBytes(new Uint8Array([0x61, 0x00, 0x62]));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /not a text CSV/);
  }
});

test("rejects invalid UTF-8", () => {
  const result = decodeCsvBytes(new Uint8Array([0x66, 0xff, 0x6f]));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /UTF-8/);
  }
});

test("rejects a blank file after decoding", () => {
  const result = decodeCsvBytes(new TextEncoder().encode("  \r\n\t"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /empty/);
  }
});
