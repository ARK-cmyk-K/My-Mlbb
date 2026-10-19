import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCsvReport,
  buildImportErrorReport,
  escapeSpreadsheetCell,
  neutralizeSpreadsheetFormula,
} from "./spreadsheet.ts";

/**
 * Export-safety tests (task 03-03). Any preview that leaves the dashboard as a
 * spreadsheet must not execute cells as formulas.
 */

test("neutralizes formula triggers", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", " =1", "\t=1"]) {
    assert.equal(
      neutralizeSpreadsheetFormula(value),
      `'${value}`,
      `expected ${JSON.stringify(value)} to be neutralized`
    );
  }
});

test("leaves ordinary text and numbers alone", () => {
  assert.equal(neutralizeSpreadsheetFormula("Layla"), "Layla");
  assert.equal(neutralizeSpreadsheetFormula("2025-06-01"), "2025-06-01");
  assert.equal(neutralizeSpreadsheetFormula("true"), "true");
});

test("quotes cells containing commas, quotes or line breaks", () => {
  assert.equal(escapeSpreadsheetCell("a,b"), '"a,b"');
  assert.equal(escapeSpreadsheetCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeSpreadsheetCell("two\nlines"), '"two\nlines"');
});

test("escapes before neutralizing a formula containing a comma", () => {
  assert.equal(escapeSpreadsheetCell("=HYPERLINK(a,b)"), '"\'=HYPERLINK(a,b)"');
});

test("serializes a CRLF-terminated report", () => {
  const report = buildCsvReport(["row", "value"], [
    [1, "Layla"],
    [2, "=evil"],
  ]);
  assert.equal(report, "row,value\r\n1,Layla\r\n2,'=evil\r\n");
});

test("builds a flat error report and neutralizes every cell", () => {
  const report = buildImportErrorReport([
    {
      row: 2,
      slug: "=evil",
      issues: [{ path: "slug", message: "=CMD()" }],
    },
  ]);
  assert.equal(
    report,
    "row,slug,field,message\r\n2,'=evil,slug,'=CMD()\r\n"
  );
});

test("returns an empty report when there are no errors", () => {
  assert.equal(buildImportErrorReport([]), "");
});
