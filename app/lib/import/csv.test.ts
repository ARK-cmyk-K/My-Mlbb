import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCsv } from "./csv.ts";

/**
 * Parser tests for the CSV dry run (task 03-03).
 *
 * The parser is the first thing untrusted upload content touches, so malformed
 * quoting, limits and BOM handling are tested directly.
 */

test("parses a simple file and strips a UTF-8 BOM", () => {
  const result = parseCsv("\ufeffname,slug\r\nLayla,layla\r\n");
  assert.deepEqual(result, {
    ok: true,
    records: [
      ["name", "slug"],
      ["Layla", "layla"],
    ],
  });
});

test("supports quoted commas, newlines and escaped quotes", () => {
  const result = parseCsv(
    'name,note\r\n"Layla, the marksman","line one\nline two"\r\n"say ""hi""",plain\r\n'
  );
  assert.deepEqual(result, {
    ok: true,
    records: [
      ["name", "note"],
      ["Layla, the marksman", "line one\nline two"],
      ['say "hi"', "plain"],
    ],
  });
});

test("does not add an empty record for a trailing newline", () => {
  const result = parseCsv("a,b\n1,2\n");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.records.length, 2);
  }
});

test("returns no records for empty input", () => {
  assert.deepEqual(parseCsv(""), { ok: true, records: [] });
});

test("rejects an unterminated quoted field", () => {
  const result = parseCsv('name,note\n"Layla,still open\n');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Unterminated quoted field/);
  }
});

test("rejects a quote inside an unquoted field", () => {
  const result = parseCsv('name,note\nLay"la,note\n');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Unexpected quote/);
  }
});

test("enforces the record limit, including the header", () => {
  const result = parseCsv("a\n1\n2\n3\n", { maxRecords: 2 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /more than 1 data rows/);
  }
});

test("enforces the column limit", () => {
  const result = parseCsv("a,b,c\n1,2,3\n", { maxColumns: 2 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /more than 2 columns/);
  }
});
