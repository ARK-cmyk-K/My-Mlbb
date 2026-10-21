# Social preview cards (task 06-02)

This document records how the Open Graph / Twitter preview cards are produced,
what they are allowed to show, and the runtime and deployment constraints that
come with them.

## What exists

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `app/(public)/opengraph-image.tsx` | Homepage card (file convention) |
| `/collection` | `app/(public)/collection/opengraph-image.tsx` | Collection card (file convention) |
| `/api/og/<kind>/<slug>` | `app/api/og/[kind]/[slug]/route.ts` | Card for one published hero or skin |

Every card is a **PNG of exactly 1200 × 630** (`image/png`), which is the size
Open Graph and Twitter both expect for a `summary_large_image` card.

There is deliberately **no** card for `/admin/**` or `/login`: the dashboard is
`noindex, nofollow` and a private utility page has no business being previewed
on a social network.

## The renderer: `next/og`, not a new dependency

The cards are rendered with `next/og`, which is Next.js' own build of
`@vercel/og` (satori + resvg). It is bundled with the framework
(`node_modules/next/dist/server/og/image-response.js` → the compiled
`@vercel/og`), so the project takes on **no new npm dependency** for the
feature. `next/og` and `@vercel/og` produce identical output; the difference is
only who ships the code.

The shared card layout lives in `app/components/og/og-card.tsx` and the rules
live in `app/lib/og/og-model.ts` (pure) and `app/lib/og/og-service.ts`
(server-only).

### Runtime constraint: Node.js

The card routes run on the **Node.js runtime** (the default). This is not a
preference, it is a requirement of the renderer:

* The Node build of `@vercel/og` reads its bundled font from the filesystem at
  module load:
  `node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf`.
* The Edge build embeds the same font, but the Edge runtime has no `fs`, and
  App Router metadata routes are rejected at compile time under Cache
  Components anyway (the framework guards this in
  `next/dist/server/og/image-response.js`).

Do **not** add `export const runtime = "edge"` to these routes: the build fails
with *"Route segment config 'runtime' is not compatible with
`nextConfig.cacheComponents`"*.

### Font constraint

Only **one** weight is available: the bundled `Geist-Regular.ttf` (weight 400,
normal). Consequences:

* The card must not rely on a bold face — `fontWeight: 600` is not a separate
  font file, it resolves to the regular one.
* The site fonts (`Chakra_Petch`, `Inter`, loaded through `next/font/google`)
  are **not** available to the renderer. `next/font` self-hosts them for the
  app, but the card renderer does not read the app's font pipeline. Shipping
  the card in the site's own typeface would mean adding font files to the
  repository and passing them to `ImageResponse` — deliberately not done here,
  because it would add binary assets and a deployment-size dependency for a
  cosmetic difference.

### Image constraint: the artwork is fetched, inlined, and optional

The published artwork is served from the **public** Supabase Storage bucket
(`showcase-public`). The card therefore:

1. reads the media id from the published entry,
2. looks the row up in the `published_media` view (which only contains rows
   with `publication_state = 'published'`),
3. builds the public object URL **only** when the bucket is `showcase-public`
   *and* the object path matches the storage policy's
   `<kind>/<uuid>.<ext>` pattern (`app/lib/media/upload-policy.ts`),
4. downloads the object with a 3 s timeout, accepts it only when the
   `content-type` is an image and the body is at most 2 MiB, and inlines it as
   a data URL.

Anything that fails on that path yields `null`, and the card falls back to the
typographic layout (initials on a plain panel). The renderer cannot report a
failed image — it either draws it or throws — so the "can I use this image?"
decision has to be made *before* the card is built. That is the safe fallback.

**A draft (private) object can never reach a card**: step 3 rejects every
bucket other than `showcase-public`, and step 2 only returns published rows.

## Published content only

Nothing in the card path can read a draft:

* the entry itself comes from `contentService.getPublishedRelease()`, which
  reads `published_heroes` / `published_skins` with the anon key;
* the artwork comes from the `published_media` view;
* the cards carry no identifier of a draft row, because there is no code path
  from a draft row to a card.

## Identifier validation

A card is addressed by `<kind>/<slug>`:

* `kind` must be `hero` or `skin` — the two public entry kinds;
* `slug` must match `^[a-z0-9][a-z0-9-]*$` and be at most 80 characters;
* both are trimmed and lower-cased before they are checked.

