import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OG_EYEBROW_MAX_LENGTH,
  OG_FALLBACK_SUBTITLE,
  OG_FALLBACK_TITLE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  OG_SLUG_MAX_LENGTH,
  OG_SUBJECT_KINDS,
  OG_SUBTITLE_MAX_LENGTH,
  OG_TITLE_MAX_LENGTH,
  buildOgPageContent,
  buildOgSubjectContent,
  buildPublicMediaUrl,
  normalizeSiteOrigin,
  parseOgIdentifier,
  resolveSiteOrigin,
  truncateOgText,
} from "./og-model.ts";

/**
 * Social preview card model tests (task `06-02`).
 *
 * The contract under test:
 *
 * - a route identifier is either a valid public `<kind>/<slug>` pair or it is
 *   rejected outright — nothing in between reaches the renderer;
 * - every string that ends up on a card is bounded, so a long display name
 *   cannot break the layout;
 * - the artwork URL is only produced for a *public* media object whose path
 *   matches the storage policy, so a private object can never be embedded;
 * - the canonical site origin is either an absolute `http(s)` URL or empty —
 *   never a partial or relative value.
 */

test("a public identifier is accepted", () => {
  assert.deepEqual(parseOgIdentifier("hero", "miya"), {
    kind: "hero",
    slug: "miya",
  });
  assert.deepEqual(parseOgIdentifier("skin", "abyss-legend"), {
    kind: "skin",
    slug: "abyss-legend",
  });
});

test("the identifier is normalised before it is accepted", () => {
  assert.deepEqual(parseOgIdentifier("HERO", " Miya "), {
    kind: "hero",
    slug: "miya",
  });
});

test("an unknown kind is rejected", () => {
  for (const kind of ["achievement", "timeline", "admin", "heroes", ""]) {
    assert.equal(parseOgIdentifier(kind, "miya"), null);
  }
  assert.deepEqual(OG_SUBJECT_KINDS, ["hero", "skin"]);
});

test("a non-string identifier is rejected", () => {
  assert.equal(parseOgIdentifier(null, "miya"), null);
  assert.equal(parseOgIdentifier("hero", null), null);
  assert.equal(parseOgIdentifier(42, 42), null);
  assert.equal(parseOgIdentifier(undefined, undefined), null);
});

test("an unsafe slug is rejected", () => {
  const unsafe = [
    "",
    "   ",
    "../etc/passwd",
    "a/b",
    "miya?x=1",
    "miya#frag",
    "mi ya",
    "miya%2F",
    "miya.png",
    "-miya",
    "miya_",
    "mıya",
    "miya;drop",
  ];
  for (const slug of unsafe) {
    assert.equal(
      parseOgIdentifier("hero", slug),
      null,
      `expected "${slug}" to be rejected`
    );
  }
});

test("an over-long slug is rejected", () => {
  const long = "a".repeat(OG_SLUG_MAX_LENGTH + 1);
  assert.equal(parseOgIdentifier("hero", long), null);
  assert.deepEqual(parseOgIdentifier("hero", "a".repeat(OG_SLUG_MAX_LENGTH)), {
    kind: "hero",
    slug: "a".repeat(OG_SLUG_MAX_LENGTH),
  });
});

test("text is bounded and never exceeds the limit", () => {
  assert.equal(truncateOgText("Miya", 80), "Miya");
  assert.equal(truncateOgText("  Miya  ", 80), "Miya");

  const truncated = truncateOgText("a".repeat(200), 10);
  assert.ok(truncated.length <= 10, `length was ${truncated.length}`);
  assert.ok(truncated.endsWith("…"));
});

test("truncation keeps a word boundary when there is one", () => {
  const truncated = truncateOgText("Marksman Assassin Fighter", 18);
  assert.ok(truncated.length <= 18);
  assert.ok(!truncated.includes("  "));
});

test("a degenerate limit still returns a single character", () => {
  assert.equal(truncateOgText("Miya", 1).length, 1);
});

test("the subject card carries the entry name and context", () => {
  const content = buildOgSubjectContent({
    kind: "hero",
    name: "Miya",
    slug: "miya",
    context: "Marksman",
  });
  assert.equal(content.eyebrow, "Hero");
  assert.equal(content.title, "Miya");
  assert.equal(content.subtitle, "Marksman");
  assert.equal(content.imageDataUrl, null);
});

