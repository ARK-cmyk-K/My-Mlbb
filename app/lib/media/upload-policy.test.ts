import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALLOWED_IMAGE_MIME_TYPES,
  DRAFT_MEDIA_BUCKET,
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_OBJECT_PATH_PATTERN,
  PUBLIC_MEDIA_BUCKET,
  buildMediaObjectPath,
  decideUploadAuthorization,
  extensionForMimeType,
  isMediaObjectPath,
  normalizeDeclaredMimeType,
  sniffImageMimeType,
  validateUploadCandidate,
  type AllowedImageMimeType,
  type UploadActor,
} from "./upload-policy.ts";

/**
 * Unit tests for the media upload policy (task 02-04).
 *
 * No Supabase project exists in this environment, so the policy — which is the
 * same rule the storage migration encodes — is exercised directly. The
 * provider-side enforcement (buckets, RLS policies, `file_size_limit`,
 * `allowed_mime_types`) is verified separately once a project exists; see
 * `docs/media-storage-setup.md` and PROJECT_STATE.md.
 */

const PNG_MIME: AllowedImageMimeType = "image/png";

/** Builds a byte array whose leading magic bytes identify the given format. */
function imageBytes(kind: AllowedImageMimeType, length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  switch (kind) {
    case "image/png":
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      break;
    case "image/jpeg":
      bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
      break;
    case "image/webp":
      bytes.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
      bytes.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
      break;
    case "image/avif":
      bytes.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
      bytes.set([..."avif"].map((c) => c.charCodeAt(0)), 8);
      break;
  }
  return bytes;
}

function issues(result: { ok: boolean }): Array<{ path: string }> {
  return (result as { ok: false; issues: Array<{ path: string }> }).issues;
}

// ---- mime/extension mapping -------------------------------------------------

test("every allowed type has a canonical extension", () => {
  const extensions = ALLOWED_IMAGE_MIME_TYPES.map((mime) =>
    extensionForMimeType(mime)
  );
  assert.deepEqual(extensions, ["png", "jpg", "webp", "avif"]);
  assert.equal(extensionForMimeType("image/svg+xml"), null);
  assert.equal(extensionForMimeType(42), null);
});

test("declared content types are normalized and allowlisted", () => {
  assert.equal(normalizeDeclaredMimeType("IMAGE/PNG"), "image/png");
  assert.equal(
    normalizeDeclaredMimeType("image/jpeg; charset=binary"),
    "image/jpeg"
  );
  assert.equal(normalizeDeclaredMimeType(" image/webp "), "image/webp");
  assert.equal(normalizeDeclaredMimeType("image/svg+xml"), null);
  assert.equal(normalizeDeclaredMimeType("text/html"), null);
  assert.equal(normalizeDeclaredMimeType(""), null);
  assert.equal(normalizeDeclaredMimeType(null), null);
});

// ---- content sniffing -------------------------------------------------------

test("magic bytes identify each accepted image format", () => {
  assert.equal(sniffImageMimeType(imageBytes("image/png")), "image/png");
  assert.equal(sniffImageMimeType(imageBytes("image/jpeg")), "image/jpeg");
  assert.equal(sniffImageMimeType(imageBytes("image/webp")), "image/webp");
  assert.equal(sniffImageMimeType(imageBytes("image/avif")), "image/avif");
});

test("non-image and truncated content is not sniffed as an image", () => {
  assert.equal(sniffImageMimeType(new Uint8Array(0)), null);
  assert.equal(
    sniffImageMimeType(new Uint8Array([..."<html>"].map((c) => c.charCodeAt(0)))),
    null
  );
  // A GIF signature must not be accepted (format is not in the allowlist).
  assert.equal(
    sniffImageMimeType(
      new Uint8Array([..."GIF89a"].map((c) => c.charCodeAt(0)))
    ),
    null
  );
  // A "RIFF" file that is not WebP.
  const riff = new Uint8Array(12);
  riff.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  riff.set([..."WAVE"].map((c) => c.charCodeAt(0)), 8);
  assert.equal(sniffImageMimeType(riff), null);
});

// ---- candidate validation ---------------------------------------------------

test("a matching, in-size image candidate passes and records the verified type", () => {
  const bytes = imageBytes(PNG_MIME);
  const result = validateUploadCandidate({
    kind: "portrait",
    declaredMimeType: "image/png",
    byteSize: bytes.byteLength,
    bytes,
  });

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.value.kind, "portrait");
  assert.equal(result.value.mimeType, "image/png");
  assert.equal(result.value.extension, "png");
  assert.equal(result.value.byteSize, bytes.byteLength);
  assert.equal(result.value.signatureVerified, true);
});

test("a mislabelled file is rejected even when the type looks valid", () => {
  // JPEG bytes uploaded as `image/png` (the classic "trust the extension" bug).
  const bytes = imageBytes("image/jpeg");
  const result = validateUploadCandidate({
    kind: "portrait",
    declaredMimeType: "image/png",
    byteSize: bytes.byteLength,
    bytes,
  });

  assert.equal(result.ok, false);
  assert.ok(issues(result).some((issue) => issue.path === "declaredMimeType"));
});

test("unknown content fails sniffing and is rejected", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const result = validateUploadCandidate({
    kind: "portrait",
    declaredMimeType: "image/png",
    byteSize: bytes.byteLength,
    bytes,
  });

  assert.equal(result.ok, false);
  assert.ok(issues(result).some((issue) => issue.path === "bytes"));
});