Anything else is **not addressable**:

| Request | Result |
| --- | --- |
| `/api/og/hero/ling` | `200` — PNG card for the published hero (or the generic card when nothing is published) |
| `/api/og/hero/BAD!SLUG` | `404` — plain text, no image |
| `/api/og/achievement/ling` | `404` — unknown kind |
| `/api/og/hero/..%2F..%2Fetc` | `404` — unsafe slug |
| `/api/og/hero/known-but-unpublished-slug` | `200` — the generic card |

The distinction between the last two rows matters: an **invalid identifier**
means "this route does not exist" (`404`), while a **valid identifier with no
published entry** means "the entry was unpublished" — the crawler still gets a
valid image (`200`) instead of a broken preview.

## Canonical URL strategy

| Page | Canonical | Preview image |
| --- | --- | --- |
| `/` | `http://<site>/` | the homepage card |
| `/collection` | `http://<site>/collection` | the collection card |
| `/collection?view=skins&q=abyss` | `http://<site>/collection` | the collection card |
| `/admin/**`, `/login` | none (`noindex, nofollow`) | none |

The explorer is **one page** that shows the whole published collection; the
query string only narrows what is on screen. A filtered URL therefore shows
the same content as `/collection` and canonicalises to it — the same treatment
a storefront gives a filtered listing. Filtered URLs stay fully usable and
shareable (task `05-06` builds the share links on top of them); they simply do
not claim canonical status.

The canonical URL and the absolute preview-image URLs are both built from
`NEXT_PUBLIC_SITE_URL`.

## Deployment constraints

* `NEXT_PUBLIC_SITE_URL` **must** be set in production (e.g.
  `https://showcase.example.com`). It is the base for the canonical URL, the
  `og:url` and the absolute `og:image` URL. Without it the app falls back to
  `http://localhost:3000`, which is correct for local development and wrong
  for a real deployment — crawlers would be pointed at `localhost`.
* `NEXT_PUBLIC_SITE_URL` is a **public** variable; it ships to the browser.
  Never put anything secret in it.
* The cards are cached at the edge for one hour
  (`s-maxage=3600, stale-while-revalidate=86400`). A publish therefore shows up
  in a preview within an hour even if the underlying data cache is refreshed
  sooner.
* The card routes are **dynamic** (`ƒ` in the build output), because they call
  `connection()`: a card that was frozen into the build output would keep
  showing the previous release until the next deploy. The response is still
  edge-cached, so this costs a render per cache window, not per request.
* The renderer needs the `next/dist/compiled/@vercel/og` assets (the font and
  `resvg.wasm`). Next's output tracing includes them; on Vercel they ship with
  the serverless bundle automatically. A self-hosted deployment must not prune
  `node_modules/next/dist/compiled`.
* The artwork download happens **inside** the card request. On a serverless
  platform that means the function's execution time includes the download
  (bounded by the 3 s timeout). The artwork is optional by design, so a slow
  or unreachable storage bucket degrades the card instead of failing it.
* Nothing in the card path needs the Supabase **service role** key. The anon
  key is enough: the published projection and the public bucket are readable
  by anyone.

## What was verified

Run locally against a production build (`npm run build && npm run start`):

* `/` and `/collection` emit `<link rel="canonical">`, `og:title`,
  `og:description`, `og:url`, `og:image`, `og:image:type=image/png`,
  `og:image:width=1200`, `og:image:height=630`, `og:image:alt`, plus the
  matching `twitter:*` tags and `twitter:card=summary_large_image`.
* `/api/og/hero/ling`, `/api/og/skin/abyss-legend`,
  `/opengraph-image-<hash>` and `/collection/opengraph-image-<hash>` all
  return `200`, `Content-Type: image/png`, and a PNG whose IHDR chunk reports
  `1200 × 630`.
* `/api/og/hero/bad!slug`, `/api/og/achievement/ling` and
  `/api/og/hero/..%2F..%2Fetc` return `404`.
* The rendered card contains anti-aliased text (494 distinct sampled colours,
  with the expected eyebrow / title / subtitle / footer bands and the
  initials panel), so the renderer really drew the layout.

**Not verified here** (needs a human with a browser): the visual quality of
the card in a real chat client, and the exact glyph rendering of the bundled
Geist face. The card is byte-verified, not eyeballed.
