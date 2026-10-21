import {
  buildOgPageContent,
  buildOgSubjectContent,
  OG_FALLBACK_SUBTITLE,
  OG_FALLBACK_TITLE,
  parseOgIdentifier,
} from "@/app/lib/og/og-model";
import { renderOgCard } from "@/app/lib/og/og-render";
import { resolveOgSubject } from "@/app/lib/og/og-service";

/**
 * Per-entry social preview card (task `06-02`).
 *
 * `GET /api/og/<kind>/<slug>`
 *
 * The card is generated from the **published** projection only: a draft hero
 * or skin is not reachable from here, so a card can never preview unpublished
 * content.
 *
 * Two distinct failure modes, two distinct answers:
 *
 * - **The identifier is not addressable** (unknown kind, unsafe slug) → `404`.
 *   The route simply does not exist for that identifier, and the body is a
 *   short plain-text note rather than an HTML error page.
 * - **The identifier is addressable but nothing published carries it** (the
 *   entry was unpublished, or the release is gone) → `200` with the generic
 *   card. A crawler still receives a valid image instead of a broken preview.
 *
 * The response is a PNG of exactly 1200×630.
 *
 * The route runs on the Node.js runtime, which is the default. That matters
 * for the renderer: `next/og` reads its bundled font from the filesystem in
 * the Node build, so the card has a real typeface even though the project
 * ships no font file of its own.
 */

/** The route parameters of the card route. */
interface OgRouteContext {
  params: Promise<{ kind: string; slug: string }>;
}

export async function GET(_request: Request, context: OgRouteContext) {
  const { kind, slug } = await context.params;
  const identifier = parseOgIdentifier(kind, slug);

  if (!identifier) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=3600",
      },
    });
  }

  const resolved = await resolveOgSubject(identifier);
  const content = resolved
    ? { ...buildOgSubjectContent(resolved.subject), imageDataUrl: resolved.imageDataUrl }
    : buildOgPageContent({
        eyebrow: "MLBB Showcase",
        title: OG_FALLBACK_TITLE,
        subtitle: OG_FALLBACK_SUBTITLE,
      });

  return renderOgCard(content);
}
