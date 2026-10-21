import { MEDIA_OBJECT_PATH_PATTERN, PUBLIC_MEDIA_BUCKET } from "../media/upload-policy.ts";

/**
 * Social preview card model (task `06-02`).
 *
 * Pure rules for the Open Graph / Twitter cards:
 *
 * - **Route identifiers are validated.** A card is addressed by
 *   `<kind>/<slug>`; only the two public kinds (`hero`, `skin`) and a safe
 *   slug shape are accepted. Anything else resolves to the generic card, so a
 *   crawler can never make the renderer read an unexpected identifier.
 * - **Text is bounded.** Every string that reaches the card is trimmed and
 *   truncated, so a long display name cannot break the layout or overflow the
 *   image.
 * - **Only published text is used.** The model has no access to draft data at
 *   all: the caller resolves a subject from the *published* projection and
 *   hands over plain strings.
 * - **Artwork is optional and always safe.** A card may carry a public
 *   artwork URL, but only for an object in the public bucket whose path
 *   matches the storage policy's object-path pattern. Everything else renders
 *   the typographic fallback.
 *
 * The module is pure (no I/O, no React, no browser APIs) so it can be unit
 * tested directly.
 */

/** The Open Graph image size used by every card. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** The exported `size` config for the image routes. */
export const OG_IMAGE_SIZE = {
  width: OG_IMAGE_WIDTH,
  height: OG_IMAGE_HEIGHT,
} as const;

/** The content type of every generated card. */
export const OG_CONTENT_TYPE = "image/png";

/** The public entry kinds a card can be generated for. */
export const OG_SUBJECT_KINDS = ["hero", "skin"] as const;

/** One of the public entry kinds. */
export type OgSubjectKind = (typeof OG_SUBJECT_KINDS)[number];

/** Maximum length of a slug accepted in a card identifier. */
export const OG_SLUG_MAX_LENGTH = 80;

/** Maximum length of the card title. */
export const OG_TITLE_MAX_LENGTH = 80;

/** Maximum length of the card subtitle. */
export const OG_SUBTITLE_MAX_LENGTH = 120;

/** Maximum length of the small label above the title. */
export const OG_EYEBROW_MAX_LENGTH = 24;

/**
 * A safe slug shape.
 *
 * Slugs are generated from the display name, so they are lowercase letters,
 * digits and dashes. Restricting the shape keeps the identifier out of any
 * path traversal or query-injection territory before it reaches a query.
 */
const OG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/** The object-path pattern the storage policies enforce. */
const MEDIA_OBJECT_PATH_REGEX = new RegExp(MEDIA_OBJECT_PATH_PATTERN);

/** A validated card identifier. */
export interface OgIdentifier {
  kind: OgSubjectKind;
  slug: string;
}

/**
 * Validates a card identifier.
 *
 * Returns `null` for anything that is not one of the public kinds with a
 * safe slug — the caller then renders the generic card instead of failing.
 */
export function parseOgIdentifier(
  kind: unknown,
  slug: unknown
): OgIdentifier | null {
  if (typeof kind !== "string" || typeof slug !== "string") {
    return null;
  }
  const normalizedKind = kind.trim().toLowerCase();
  if (
    !(OG_SUBJECT_KINDS as readonly string[]).includes(normalizedKind)
  ) {
    return null;
  }
  const normalizedSlug = slug.trim().toLowerCase();
  if (
    normalizedSlug.length === 0 ||
    normalizedSlug.length > OG_SLUG_MAX_LENGTH ||
    !OG_SLUG_PATTERN.test(normalizedSlug)
  ) {
    return null;
  }
  return {
    kind: normalizedKind as OgSubjectKind,
    slug: normalizedSlug,
  };
}

/**
 * Truncates text to a maximum length without cutting a word in half.
 *
 * The result is never longer than `maxLength`, and it always ends in an
 * ellipsis when it had to be shortened.
 */
