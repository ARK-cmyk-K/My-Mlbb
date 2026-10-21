import { EXPLORER_PARAM_KEYS } from "../explorer/explorer-model.ts";
import type { FavoriteKind } from "./favorites-model.ts";

/**
 * One-click sharing for published entries (task `05-06`).
 *
 * The rules this module owns:
 *
 * - **Canonical public URLs only.** A shared link always points at the public
 *   collection explorer filtered to the entry (`/collection?view=…&q=<slug>`).
 *   It never contains a draft row, a private media id, an internal id that
 *   exposes storage layout, or any state a visitor could not already see.
 *   The slug is used instead of the display name so a link survives a rename.
 * - **Encoded text.** Every value that reaches a third-party network is
 *   percent-encoded, and the message length is bounded.
 * - **Pure.** No `window`, no `navigator`, no network: the browser decides
 *   which transport to use, this module only builds the payloads. That keeps
 *   the rules unit-testable and keeps the server render free of browser APIs.
 */

/** The share transports the UI offers. */
export const SHARE_TARGETS = [
  "native",
  "x",
  "telegram",
  "discord",
  "copy",
] as const;

export type ShareTarget = (typeof SHARE_TARGETS)[number];

/** Transports that are opened as a third-party URL. */
export type ShareLinkTarget = Extract<ShareTarget, "x" | "telegram">;

/** The published entry being shared. */
export interface ShareSubject {
  kind: FavoriteKind;
  id: string;
  name: string;
  slug: string;
  /** Optional short context line, e.g. the rarity or the hero a skin belongs to. */
  context?: string | null;
}

/** Everything a transport needs. */
export interface ShareContent {
  /** Short title, used as the native-share title. */
  title: string;
  /** Sentence shared alongside the link. */
  text: string;
  /** Absolute canonical public URL. */
  url: string;
}

/** Maximum length of the shared sentence. */
export const SHARE_TEXT_MAX_LENGTH = 200;

/** Maximum length of the shared title. */
export const SHARE_TITLE_MAX_LENGTH = 80;

/** Public path of the collection explorer. */
export const COLLECTION_PATH = "/collection";

/**
 * Truncates text to a maximum length without cutting a word in half.
 *
 * Word boundaries matter because the truncated sentence is shown in a native
 * share sheet, where a dangling half-word looks broken.
 */
export function truncateShareText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  // One character is reserved for the ellipsis so the result never exceeds
  // the limit.
  const limit = Math.max(1, maxLength - 1);
  const hardCut = trimmed.slice(0, limit);
  const lastSpace = hardCut.lastIndexOf(" ");
  const body = lastSpace > limit * 0.6 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${body.replace(/[\s.,;:!?-]+$/u, "")}…`;
}

/**
 * Builds the shared sentence for an entry.
 *
 * Only the entry's published display name and its optional public context are
 * used — never an internal identifier or unpublished data.
 */
export function buildShareText(subject: ShareSubject): string {
  const context = subject.context?.trim();
  const base = context
    ? `Check out ${subject.name} (${context}) in the MLBB Showcase.`
    : `Check out ${subject.name} in the MLBB Showcase.`;
  return truncateShareText(base, SHARE_TEXT_MAX_LENGTH);
}

/**
 * Builds the shared title for an entry.
 */
export function buildShareTitle(subject: ShareSubject): string {
  return truncateShareText(subject.name, SHARE_TITLE_MAX_LENGTH);
}

/**
 * Builds the public explorer path for an entry (relative, no origin).
 *
 * The explorer view and the slug are both URL-encoded, so a slug containing
 * unusual characters cannot break the query string.
 */
export function buildEntryExplorerPath(
  subject: Pick<ShareSubject, "kind" | "slug">
): string {
  const params = new URLSearchParams();
  params.set(
    EXPLORER_PARAM_KEYS.view,
    subject.kind === "skin" ? "skins" : "heroes"
  );
  params.set(EXPLORER_PARAM_KEYS.query, subject.slug);
  return `${COLLECTION_PATH}?${params.toString()}`;
}

/**
 * Builds the canonical public URL for an entry.
 *
 * The explorer view and the slug are both URL-encoded, so a slug containing
 * unusual characters cannot break the query string.
 */
export function buildEntryShareUrl(
  origin: string,
  subject: Pick<ShareSubject, "kind" | "slug">
): string {
  const base = origin.replace(/\/+$/u, "");
  return `${base}${buildEntryExplorerPath(subject)}`;
}

/**
 * Builds the full share payload for an entry.
 */
export function buildShareContent(
  origin: string,
  subject: ShareSubject
): ShareContent {
  return {
    title: buildShareTitle(subject),
    text: buildShareText(subject),
    url: buildEntryShareUrl(origin, subject),
  };
}

/**
 * Resolves the origin used for canonical share URLs.
 *
 * Preference order:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — the deployed origin, so a link shared from a
 *    preview deployment still points at production.
 * 2. The browser's current origin.
 *
 * Returns an empty string when neither is usable; the caller then hides the
 * share actions instead of producing a broken link.
 */
export function resolveShareOrigin(
  configured: string | null | undefined,
  browserOrigin: string | null | undefined
): string {
  const fromEnv = normalizeOrigin(configured);
  if (fromEnv) {
    return fromEnv;
  }
  return normalizeOrigin(browserOrigin);
}

/**
 * Normalises an origin to `scheme://host[:port]` without a trailing slash.
 *
 * Anything that is not an absolute `http(s)` URL is rejected, so a stray
 * configuration value can never turn a share link into something that points
 * somewhere unexpected.
 */
export function normalizeOrigin(value: string | null | undefined): string {
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
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Builds the third-party share URL for a transport.
 *
 * Returns `null` for transports that are not opened as a link (`native`,
 * `discord`, `copy`) — those are handled by the browser APIs in the component.
 */
export function buildShareIntent(
  target: ShareLinkTarget,
  content: ShareContent
): string | null {
  switch (target) {
    case "x": {
      const params = new URLSearchParams();
      params.set("text", content.text);
      params.set("url", content.url);
      return `https://twitter.com/intent/tweet?${params.toString()}`;
    }
    case "telegram": {
      const params = new URLSearchParams();
      params.set("url", content.url);
      params.set("text", content.text);
      return `https://t.me/share/url?${params.toString()}`;
    }
    default:
      return null;
  }
}

/**
 * Where a Discord share lands.
 *
 * Discord has no public "share this link" intent, so the message is copied to
 * the clipboard and the visitor is taken to their own Discord home, ready to
 * paste it into any channel.
 */
export const DISCORD_SHARE_TARGET = "https://discord.com/channels/@me";

/**
 * True when the browser exposes the native share sheet.
 *
 * The check is deliberately conservative: `navigator.share` must exist and
 * `navigator.canShare` (when present) must accept the payload.
 */
export function canShareNatively(
  navigatorLike: {
    share?: unknown;
    canShare?: unknown;
  } | null | undefined,
  payload?: { title?: string; text?: string; url?: string }
): boolean {
  if (!navigatorLike || typeof navigatorLike.share !== "function") {
    return false;
  }
  const canShare = navigatorLike.canShare;
  if (typeof canShare !== "function") {
    return true;
  }
  try {
    return Boolean(
      (canShare as (data: unknown) => boolean)(payload ?? { url: "" })
    );
  } catch {
    return false;
  }
}
