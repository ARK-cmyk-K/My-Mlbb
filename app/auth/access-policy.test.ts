import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASHBOARD_HOME,
  evaluateAdminAccess,
  sanitizeRedirectTarget,
} from "./access-policy.ts";

/**
 * Unit tests for the pure admin access policy (task 02-01).
 *
 * These run with Node's built-in test runner and no live Supabase project, so
 * they cover the authorization *decision* — unauthenticated access, non-admin
 * access and session expiry (which surfaces as "no verified user") — while the
 * provider round-trip itself is verified manually once credentials exist.
 */

test("denies when Supabase is not configured, even with a user", () => {
  assert.deepEqual(
    evaluateAdminAccess({ configured: false, hasUser: true, isAdmin: true }),
    { allowed: false, reason: "not-configured" }
  );
});

test("denies unauthenticated access to the dashboard", () => {
  assert.deepEqual(
    evaluateAdminAccess({ configured: true, hasUser: false, isAdmin: false }),
    { allowed: false, reason: "no-session" }
  );
});

test("denies an expired or invalid session (no verified user)", () => {
  // getSession() may still return a stale cookie; getUser() returns no user,
  // which the policy treats exactly like "signed out".
  assert.deepEqual(
    evaluateAdminAccess({ configured: true, hasUser: false, isAdmin: false }),
    { allowed: false, reason: "no-session" }
  );
});

test("denies an authenticated non-admin user", () => {
  assert.deepEqual(
    evaluateAdminAccess({ configured: true, hasUser: true, isAdmin: false }),
    { allowed: false, reason: "not-admin" }
  );
});

test("allows only the authenticated configured admin", () => {
  assert.deepEqual(
    evaluateAdminAccess({ configured: true, hasUser: true, isAdmin: true }),
    { allowed: true, reason: "allowed" }
  );
});

test("sanitizeRedirectTarget keeps same-origin dashboard paths", () => {
  assert.equal(sanitizeRedirectTarget("/admin"), "/admin");
  assert.equal(sanitizeRedirectTarget("/admin/heroes"), "/admin/heroes");
  assert.equal(sanitizeRedirectTarget("/admin?tab=draft"), "/admin?tab=draft");
  assert.equal(
    sanitizeRedirectTarget("/admin/releases?page=2"),
    "/admin/releases?page=2"
  );
});

test("sanitizeRedirectTarget rejects open-redirect attempts", () => {
  const cases = [
    "https://evil.example",
    "//evil.example/admin",
    "http://evil.example",
    "javascript:alert(1)",
    "admin",
    "\\evil.example",
    "/\\evil.example",
    "",
    "   ",
    null,
    undefined,
    42,
    { href: "/admin" },
  ];

  for (const value of cases) {
    assert.equal(
      sanitizeRedirectTarget(value),
      DASHBOARD_HOME,
      `expected ${JSON.stringify(value)} to fall back`
    );
  }
});

test("sanitizeRedirectTarget refuses paths outside the dashboard", () => {
  assert.equal(sanitizeRedirectTarget("/login"), DASHBOARD_HOME);
  assert.equal(sanitizeRedirectTarget("/"), DASHBOARD_HOME);
  assert.equal(sanitizeRedirectTarget("/adminish"), DASHBOARD_HOME);
  assert.equal(sanitizeRedirectTarget("/api/admin"), DASHBOARD_HOME);
});

test("sanitizeRedirectTarget rejects control characters", () => {
  assert.equal(sanitizeRedirectTarget("/admin\u0000"), DASHBOARD_HOME);
  assert.equal(sanitizeRedirectTarget("/admin\r\n/x"), DASHBOARD_HOME);
});
