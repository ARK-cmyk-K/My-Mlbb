import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COLLECTION_PATH,
  DISCORD_SHARE_TARGET,
  SHARE_TEXT_MAX_LENGTH,
  buildEntryExplorerPath,
  buildEntryShareUrl,
  buildShareContent,
  buildShareIntent,
  buildShareText,
  buildShareTitle,
  canShareNatively,
  normalizeOrigin,
  resolveShareOrigin,
  truncateShareText,
  type ShareSubject,
} from "./share-model.ts";

/**
 * Sharing model tests (task 05-06).
 *
 * The contract under test:
 *
 * - a shared link always points at the **public** collection explorer filtered
 *   to the entry, using the slug (so a rename does not break the link) and the
 *   explorer's own URL parameters (so the server renders the same result);
 * - the text is bounded and never contains an internal identifier;
 * - every third-party URL is properly encoded;
 * - a misconfigured origin is rejected rather than silently used.
 */

const hero: ShareSubject = {
  kind: "hero",
  id: "hero-1",
  name: "Miya",
  slug: "miya",
  context: "Marksman",
};

const skin: ShareSubject = {
  kind: "skin",
  id: "skin-1",
  name: "Abyss Legend",
  slug: "abyss-legend",
  context: "Collector skin",
};

test("the canonical URL points at the public explorer filtered to the entry", () => {
  assert.equal(
    buildEntryShareUrl("https://example.com", hero),
    "https://example.com/collection?view=heroes&q=miya"
  );
  assert.equal(
    buildEntryShareUrl("https://example.com", skin),
    "https://example.com/collection?view=skins&q=abyss-legend"
  );
});

test("the relative explorer path is the canonical URL without the origin", () => {
  assert.equal(COLLECTION_PATH, "/collection");
  assert.equal(
    buildEntryExplorerPath(skin),
    "/collection?view=skins&q=abyss-legend"
  );
  assert.equal(
    buildEntryExplorerPath(hero),
    `${COLLECTION_PATH}?view=heroes&q=miya`
  );
});

test("a trailing slash on the origin does not double up", () => {
  assert.equal(
    buildEntryShareUrl("https://example.com/", skin),
    "https://example.com/collection?view=skins&q=abyss-legend"
  );
});

test("slugs are URL-encoded", () => {
  const odd: ShareSubject = {
    kind: "skin",
    id: "skin-2",
    name: "Odd & Charmed",
    slug: "odd & charmed/plus",
  };
  const url = buildEntryShareUrl("https://example.com", odd);
  assert.ok(url.includes("q=odd+%26+charmed%2Fplus"));
  // The URL must round-trip through a parser.
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("q"), "odd & charmed/plus");
  assert.equal(parsed.searchParams.get("view"), "skins");
});

test("the shared text names the entry and its public context", () => {
  assert.equal(
    buildShareText(hero),
    "Check out Miya (Marksman) in the MLBB Showcase."
  );
  assert.equal(
    buildShareText(skin),
    "Check out Abyss Legend (Collector skin) in the MLBB Showcase."
  );
});

test("the shared text never contains the internal id", () => {
  const text = buildShareText(skin);
  assert.ok(!text.includes(skin.id));
});

test("the shared text is bounded", () => {
  const long: ShareSubject = {
    kind: "hero",
    id: "hero-2",
    name: "x".repeat(400),
    slug: "x",
  };
  const text = buildShareText(long);
  assert.ok(text.length <= SHARE_TEXT_MAX_LENGTH);
  assert.ok(text.endsWith("…"));
});

test("truncation prefers a word boundary", () => {
  const value = "alpha beta gamma delta epsilon";
  const truncated = truncateShareText(value, 16);
  assert.ok(truncated.length <= 17);
  assert.ok(truncated.startsWith("alpha beta"));
  assert.ok(!truncated.includes("gam"));
});

test("the title is the entry name, bounded", () => {
  assert.equal(buildShareTitle(hero), "Miya");
  assert.ok(buildShareTitle({ ...hero, name: "y".repeat(200) }).length <= 81);
});