test("invalid kinds and content types are rejected", () => {
  const bytes = imageBytes(PNG_MIME);
  const result = validateUploadCandidate({
    kind: "executable",
    declaredMimeType: "image/svg+xml",
    byteSize: bytes.byteLength,
    bytes,
  });

  assert.equal(result.ok, false);
  const paths = issues(result).map((issue) => issue.path);
  assert.ok(paths.includes("kind"));
  assert.ok(paths.includes("declaredMimeType"));
});

test("size rules reject empty, oversized, and non-integer values", () => {
  const bytes = imageBytes(PNG_MIME);

  for (const byteSize of [0, -1, 1.5, "12", null]) {
    const result = validateUploadCandidate({
      kind: "portrait",
      declaredMimeType: "image/png",
      byteSize,
      bytes,
    });
    assert.equal(result.ok, false, `expected rejection for ${String(byteSize)}`);
  }

  const oversized = new Uint8Array(MAX_MEDIA_UPLOAD_BYTES + 1);
  oversized.set(imageBytes(PNG_MIME));
  const result = validateUploadCandidate({
    kind: "portrait",
    declaredMimeType: "image/png",
    byteSize: oversized.byteLength,
    bytes: oversized,
  });
  assert.equal(result.ok, false);
  assert.ok(issues(result).some((issue) => issue.path === "byteSize"));
});

test("a declared size that disagrees with the content is rejected", () => {
  const bytes = imageBytes(PNG_MIME);
  const result = validateUploadCandidate({
    kind: "portrait",
    declaredMimeType: "image/png",
    byteSize: bytes.byteLength + 1,
    bytes,
  });

  assert.equal(result.ok, false);
  assert.ok(issues(result).some((issue) => issue.path === "byteSize"));
});

test("validation without bytes still checks type and size, but flags the signature", () => {
  const result = validateUploadCandidate({
    kind: "logo",
    declaredMimeType: "image/webp",
    byteSize: 1024,
  });

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.value.signatureVerified, false);
});

// ---- object naming ----------------------------------------------------------

test("object names are built only from a typed kind, mime and a UUID", () => {
  const id = "2f1c8d4e-9a3b-4c5d-8e7f-0a1b2c3d4e5f";
  assert.equal(
    buildMediaObjectPath("splash_art", "image/webp", id),
    `splash_art/${id}.webp`
  );
  assert.equal(buildMediaObjectPath("portrait", "image/jpeg", id), `portrait/${id}.jpg`);
  // Non-UUID ids are refused so an arbitrary name can never reach the bucket.
  assert.equal(buildMediaObjectPath("portrait", "image/png", "not-a-uuid"), null);
  assert.equal(buildMediaObjectPath("portrait", "image/png", "../../etc/passwd"), null);
  assert.equal(
    buildMediaObjectPath("portrait", "image/png", "2F1C8D4E-9A3B-4C5D-8E7F-0A1B2C3D4E5F"),
    null
  );
});

test("the object-name pattern rejects traversal and stray names", () => {
  const id = "2f1c8d4e-9a3b-4c5d-8e7f-0a1b2c3d4e5f";
  assert.ok(isMediaObjectPath(`avatar/${id}.png`));

  for (const bad of [
    `../../${id}.png`,
    `portrait/${id}.svg`,
    `portrait/${id}`,
    `portrait/../${id}.png`,
    `/portrait/${id}.png`,
    `portrait/TWO/${id}.png`,
    "portrait/evil.png",
    "",
    null,
    42,
  ]) {
    assert.equal(isMediaObjectPath(bad), false, `expected ${String(bad)} to be invalid`);
  }

  // The exported pattern string is the SQL counterpart; keep it in sync.
  assert.equal(
    MEDIA_OBJECT_PATH_PATTERN,
    "^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp|avif)$"
  );
});

// ---- authorization ----------------------------------------------------------

const UNCONFIGURED: UploadActor = {
  configured: false,
  authenticated: false,
  isAdmin: false,
};
const ANONYMOUS: UploadActor = {
  configured: true,
  authenticated: false,
  isAdmin: false,
};
const NON_ADMIN: UploadActor = {
  configured: true,
  authenticated: true,
  isAdmin: false,
};
const ADMIN: UploadActor = { configured: true, authenticated: true, isAdmin: true };

test("upload authorization is fail-closed across anonymous and admin scenarios", () => {
  assert.deepEqual(decideUploadAuthorization(UNCONFIGURED), {
    allowed: false,
    code: "NOT_CONFIGURED",
  });
  assert.deepEqual(decideUploadAuthorization(ANONYMOUS), {
    allowed: false,
    code: "UNAUTHENTICATED",
  });
  assert.deepEqual(decideUploadAuthorization(NON_ADMIN), {
    allowed: false,
    code: "UNAUTHORIZED",
  });
});

test("the admin may upload, but only to the private draft bucket", () => {
  const decision = decideUploadAuthorization(ADMIN);
  assert.deepEqual(decision, { allowed: true, bucket: DRAFT_MEDIA_BUCKET });
  assert.notEqual(
    (decision as { bucket: string }).bucket,
    PUBLIC_MEDIA_BUCKET,
    "public-bucket writes belong to the publish workflow, never to a draft upload"
  );
});
