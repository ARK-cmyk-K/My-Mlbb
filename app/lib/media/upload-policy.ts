import type { FieldIssue, ValidationResult } from "../content/validation.ts";

/**
 * Media upload policy (task 02-04).
 *
 * This module is the single, dependency-free source of truth for *what a
 * legitimate media upload looks like* and *who may perform one*. It contains no
 * I/O, no Supabase import and no `process.env` access, so it is directly
 * unit-testable and safe to import from either a server module or a client form
 * for immediate pre-flight feedback.
 *
 * It is **not** the security boundary. Authorization and validation are also
 * enforced where they cannot be bypassed:
 *
 *   - `public.is_admin()` + RLS policies on `storage.objects`
 *     (`supabase/migrations/20261019160000_storage_buckets_and_policies.sql`)
 *     decide what a browser session may actually read or write. Hiding a button
 *     is never authorization.
 *   - `media` RLS policies (`01-04`) gate the metadata registry.
 *   - The Storage API enforces each bucket's `allowed_mime_types` and
 *     `file_size_limit`.
 *
 * The rules below exist so the dashboard fails fast and consistently, and so a
 * server-side upload never reaches the provider with a value the policy or the
 * database would reject.
 *
 * Two buckets, two trust levels:
 *
 *   - {@link DRAFT_MEDIA_BUCKET} — **private**. The only upload target. Objects
 *     here are reachable by nobody but the configured admin.
 *   - {@link PUBLIC_MEDIA_BUCKET} — **public read**. It must contain *only*
 *     objects referenced by a media row whose `publication_state = 'published'`.
 *     It is never a direct upload target: only the publish workflow (task 04-06)
 *     may write to it, and the storage policy re-checks the published media row.
 */