test("the share content bundles title, text and canonical URL", () => {
  const content = buildShareContent("https://example.com", skin);
  assert.equal(content.title, "Abyss Legend");
  assert.equal(content.text, buildShareText(skin));
  assert.equal(content.url, buildEntryShareUrl("https://example.com", skin));
});

test("the X intent carries the encoded text and URL", () => {
  const content = buildShareContent("https://example.com", skin);
  const intent = buildShareIntent("x", content);
  assert.ok(intent);
  const parsed = new URL(intent as string);
  assert.equal(parsed.origin, "https://twitter.com");
  assert.equal(parsed.pathname, "/intent/tweet");
  assert.equal(parsed.searchParams.get("url"), content.url);
  assert.equal(parsed.searchParams.get("text"), content.text);
});

test("the Telegram intent carries the encoded text and URL", () => {
  const content = buildShareContent("https://example.com", skin);
  const intent = buildShareIntent("telegram", content);
  assert.ok(intent);
  const parsed = new URL(intent as string);
  assert.equal(parsed.origin, "https://t.me");
  assert.equal(parsed.pathname, "/share/url");
  assert.equal(parsed.searchParams.get("url"), content.url);
  assert.equal(parsed.searchParams.get("text"), content.text);
});

test("only link-based transports produce an intent URL", () => {
  const content = buildShareContent("https://example.com", skin);
  assert.equal(buildShareIntent("native" as never, content), null);
  assert.equal(buildShareIntent("discord" as never, content), null);
  assert.equal(buildShareIntent("copy" as never, content), null);
});

test("the Discord target is the user's own Discord home", () => {
  assert.equal(DISCORD_SHARE_TARGET, "https://discord.com/channels/@me");
});

test("only absolute http(s) origins are accepted", () => {
  assert.equal(normalizeOrigin("https://example.com"), "https://example.com");
  assert.equal(normalizeOrigin("https://example.com/"), "https://example.com");
  assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeOrigin("  https://example.com/app  "), "https://example.com");
  assert.equal(normalizeOrigin("javascript:alert(1)"), "");
  assert.equal(normalizeOrigin("data:text/html,x"), "");
  assert.equal(normalizeOrigin("/collection"), "");
  assert.equal(normalizeOrigin(""), "");
  assert.equal(normalizeOrigin(null), "");
  assert.equal(normalizeOrigin(undefined), "");
});

test("the configured site URL wins over the browser origin", () => {
  assert.equal(
    resolveShareOrigin("https://showcase.example.com", "https://preview.vercel.app"),
    "https://showcase.example.com"
  );
});

test("the browser origin is the fallback", () => {
  assert.equal(
    resolveShareOrigin(null, "https://preview.vercel.app"),
    "https://preview.vercel.app"
  );
  assert.equal(
    resolveShareOrigin("", "https://preview.vercel.app"),
    "https://preview.vercel.app"
  );
});

test("a misconfigured site URL falls back instead of producing a bad link", () => {
  assert.equal(
    resolveShareOrigin("not-a-url", "https://preview.vercel.app"),
    "https://preview.vercel.app"
  );
});

test("without any usable origin the share origin is empty", () => {
  assert.equal(resolveShareOrigin(null, null), "");
  assert.equal(resolveShareOrigin("", ""), "");
});

test("native sharing is only offered when the browser supports it", () => {
  assert.equal(canShareNatively(null), false);
  assert.equal(canShareNatively({}), false);
  assert.equal(canShareNatively({ share: () => undefined }), true);
  assert.equal(
    canShareNatively({ share: () => undefined, canShare: () => true }),
    true
  );
  assert.equal(
    canShareNatively({ share: () => undefined, canShare: () => false }),
    false
  );
  assert.equal(
    canShareNatively({
      share: () => undefined,
      canShare: () => {
        throw new Error("nope");
      },
    }),
    false
  );
});
