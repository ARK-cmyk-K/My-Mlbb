import assert from "node:assert/strict";
import { test } from "node:test";

import { readSupabaseConfig, SUPABASE_ENV_KEYS } from "./config.ts";

/**
 * Unit tests for Supabase configuration parsing (task 02-01).
 *
 * The important property is fail-closed behaviour: anything missing, blank or
 * malformed must return `null` so the caller denies access instead of guessing.
 */

test("returns null when the environment is empty", () => {
  assert.equal(readSupabaseConfig({}), null);
});

test("returns null when only one value is present", () => {
  assert.equal(
    readSupabaseConfig({ [SUPABASE_ENV_KEYS.url]: "https://x.supabase.co" }),
    null
  );
  assert.equal(
    readSupabaseConfig({ [SUPABASE_ENV_KEYS.anonKey]: "anon-key" }),
    null
  );
});

test("returns null for blank values", () => {
  assert.equal(
    readSupabaseConfig({
      [SUPABASE_ENV_KEYS.url]: "   ",
      [SUPABASE_ENV_KEYS.anonKey]: "anon-key",
    }),
    null
  );
  assert.equal(
    readSupabaseConfig({
      [SUPABASE_ENV_KEYS.url]: "https://x.supabase.co",
      [SUPABASE_ENV_KEYS.anonKey]: "",
    }),
    null
  );
});

test("returns null for a malformed url", () => {
  assert.equal(
    readSupabaseConfig({
      [SUPABASE_ENV_KEYS.url]: "not-a-url",
      [SUPABASE_ENV_KEYS.anonKey]: "anon-key",
    }),
    null
  );
});

test("returns null for a non-http protocol", () => {
  assert.equal(
    readSupabaseConfig({
      [SUPABASE_ENV_KEYS.url]: "ftp://x.supabase.co",
      [SUPABASE_ENV_KEYS.anonKey]: "anon-key",
    }),
    null
  );
});

test("normalizes a valid url to its origin", () => {
  assert.deepEqual(
    readSupabaseConfig({
      [SUPABASE_ENV_KEYS.url]: "https://abcdefgh.supabase.co/",
      [SUPABASE_ENV_KEYS.anonKey]: "anon-key",
    }),
    { url: "https://abcdefgh.supabase.co", anonKey: "anon-key" }
  );

  // Local development (Supabase CLI) uses plain http on a non-default port.
  assert.deepEqual(
    readSupabaseConfig({
      [SUPABASE_ENV_KEYS.url]: "http://127.0.0.1:54321",
      [SUPABASE_ENV_KEYS.anonKey]: "anon-key",
    }),
    { url: "http://127.0.0.1:54321", anonKey: "anon-key" }
  );
});
