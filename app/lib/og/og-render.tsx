import { ImageResponse } from "next/og";

import { OgCard } from "@/app/components/og/og-card";
import { OG_IMAGE_SIZE, type OgCardContent } from "./og-model.ts";

/**
 * Renders a social preview card (task `06-02`).
 *
 * `next/og` is Next.js' built-in copy of `@vercel/og`: the same satori +
 * resvg renderer, bundled with the framework, so the project does not take on
 * an extra dependency for the preview images.
 *
 * The response is a PNG of exactly {@link OG_IMAGE_SIZE}. It is cached at the
 * edge for an hour with a day of stale-while-revalidate, because a card
 * changes only when the published release changes.
 */
export function renderOgCard(content: OgCardContent): ImageResponse {
  return new ImageResponse(<OgCard content={content} />, {
    ...OG_IMAGE_SIZE,
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