export function truncateOgText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (maxLength <= 0) {
    return "";
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  if (maxLength === 1) {
    return "…";
  }
  // One character is reserved for the ellipsis.
  const limit = maxLength - 1;
  const hardCut = trimmed.slice(0, limit);
  const lastSpace = hardCut.lastIndexOf(" ");
  const body = lastSpace > limit * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${body.replace(/[\s.,;:!?-]+$/u, "")}…`;
}

/** The title used when nothing better is known. */
export const OG_FALLBACK_TITLE = "MLBB Showcase";

/** The subtitle used when nothing better is known. */
export const OG_FALLBACK_SUBTITLE =
  "A personal Mobile Legends: Bang Bang account showcase.";

/** Everything the card renderer needs. */
export interface OgCardContent {
  /** Small label above the title (e.g. "Hero", "Collection"). */
  eyebrow: string;
  /** The card headline. */
  title: string;
  /** The supporting line under the headline. */
  subtitle: string;
  /**
   * Optional artwork, already inlined as a data URL.
   *
   * `null` means "render the typographic fallback", which is what happens
   * whenever the artwork is missing, private or not safe to fetch.
   */
  imageDataUrl: string | null;
}

/** A published entry a card is generated for. */
export interface OgSubject {
  kind: OgSubjectKind;
  name: string;
  slug: string;
  /** Public context line (the hero's role, the skin's rarity, …). */
  context: string | null;
}

/**
 * Builds the card content for a published hero or skin.
 *
 * The subject must already come from the published projection — the model
 * itself never reads anything.
 */
export function buildOgSubjectContent(subject: OgSubject): OgCardContent {
  const title = truncateOgText(subject.name, OG_TITLE_MAX_LENGTH);
  const subtitle = truncateOgText(
    subject.context && subject.context.trim().length > 0
      ? subject.context
      : OG_FALLBACK_SUBTITLE,
    OG_SUBTITLE_MAX_LENGTH
  );
  return {
    eyebrow: truncateOgText(
      subject.kind === "hero" ? "Hero" : "Skin",
      OG_EYEBROW_MAX_LENGTH
    ),
    title: title.length > 0 ? title : OG_FALLBACK_TITLE,
    subtitle,
    imageDataUrl: null,
  };
}

/**
 * Builds the card content for a page (the homepage, the collection).
 */
export function buildOgPageContent(input: {
  eyebrow: string;
  title: string;
  subtitle: string;
}): OgCardContent {
  const title = truncateOgText(input.title, OG_TITLE_MAX_LENGTH);
  const subtitle = truncateOgText(input.subtitle, OG_SUBTITLE_MAX_LENGTH);
  return {
    eyebrow: truncateOgText(input.eyebrow, OG_EYEBROW_MAX_LENGTH),
    title: title.length > 0 ? title : OG_FALLBACK_TITLE,
    subtitle: subtitle.length > 0 ? subtitle : OG_FALLBACK_SUBTITLE,
    imageDataUrl: null,
  };
}

/**
 * Builds the public URL of a published media object.
 *
 * Returns `null` unless **all** of the following hold:
 *
 * - the Supabase origin is an absolute `http(s)` URL;
 * - the object path matches the storage policy's `<kind>/<uuid>.<ext>` shape;
 * - the bucket is the public bucket.
 *
 * A draft object never satisfies the third condition, so a card can never be
 * pointed at private media.
 */
export function buildPublicMediaUrl(
  supabaseOrigin: string | null | undefined,
  objectPath: string | null | undefined,
  bucket: string | null | undefined
): string | null {
  if (typeof supabaseOrigin !== "string" || supabaseOrigin.trim() === "") {
    return null;
  }
  if (typeof objectPath !== "string" || objectPath.trim() === "") {
    return null;
  }
  if (bucket !== PUBLIC_MEDIA_BUCKET) {
    return null;
  }
  const path = objectPath.trim();
  if (!MEDIA_OBJECT_PATH_REGEX.test(path)) {
    return null;
  }
  let origin: URL;
  try {
    origin = new URL(supabaseOrigin.trim());
  } catch {
    return null;
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return null;
  }
  return `${origin.origin}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${path}`;
}

/**
 * The canonical site origin used for absolute URLs in metadata.
 *
 * `NEXT_PUBLIC_SITE_URL` is preferred (a preview deployment must not claim to
 * be production); the browser origin is the fallback. An unusable value yields
 * an empty string, and the caller then omits the absolute URL rather than
 * inventing one.
 */
export function resolveSiteOrigin(
  configured: string | null | undefined,
  fallback: string | null | undefined
): string {
  const fromEnv = normalizeSiteOrigin(configured);
  if (fromEnv !== "") {
    return fromEnv;
  }
  return normalizeSiteOrigin(fallback);
}

/** Normalises an origin to `scheme://host[:port]`, or `""` when unusable. */
export function normalizeSiteOrigin(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "";
  }
  return parsed.origin;
}
