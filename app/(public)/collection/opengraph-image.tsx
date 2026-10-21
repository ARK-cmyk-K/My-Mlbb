import { connection } from "next/server";

import {
  buildOgPageContent,
  OG_CONTENT_TYPE,
  OG_FALLBACK_SUBTITLE,
  OG_IMAGE_SIZE,
} from "@/app/lib/og/og-model";
import { renderOgCard } from "@/app/lib/og/og-render";
import { resolveOgReleaseSummary } from "@/app/lib/og/og-service";

/**
 * Social preview card for the collection explorer (task `06-02`).
 *
 * Published content only — the counts come from the published release, so a
 * draft entry is never announced in a preview.
 *
 * `connection()` keeps the card out of the build-time prerender so it follows
 * a publish immediately; the response is cached at the edge for an hour.
 */

export const alt =
  "Explore the collection — every published hero and skin in the MLBB Showcase";

export const size = OG_IMAGE_SIZE;

export const contentType = OG_CONTENT_TYPE;

export default async function CollectionOpengraphImage() {
  await connection();

  const summary = await resolveOgReleaseSummary();
  const content = buildOgPageContent({
    eyebrow: "Collection",
    title: "Explore the collection",
    subtitle: summary
      ? `${summary.heroCount} ${summary.heroCount === 1 ? "hero" : "heroes"} · ${summary.skinCount} ${summary.skinCount === 1 ? "skin" : "skins"} published`
      : OG_FALLBACK_SUBTITLE,
  });

  return renderOgCard(content);
}
