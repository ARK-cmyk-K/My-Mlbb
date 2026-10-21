import "server-only";

import { contentService, isContentServiceError } from "@/app/lib/content";
import { requireSupabaseAnonClient } from "@/app/lib/content/client";
import { readSupabaseConfig } from "@/app/lib/supabase/config";
import { formatEnumLabel } from "../showcase/showcase-model.ts";
import {
  buildPublicMediaUrl,
  type OgIdentifier,
  type OgSubject,
} from "./og-model.ts";

/**
 * Server-side resolution for the social preview cards (task `06-02`).
 *
 * Everything a card can show comes from the **published** projection:
 *
 * - the entry itself comes from `contentService.getPublishedRelease()`, which
 *   reads `published_heroes` / `published_skins` exclusively. A draft entry is
 *   not reachable from here, so a card can never preview unpublished content.
 * - the artwork comes from the `published_media` view, which only lists media
 *   rows whose `publication_state = 'published'`, and only from the **public**
 *   bucket. A private (draft) object is rejected by
 *   {@link buildPublicMediaUrl} before any URL is produced.
 *
 * The service never throws for a missing entry: the caller renders the generic
 * card instead, so a crawler always receives a valid image.
 */

/** A published entry resolved for a card, with its optional artwork. */
export interface ResolvedOgSubject {
  subject: OgSubject;
  /**
   * The artwork as an inline data URL, or `null` when there is no safe
   * artwork.
   *
   * The image is downloaded and inlined here rather than handed to the card
   * renderer as a remote URL: the renderer cannot report a failed image, so a
   * missing or unreachable object has to be turned into "no artwork" *before*
   * the card is built. That is the safe fallback.
   */
  imageDataUrl: string | null;
}

/** Maximum size of an artwork embedded in a card. */
const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;

/** How long the artwork download may take. */
const ARTWORK_TIMEOUT_MS = 3000;

/** A short summary of the published release, used by the page cards. */
export interface OgReleaseSummary {
  releaseName: string | null;
  heroCount: number;
  skinCount: number;
}

/**
 * Resolves a validated identifier against the published release.
 *
 * Returns `null` when the identifier is valid but no published entry carries
 * that slug (for example because the entry was unpublished in the meantime).
 */
export async function resolveOgSubject(
  identifier: OgIdentifier
): Promise<ResolvedOgSubject | null> {
  const release = await loadPublishedRelease();
  if (release === null) {
    return null;
  }

  if (identifier.kind === "hero") {
    const hero = release.heroes.find((entry) => entry.slug === identifier.slug);
    if (!hero) {
      return null;
    }
    const context = hero.secondaryRole
      ? `${formatEnumLabel(hero.primaryRole)} / ${formatEnumLabel(hero.secondaryRole)}`
      : formatEnumLabel(hero.primaryRole);
    return {
      subject: {
        kind: "hero",
        name: hero.name,
        slug: hero.slug,
        context,
      },
      imageDataUrl: await resolvePublicArtwork(hero.portraitMediaId),
    };
  }

  const skin = release.skins.find((entry) => entry.slug === identifier.slug);
  if (!skin) {
    return null;
  }
  return {
    subject: {
      kind: "skin",
      name: skin.name,
      slug: skin.slug,
      context: formatEnumLabel(skin.rarity),
    },
    imageDataUrl: await resolvePublicArtwork(skin.splashArtMediaId),
  };
}

/**
 * Summarises the published release for the page cards.
 *
 * Returns `null` when nothing is published, so the caller can render the
 * generic card.
 */
export async function resolveOgReleaseSummary(): Promise<OgReleaseSummary | null> {
  const release = await loadPublishedRelease();
  if (release === null) {
    return null;
  }
  return {
    releaseName: release.release.name,
    heroCount: release.heroes.length,
    skinCount: release.skins.length,
  };
}

/**
 * Reads the published release, or `null` when there is nothing published.
 *
 * A store outage is also reported as `null`: a card must render even when the
 * database is unreachable, and the card is a preview, not a source of truth.
 */
async function loadPublishedRelease() {
  try {
    return await contentService.getPublishedRelease();
  } catch (error) {
    if (
      isContentServiceError(error) &&
      error.code === "NO_PUBLISHED_RELEASE"
    ) {
      return null;
    }
    return null;
  }
}

/**
 * Resolves the artwork of a published media object as an inline data URL.
 *
 * Returns `null` when the media is unknown, unpublished, not in the public
 * bucket, when the project is not configured, or when the object cannot be
 * fetched safely (wrong content type, too large, unreachable).
 */
async function resolvePublicArtwork(
  mediaId: string | null
): Promise<string | null> {
  if (!mediaId) {
    return null;
  }
  const config = readSupabaseConfig(process.env);
  if (!config) {
    return null;
  }
  const publicUrl = await lookupPublicMediaUrl(config.url, mediaId);
  if (!publicUrl) {
    return null;
  }
  return downloadArtwork(publicUrl);
}

/** Looks the published media row up and builds its public URL. */
async function lookupPublicMediaUrl(
  supabaseUrl: string,
  mediaId: string
): Promise<string | null> {
  try {
    const db = requireSupabaseAnonClient();
    const result = await db
      .from("published_media")
      .select("storage_bucket, object_path")
      .eq("id", mediaId)
      .limit(1);
    if (result.error) {
      return null;
    }
    const row = (result.data as
      | Array<{ storage_bucket?: unknown; object_path?: unknown }>
      | null)?.[0];
    if (!row) {
      return null;
    }
    return buildPublicMediaUrl(
      supabaseUrl,
      typeof row.object_path === "string" ? row.object_path : null,
      typeof row.storage_bucket === "string" ? row.storage_bucket : null
    );
  } catch {
    return null;
  }
}

/**
 * Downloads a public artwork and inlines it.
 *
 * The image is only accepted when the response says it is an image and the
 * body is small enough to embed; anything else yields `null` and the card
 * falls back to its typographic layout.
 */
async function downloadArtwork(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ARTWORK_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ARTWORK_BYTES) {
      return null;
    }
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${contentType.split(";")[0].trim()};base64,${base64}`;
  } catch {
    return null;
  }
}
