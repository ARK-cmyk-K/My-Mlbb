import { connection } from "next/server";

import {
  buildOgPageContent,
  OG_CONTENT_TYPE,
  OG_FALLBACK_SUBTITLE,
  OG_FALLBACK_TITLE,
  OG_IMAGE_SIZE,
} from "@/app/lib/og/og-model";
import { renderOgCard } from "@/app/lib/og/og-render";
import { resolveOgReleaseSummary } from "@/app/lib/og/og-service";

/**
 * Social preview card for the public homepage (task `06-02`).
 *
 * The card is generated from the **published** release only, so it can never
 * preview a draft entry, and it never renders private media.
 *
 * `connection()` opts the route out of the build-time prerender: the published
 * release changes when the admin publishes, and a card that was frozen into
 * the build output would keep showing the old release until the next deploy.
 * The response itself is still cached at the edge for an hour.
 */

export const alt =
  "MLBB Showcase — a personal Mobile Legends: Bang Bang account showcase";

export const size = OG_IMAGE_SIZE;

export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage() {
  await connection();

  const summary = await resolveOgReleaseSummary();
  const content = buildOgPageContent({
    eyebrow: summary?.releaseName ?? OG_FALLBACK_TITLE,
    title: OG_FALLBACK_TITLE,
    subtitle: summary
      ? `${summary.heroCount} ${summary.heroCount === 1 ? "hero" : "heroes"} · ${summary.skinCount} ${summary.skinCount === 1 ? "skin" : "skins"} published`
      : OG_FALLBACK_SUBTITLE,
  });

  return renderOgCard(content);
}