test("the subject card falls back when there is no context", () => {
  const content = buildOgSubjectContent({
    kind: "skin",
    name: "Abyss Legend",
    slug: "abyss-legend",
    context: null,
  });
  assert.equal(content.eyebrow, "Skin");
  assert.equal(content.subtitle, OG_FALLBACK_SUBTITLE);
});

test("the subject card bounds a long name and context", () => {
  const content = buildOgSubjectContent({
    kind: "hero",
    name: "n".repeat(400),
    slug: "long",
    context: "c".repeat(400),
  });
  assert.ok(content.title.length <= OG_TITLE_MAX_LENGTH);
  assert.ok(content.subtitle.length <= OG_SUBTITLE_MAX_LENGTH);
});

test("the page card falls back when the title is empty", () => {
  const content = buildOgPageContent({
    eyebrow: "Collection",
    title: "   ",
    subtitle: "",
  });
  assert.equal(content.title, OG_FALLBACK_TITLE);
  assert.equal(content.subtitle, OG_FALLBACK_SUBTITLE);
});

test("the page card bounds every field", () => {
  const content = buildOgPageContent({
    eyebrow: "e".repeat(200),
    title: "t".repeat(200),
    subtitle: "s".repeat(200),
  });
  assert.ok(content.eyebrow.length <= OG_EYEBROW_MAX_LENGTH);
  assert.ok(content.title.length <= OG_TITLE_MAX_LENGTH);
  assert.ok(content.subtitle.length <= OG_SUBTITLE_MAX_LENGTH);
});

test("a public media object gets a public URL", () => {
  const objectPath = "portrait/11111111-1111-1111-1111-111111111111.png";
  assert.equal(
    buildPublicMediaUrl(
      "https://abc.supabase.co",
      objectPath,
      "showcase-public"
    ),
    `https://abc.supabase.co/storage/v1/object/public/showcase-public/${objectPath}`
  );
});

test("a private media object never gets a URL", () => {
  const objectPath = "portrait/11111111-1111-1111-1111-111111111111.png";
  assert.equal(
    buildPublicMediaUrl("https://abc.supabase.co", objectPath, "showcase-draft"),
    null
  );
  assert.equal(
    buildPublicMediaUrl("https://abc.supabase.co", objectPath, null),
    null
  );
});

test("an unsafe media path never gets a URL", () => {
  assert.equal(
    buildPublicMediaUrl(
      "https://abc.supabase.co",
      "../../etc/passwd",
      "showcase-public"
    ),
    null
  );
  assert.equal(
    buildPublicMediaUrl(
      "https://abc.supabase.co",
      "portrait/not-a-uuid.png",
      "showcase-public"
    ),
    null
  );
});

test("a non-http origin never gets a URL", () => {
  const objectPath = "portrait/11111111-1111-1111-1111-111111111111.png";
  assert.equal(
    buildPublicMediaUrl("javascript:alert(1)", objectPath, "showcase-public"),
    null
  );
  assert.equal(
    buildPublicMediaUrl("not-a-url", objectPath, "showcase-public"),
    null
  );
  assert.equal(
    buildPublicMediaUrl("", objectPath, "showcase-public"),
    null
  );
  assert.equal(
    buildPublicMediaUrl(null, objectPath, "showcase-public"),
    null
  );
});

test("the site origin is normalised to scheme and host", () => {
  assert.equal(
    normalizeSiteOrigin("https://showcase.example.com/path?x=1"),
    "https://showcase.example.com"
  );
  assert.equal(
    normalizeSiteOrigin("https://showcase.example.com:8443/"),
    "https://showcase.example.com:8443"
  );
  assert.equal(normalizeSiteOrigin(""), "");
  assert.equal(normalizeSiteOrigin(null), "");
  assert.equal(normalizeSiteOrigin("showcase.example.com"), "");
  assert.equal(normalizeSiteOrigin("ftp://showcase.example.com"), "");
});

test("the configured site origin wins over the fallback", () => {
  assert.equal(
    resolveSiteOrigin("https://showcase.example.com", "http://localhost:3000"),
    "https://showcase.example.com"
  );
  assert.equal(
    resolveSiteOrigin("", "http://localhost:3000"),
    "http://localhost:3000"
  );
  assert.equal(
    resolveSiteOrigin("   ", "http://localhost:3000"),
    "http://localhost:3000"
  );
  assert.equal(resolveSiteOrigin("nonsense", "nonsense"), "");
});

test("the card size is the Open Graph standard", () => {
  assert.equal(OG_IMAGE_WIDTH, 1200);
  assert.equal(OG_IMAGE_HEIGHT, 630);
});