/** `public.media_kind` — mirrored from the core-schema migration. */
export const MEDIA_KINDS = [
  "avatar",
  "portrait",
  "splash_art",
  "thumbnail",
  "badge",
  "logo",
  "other",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Private bucket for draft/unpublished objects. Never public. */
export const DRAFT_MEDIA_BUCKET = "showcase-draft" as const;

/** Public-read bucket for objects referenced by *published* media only. */
export const PUBLIC_MEDIA_BUCKET = "showcase-public" as const;

/**
 * Hard ceiling for a single media object (10 MiB). Enforced here, in the
 * storage policy migration's bucket `file_size_limit`, and by the Storage API.
 * Large enough for a full-resolution splash art, small enough to bound abuse.
 */
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Accepted image content types. The extension of the uploaded filename is
 * deliberately **not** consulted — see {@link validateUploadCandidate}.
 *
 * `image/svg+xml` is intentionally excluded: SVG can carry script and is a
 * stored-XSS vector when served from a public bucket. `image/gif` is excluded
 * because the design system does not use it.
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * Canonical extension per accepted type. The stored object's extension is
 * derived from the *verified* content, never from the uploader's filename.
 */
export const EXTENSION_BY_MIME_TYPE: Record<AllowedImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * The only object-name shape this project creates:
 *
 *     <kind>/<uuid>.<ext>      e.g. portrait/2f1c…a9.png
 *
 * Rationale:
 *   - The name is fully server-generated; the uploader controls none of it, so
 *     path traversal (`../`), leading dots, absolute paths and collisions are
 *     impossible by construction.
 *   - The `<kind>/` prefix mirrors the `media_kind` enum and keeps the bucket
 *     browsable in the Supabase dashboard.
 *   - The UUID segment guarantees uniqueness without a synchronous lookup.
 *
 * This exact pattern is inlined in the `storage.objects` policies in
 * `supabase/migrations/20261019160000_storage_buckets_and_policies.sql`. If it
 * changes here it must change there in the same task.
 */
export const MEDIA_OBJECT_PATH_PATTERN =
  "^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp|avif)$";

const MEDIA_OBJECT_PATH_REGEX = new RegExp(MEDIA_OBJECT_PATH_PATTERN);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Narrows a value to the `media_kind` enum. */
export function isMediaKind(value: unknown): value is MediaKind {
  return (
    typeof value === "string" && (MEDIA_KINDS as readonly string[]).includes(value)
  );
}

/** Narrows a value to an accepted image content type. */
export function isAllowedImageMimeType(
  value: unknown
): value is AllowedImageMimeType {
  return (
    typeof value === "string" &&
    (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Normalizes a declared content type: lower-cases it and drops any parameters
 * (`image/png; charset=binary` -> `image/png`). Returns `null` when the result
 * is not an accepted type.
 */
export function normalizeDeclaredMimeType(
  raw: unknown
): AllowedImageMimeType | null {
  if (typeof raw !== "string") {
    return null;
  }
  const base = raw.split(";", 1)[0].trim().toLowerCase();
  return isAllowedImageMimeType(base) ? base : null;
}

/** The canonical extension for a verified content type, or `null`. */
export function extensionForMimeType(mimeType: unknown): string | null {
  return isAllowedImageMimeType(mimeType)
    ? EXTENSION_BY_MIME_TYPE[mimeType]
    : null;
}

/** True when `value` is a lower-case UUID (any version). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** True when `value` is exactly a valid media object name (see the pattern). */
export function isMediaObjectPath(value: unknown): boolean {
  return typeof value === "string" && MEDIA_OBJECT_PATH_REGEX.test(value);
}

/**
 * Builds the deterministic object name for a media object. Returns `null` when
 * the id is not a UUID, so a caller can never smuggle an arbitrary name into the
 * bucket. `kind` and `mimeType` are typed, so only a valid pair can be passed.
 */
export function buildMediaObjectPath(
  kind: MediaKind,
  mimeType: AllowedImageMimeType,
  id: string
): string | null {
  if (!isUuid(id)) {
    return null;
  }
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  return `${kind}/${id}.${extension}`;
}

// ---------------------------------------------------------------------------
// Content sniffing — never trust the filename or the declared type alone
// ---------------------------------------------------------------------------

function startsWith(bytes: Uint8Array, pattern: readonly number[]): boolean {
  if (bytes.length < pattern.length) {
    return false;
  }
  return pattern.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/**
 * Identifies an accepted image by its leading magic bytes.
 *
 * This is a cheap, defence-in-depth check to catch a mislabelled file (for
 * example a JPEG uploaded with `Content-Type: image/png`). It is not a full
 * format decoder; the authoritative validation for a hosted project is the
 * Storage API's content-type handling plus, for truly hostile input, an image
 * re-encode step. It exists so the common "wrong extension / wrong type" case is
 * rejected before the object is written.
 */
export function sniffImageMimeType(
  bytes: Uint8Array
): AllowedImageMimeType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // WebP: "RIFF" … "WEBP"
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
    return "image/webp";
  }
  // AVIF: ISO base media file format, `ftyp` box with an AVIF major brand.
  if (
    asciiAt(bytes, 4, "ftyp") &&
    (asciiAt(bytes, 8, "avif") || asciiAt(bytes, 8, "avis"))
  ) {
    return "image/avif";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Candidate validation
// ---------------------------------------------------------------------------

/** Raw, untrusted upload candidate as handed to the validator. */
export interface UploadCandidateInput {
  /** Claimed `media_kind`. */
  kind: unknown;
  /** Declared content type (from the file input / multipart header). */
  declaredMimeType: unknown;
  /** Size in bytes. Callers should pass the *actual* byte length. */
  byteSize: unknown;
  /**
   * The first bytes of the file. When supplied, the magic number is checked
   * against the declared type. The production upload path always supplies them.
   */
  bytes?: Uint8Array;
}

/** A candidate that passed every rule. */
export interface ValidatedUpload {
  kind: MediaKind;
  mimeType: AllowedImageMimeType;
  extension: string;
  byteSize: number;
  /**
   * True only when `bytes` were supplied and their magic number matched the
   * declared type. A `false` here means the caller skipped content verification
   * and must not be treated as trusted by a privileged path.
   */
  signatureVerified: boolean;
}

/**
 * Validates and normalizes an upload candidate. Mirrors the database CHECKs
 * (`media_byte_size_positive`, the `media_kind` enum) and the bucket rules
 * (`allowed_mime_types`, `file_size_limit`), and adds the magic-byte check.
 *
 * The filename is intentionally not an input: extension never influences the
 * decision, and the extension of the stored object is derived from the verified
 * content type (see {@link buildMediaObjectPath}).
 */
export function validateUploadCandidate(
  input: unknown
): ValidationResult<ValidatedUpload> {
  const issues: FieldIssue[] = [];
  const candidate = (input ?? {}) as Partial<UploadCandidateInput>;

  const kind = isMediaKind(candidate.kind) ? candidate.kind : null;
  if (kind === null) {
    issues.push({
      path: "kind",
      message: `must be one of: ${MEDIA_KINDS.join(", ")}`,
    });
  }

  const mimeType = normalizeDeclaredMimeType(candidate.declaredMimeType);
  if (mimeType === null) {
    issues.push({
      path: "declaredMimeType",
      message: `must be one of: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}`,
    });
  }

  let byteSize = 0;
  if (
    typeof candidate.byteSize !== "number" ||
    !Number.isInteger(candidate.byteSize) ||
    candidate.byteSize <= 0
  ) {
    issues.push({ path: "byteSize", message: "must be a positive whole number" });
  } else if (candidate.byteSize > MAX_MEDIA_UPLOAD_BYTES) {
    issues.push({
      path: "byteSize",
      message: `must not exceed ${MAX_MEDIA_UPLOAD_BYTES} bytes`,
    });
  } else {
    byteSize = candidate.byteSize;
  }

  let signatureVerified = false;
  const bytes = candidate.bytes;
  if (bytes !== undefined) {
    if (!(bytes instanceof Uint8Array)) {
      issues.push({ path: "bytes", message: "must be a Uint8Array" });
    } else {
      if (bytes.byteLength !== candidate.byteSize) {
        issues.push({
          path: "byteSize",
          message: "must equal the length of the supplied content",
        });
      }
      const sniffed = sniffImageMimeType(bytes);
      if (sniffed === null) {
        issues.push({
          path: "bytes",
          message: "content is not a recognised PNG, JPEG, WebP or AVIF image",
        });
      } else if (mimeType !== null && sniffed !== mimeType) {
        issues.push({
          path: "declaredMimeType",
          message: `does not match the file content (detected ${sniffed})`,
        });
      } else {
        signatureVerified = true;
      }
    }
  }

  if (issues.length > 0 || kind === null || mimeType === null) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      kind,
      mimeType,
      extension: EXTENSION_BY_MIME_TYPE[mimeType],
      byteSize,
      signatureVerified,
    },
  };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** The verified facts about the caller, resolved by the server boundary. */
export interface UploadActor {
  /** Supabase connection details are present and valid. */
  configured: boolean;
  /** A verified (non-forged, non-expired) session exists. */
  authenticated: boolean;
  /** The database reports the session's user as the configured admin. */
  isAdmin: boolean;
}

/** Why an upload was denied. Codes match `ContentErrorCode` and HTTP statuses. */
export type UploadDenialCode =
  | "NOT_CONFIGURED"
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED";

export type UploadAuthorization =
  | { allowed: true; bucket: typeof DRAFT_MEDIA_BUCKET }
  | { allowed: false; code: UploadDenialCode };

/**
 * Decides where (if anywhere) a caller may upload, fail-closed and top-down:
 *
 *   - unconfigured -> deny `NOT_CONFIGURED`
 *   - no verified session -> deny `UNAUTHENTICATED`
 *   - session that is not the admin -> deny `UNAUTHORIZED`
 *   - the configured admin -> allow, **to the private draft bucket only**
 *
 * The public bucket is deliberately unreachable here: it is written only by the
 * transactional publish workflow (task 04-06), so a draft upload can never leak
 * into the public-read bucket.
 */
export function decideUploadAuthorization(
  actor: UploadActor
): UploadAuthorization {
  if (!actor.configured) {
    return { allowed: false, code: "NOT_CONFIGURED" };
  }
  if (!actor.authenticated) {
    return { allowed: false, code: "UNAUTHENTICATED" };
  }
  if (!actor.isAdmin) {
    return { allowed: false, code: "UNAUTHORIZED" };
  }
  return { allowed: true, bucket: DRAFT_MEDIA_BUCKET };
}
