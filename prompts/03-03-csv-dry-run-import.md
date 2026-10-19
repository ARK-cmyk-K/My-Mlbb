# Task 03-03 — CSV Dry-Run Import and Validation

Inspect hero/skin schemas and current server-side authorization before coding.

Implement a CSV upload parser that performs a dry run only: validate file type/size, headers, encoding, row limits, required fields, field types, duplicate keys, and invalid references. Return a structured preview of new rows, existing-row candidates, and row/field errors. Do not write imported records during preview. Treat CSV content as untrusted and prevent spreadsheet formula injection in any exported preview.

Add representative tests for malformed files, invalid values, duplicates, oversized input, and valid data. Do not implement merge commits in this task. Update state.
