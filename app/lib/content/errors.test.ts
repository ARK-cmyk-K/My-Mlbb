import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTENT_ERROR_CODES,
  ContentServiceError,
  HTTP_STATUS_BY_CODE,
  isContentServiceError,
  serializeContentError,
} from "./errors.ts";

/**
 * Unit tests for the typed error boundary (task 02-03).
 *
 * Two properties matter: every code maps to a sensible HTTP status, and the
 * browser-safe serialization never leaks the (server-only) `cause`.
 */

test("every error code has an HTTP status and a default message", () => {
  for (const code of CONTENT_ERROR_CODES) {
    const error = new ContentServiceError(code);
    assert.equal(error.code, code);
    assert.equal(error.status, HTTP_STATUS_BY_CODE[code]);
    assert.equal(error.name, "ContentServiceError");
    assert.ok(error.message.length > 0, `${code} needs a default message`);
    assert.equal(typeof error.status, "number");
  }
});

test("the status map distinguishes auth, validation and storage faults", () => {
  assert.equal(HTTP_STATUS_BY_CODE.UNAUTHENTICATED, 401);
  assert.equal(HTTP_STATUS_BY_CODE.UNAUTHORIZED, 403);
  assert.equal(HTTP_STATUS_BY_CODE.VALIDATION_FAILED, 400);
  assert.equal(HTTP_STATUS_BY_CODE.NOT_FOUND, 404);
  assert.equal(HTTP_STATUS_BY_CODE.NO_PUBLISHED_RELEASE, 404);
  assert.equal(HTTP_STATUS_BY_CODE.INVALID_TRANSITION, 409);
  assert.equal(HTTP_STATUS_BY_CODE.CONFLICT, 409);
  assert.equal(HTTP_STATUS_BY_CODE.NOT_CONFIGURED, 503);
  assert.equal(HTTP_STATUS_BY_CODE.STORE_UNAVAILABLE, 503);
});

test("field issues are carried through for VALIDATION_FAILED", () => {
  const error = new ContentServiceError("VALIDATION_FAILED", {
    issues: [{ path: "name", message: "must not be empty" }],
    message: "Custom message",
  });

  assert.equal(error.message, "Custom message");
  assert.deepEqual(error.issues, [{ path: "name", message: "must not be empty" }]);
});

test("errors without issues default to an empty list", () => {
  const error = new ContentServiceError("NOT_FOUND");
  assert.deepEqual(error.issues, []);
});

test("isContentServiceError narrows unknown values", () => {
  assert.equal(isContentServiceError(new ContentServiceError("UNAUTHORIZED")), true);
  assert.equal(isContentServiceError(new Error("plain")), false);
  assert.equal(isContentServiceError(null), false);
  assert.equal(isContentServiceError({ code: "UNAUTHORIZED" }), false);
});

test("serialization omits the server-only cause", () => {
  const cause = new Error("postgres: relation heroes does not exist");
  const error = new ContentServiceError("STORE_UNAVAILABLE", { cause });
  const serialized = serializeContentError(error);

  assert.deepEqual(serialized, {
    code: "STORE_UNAVAILABLE",
    message: error.message,
    status: 503,
    issues: [],
  });

  // The raw cause must not appear in the browser-safe payload.
  assert.equal(JSON.stringify(serialized).includes("relation heroes"), false);
});
