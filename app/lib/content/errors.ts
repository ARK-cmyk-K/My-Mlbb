import type { FieldIssue } from "./validation.ts";

/**
 * Typed error boundary for the draft/published content service (task 02-03).
 *
 * Route handlers, Server Actions and UI components must be able to react to a
 * failure without parsing Postgres messages and without duplicating business
 * rules. Every service function either returns a typed success payload or
 * throws/returns a {@link ContentServiceError} carrying a stable
 * {@link ContentErrorCode}.
 *
 * Security notes:
 *   - A `ContentServiceError` never carries SQL text, table names, or Supabase
 *     internals. `cause` is present for server-side logging only and must not be
 *     serialized to the browser.
 *   - `UNAUTHENTICATED` (no verified session) and `UNAUTHORIZED` (session
 *     verified, not the configured admin) are deliberately distinct so callers
 *     can redirect versus forbid; neither reveals whether an admin is configured.
 */

export const CONTENT_ERROR_CODES = [
  /** The signed-in user is not the configured admin. */
  "UNAUTHORIZED",
  /** There is no verified session at all. */
  "UNAUTHENTICATED",
  /** The caller-supplied input failed validation. */
  "VALIDATION_FAILED",
  /** The requested draft record does not exist. */
  "NOT_FOUND",
  /** Nothing has been published yet, so there is no active release. */
  "NO_PUBLISHED_RELEASE",
  /** The requested state transition is not allowed. */
  "INVALID_TRANSITION",
  /** The operation conflicts with existing data (e.g. duplicate slug). */
  "CONFLICT",
  /** A referenced record does not exist (e.g. unknown hero for a skin). */
  "DEPENDENCY_MISSING",
  /** Supabase is not configured in this environment. */
  "NOT_CONFIGURED",
  /** The data store could not be reached or returned an unexpected error. */
  "STORE_UNAVAILABLE",
] as const;

export type ContentErrorCode = (typeof CONTENT_ERROR_CODES)[number];

/** HTTP status a route handler should use for each error code. */
export const HTTP_STATUS_BY_CODE: Record<ContentErrorCode, number> = {
  UNAUTHORIZED: 403,
  UNAUTHENTICATED: 401,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  NO_PUBLISHED_RELEASE: 404,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  DEPENDENCY_MISSING: 422,
  NOT_CONFIGURED: 503,
  STORE_UNAVAILABLE: 503,
};

/** Default, caller-safe message per code. */
const DEFAULT_MESSAGE: Record<ContentErrorCode, string> = {
  UNAUTHORIZED: "You are not authorized to perform this action.",
  UNAUTHENTICATED: "Sign in to continue.",
  VALIDATION_FAILED: "The submitted data is not valid.",
  NOT_FOUND: "The requested item does not exist.",
  NO_PUBLISHED_RELEASE: "No release has been published yet.",
  INVALID_TRANSITION: "That change is not allowed in the current state.",
  CONFLICT: "That change conflicts with existing data.",
  DEPENDENCY_MISSING: "A referenced item does not exist.",
  NOT_CONFIGURED: "The content store is not configured.",
  STORE_UNAVAILABLE: "The content store is temporarily unavailable.",
};

export interface ContentServiceErrorOptions {
  /** Field-level detail for `VALIDATION_FAILED`. */
  issues?: FieldIssue[];
  /** Server-side logging only. Never serialize to the browser. */
  cause?: unknown;
  /** Override the default message when a more specific one is safe. */
  message?: string;
}

/**
 * The single error type thrown by the content service. It is a plain `Error`
 * subclass so it survives `instanceof` checks across module boundaries.
 */
export class ContentServiceError extends Error {
  readonly code: ContentErrorCode;
  readonly issues: FieldIssue[];
  readonly status: number;

  constructor(code: ContentErrorCode, options: ContentServiceErrorOptions = {}) {
    super(options.message ?? DEFAULT_MESSAGE[code]);
    this.name = "ContentServiceError";
    this.code = code;
    this.issues = options.issues ?? [];
    this.status = HTTP_STATUS_BY_CODE[code];
    if (options.cause !== undefined) {
      // Preserved for server logs; `Error` keeps it non-enumerable-ish via the
      // standard `cause` slot so it is not included in naive JSON.stringify.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Narrowing helper for callers that catch `unknown`. */
export function isContentServiceError(
  error: unknown
): error is ContentServiceError {
  return error instanceof ContentServiceError;
}

/**
 * A serializable error shape safe to hand to a client component or a route
 * handler response body. It intentionally omits `cause`.
 */
export interface SerializedContentError {
  code: ContentErrorCode;
  message: string;
  status: number;
  issues: FieldIssue[];
}

export function serializeContentError(
  error: ContentServiceError
): SerializedContentError {
  return {
    code: error.code,
    message: error.message,
    status: error.status,
    issues: error.issues,
  };
}
