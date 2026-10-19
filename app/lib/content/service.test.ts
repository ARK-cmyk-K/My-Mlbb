import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContentServiceError } from "./errors.ts";
import { isContentServiceError } from "./errors.ts";
import {
  createInMemoryContentService,
  type InMemoryActor,
  type SeedData,
} from "./in-memory-service.ts";
import type { PublishedRelease } from "./contracts.ts";
import type { HeroInput } from "./validation.ts";

/**
 * Behaviour tests for the content-service port (task 02-03).
 *
 * No Supabase project is available in this environment (see PROJECT_STATE.md
 * "Blockers and risks"), so these run against `createInMemoryContentService`,
 * which enforces the *same* validators, transition map, typed errors and
 * fail-closed admin gate as the Supabase implementation. They cover the
 * acceptance criteria: unauthorized draft reads/writes, public reads, a missing
 * release, and invalid transitions.
 *
 * Live RLS enforcement against the provider is verified manually once a hosted
 * project (or local stack) exists; that is tracked as unverified in
 * PROJECT_STATE.md.
 */

const ADMIN: InMemoryActor = {
  authenticated: true,
  admin: true,
  configured: true,
};
const NON_ADMIN: InMemoryActor = {
  authenticated: true,
  admin: false,
  configured: true,
};
const SIGNED_OUT: InMemoryActor = {
  authenticated: false,
  admin: false,
  configured: true,
};
const UNCONFIGURED: InMemoryActor = {
  authenticated: false,
  admin: false,
  configured: false,
};

function assertCode(error: unknown, code: ContentServiceError["code"]): void {
  assert.ok(isContentServiceError(error), `expected a ContentServiceError, got ${String(error)}`);
  assert.equal((error as ContentServiceError).code, code);
}

const HERO_INPUT: HeroInput = {
  name: "Gusion",
  slug: "gusion",
  primaryRole: "assassin",
  secondaryRole: null,
  specialty: null,
  portraitMediaId: null,
  masteryLevel: 0,
  totalMatches: 0,
  winRate: null,
  isSignature: false,
  isFavorite: false,
};

// ---- authorization: draft reads --------------------------------------------

test("draft reads reject an unauthenticated caller", async () => {
  const service = createInMemoryContentService({
    actor: SIGNED_OUT,
    seed: { heroes: [{ name: "Gusion", slug: "gusion" }] },
  });

  await assert.rejects(service.listDraftHeroes(), (error) =>
    (assertCode(error, "UNAUTHENTICATED"), true)
  );
});

test("draft reads reject an authenticated non-admin", async () => {
  const service = createInMemoryContentService({
    actor: NON_ADMIN,
    seed: { heroes: [{ name: "Gusion", slug: "gusion" }] },
  });

  await assert.rejects(service.listDraftHeroes(), (error) =>
    (assertCode(error, "UNAUTHORIZED"), true)
  );
  await assert.rejects(service.getDraftHero("hero-0001"), (error) =>
    (assertCode(error, "UNAUTHORIZED"), true)
  );
});

test("draft reads fail closed when Supabase is not configured", async () => {
  const service = createInMemoryContentService({ actor: UNCONFIGURED });

  await assert.rejects(service.listDraftHeroes(), (error) =>
    (assertCode(error, "NOT_CONFIGURED"), true)
  );
});

// ---- authorization: draft writes -------------------------------------------

test("draft writes reject an unauthenticated caller", async () => {
  const service = createInMemoryContentService({ actor: SIGNED_OUT });

  await assert.rejects(service.createDraftHero(HERO_INPUT), (error) =>
    (assertCode(error, "UNAUTHENTICATED"), true)
  );
});

test("draft writes reject an authenticated non-admin", async () => {
  const service = createInMemoryContentService({ actor: NON_ADMIN });

  await assert.rejects(service.createDraftHero(HERO_INPUT), (error) =>
    (assertCode(error, "UNAUTHORIZED"), true)
  );
  await assert.rejects(service.deleteDraftHero("hero-0001"), (error) =>
    (assertCode(error, "UNAUTHORIZED"), true)
  );
  await assert.rejects(
    service.transitionDraftState("heroes", "hero-0001", "publish"),
    (error) => (assertCode(error, "UNAUTHORIZED"), true)
  );
});

// ---- admin draft CRUD ------------------------------------------------------

test("an admin can create, read and update a draft hero", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });

  const created = await service.createDraftHero(HERO_INPUT);
  assert.equal(created.name, "Gusion");
  assert.equal(created.publicationState, "draft");
  assert.equal(created.archivedAt, null);

  const fetched = await service.getDraftHero(created.id);
  assert.equal(fetched.id, created.id);

  const updated = await service.updateDraftHero(created.id, {
    ...HERO_INPUT,
    masteryLevel: 10,
  });
  assert.equal(updated.masteryLevel, 10);
});

test("an admin can delete a draft hero", async () => {
  const service = createInMemoryContentService({
    actor: ADMIN,
    seed: { heroes: [{ id: "hero-1", name: "Gusion", slug: "gusion" }] },
  });

  await service.deleteDraftHero("hero-1");
  await assert.rejects(service.getDraftHero("hero-1"), (error) =>
    (assertCode(error, "NOT_FOUND"), true)
  );
});

test("reading a missing draft hero is NOT_FOUND", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });

  await assert.rejects(service.getDraftHero("nope"), (error) =>
    (assertCode(error, "NOT_FOUND"), true)
  );
});

// ---- validation ------------------------------------------------------------

test("a create with invalid input is VALIDATION_FAILED with field issues", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });

  await assert.rejects(
    service.createDraftHero({ name: "", slug: "Bad Slug", primaryRole: "wizard" } as never),
    (error) => {
      assertCode(error, "VALIDATION_FAILED");
      const issues = (error as ContentServiceError).issues;
      assert.ok(issues.some((issue) => issue.path === "name"));
      return true;
    }
  );
});

test("duplicate slugs are a CONFLICT", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });

  await service.createDraftHero(HERO_INPUT);
  await assert.rejects(service.createDraftHero(HERO_INPUT), (error) =>
    (assertCode(error, "CONFLICT"), true)
  );
});

test("a skin referencing an unknown hero is DEPENDENCY_MISSING", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });

  await assert.rejects(
    service.createDraftSkin({
      name: "Bloody Raven",
      slug: "bloody-raven",
      rarity: "epic",
      heroId: "does-not-exist",
    } as never),
    (error) => (assertCode(error, "DEPENDENCY_MISSING"), true)
  );
});

// ---- lifecycle transitions -------------------------------------------------

test("an admin can publish then unpublish a draft hero", async () => {
  const service = createInMemoryContentService({
    actor: ADMIN,
    seed: { heroes: [{ id: "hero-1", name: "Gusion", slug: "gusion" }] },
  });

  await service.transitionDraftState("heroes", "hero-1", "publish");
  let hero = await service.getDraftHero("hero-1");
  assert.equal(hero.publicationState, "published");
  assert.equal(hero.archivedAt, null);

  await service.transitionDraftState("heroes", "hero-1", "unpublish");
  hero = await service.getDraftHero("hero-1");
  assert.equal(hero.publicationState, "draft");
});

test("archiving stamps archivedAt and restore clears it", async () => {
  const service = createInMemoryContentService({
    actor: ADMIN,
    seed: { heroes: [{ id: "hero-1", name: "Gusion", slug: "gusion" }] },
  });

  await service.transitionDraftState("heroes", "hero-1", "archive");
  let hero = await service.getDraftHero("hero-1");
  assert.equal(hero.publicationState, "archived");
  assert.equal(typeof hero.archivedAt, "string");

  await service.transitionDraftState("heroes", "hero-1", "restore");
  hero = await service.getDraftHero("hero-1");
  assert.equal(hero.publicationState, "draft");
  assert.equal(hero.archivedAt, null);
});

test("an illegal transition is INVALID_TRANSITION", async () => {
  const service = createInMemoryContentService({
    actor: ADMIN,
    seed: { heroes: [{ id: "hero-1", name: "Gusion", slug: "gusion" }] },
  });

  // A draft row cannot be unpublished, and cannot be restored.
  await assert.rejects(
    service.transitionDraftState("heroes", "hero-1", "unpublish"),
    (error) => (assertCode(error, "INVALID_TRANSITION"), true)
  );
  await assert.rejects(
    service.transitionDraftState("heroes", "hero-1", "restore"),
    (error) => (assertCode(error, "INVALID_TRANSITION"), true)
  );
});

test("transitioning a missing row is NOT_FOUND", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });

  await assert.rejects(
    service.transitionDraftState("heroes", "nope", "publish"),
    (error) => (assertCode(error, "NOT_FOUND"), true)
  );
});

// ---- list filtering --------------------------------------------------------

test("draft lists exclude archived rows by default", async () => {
  const service = createInMemoryContentService({
    actor: ADMIN,
    seed: {
      heroes: [
        { id: "hero-1", name: "A", slug: "a", publicationState: "archived" },
        { id: "hero-2", name: "B", slug: "b", publicationState: "draft" },
      ],
    },
  });

  const visible = await service.listDraftHeroes();
  assert.deepEqual(visible.map((hero) => hero.id), ["hero-2"]);

  const all = await service.listDraftHeroes({ includeArchived: true });
  assert.deepEqual(all.map((hero) => hero.id).sort(), ["hero-1", "hero-2"]);

  const archivedOnly = await service.listDraftHeroes({ state: "archived" });
  assert.deepEqual(archivedOnly.map((hero) => hero.id), ["hero-1"]);
});

test("skins can be scoped to a hero", async () => {
  const service = createInMemoryContentService({
    actor: ADMIN,
    seed: {
      heroes: [{ id: "hero-1", name: "A", slug: "a" }],
      skins: [
        { id: "skin-1", name: "S1", slug: "s1", heroId: "hero-1" },
        { id: "skin-2", name: "S2", slug: "s2", heroId: null },
      ],
    },
  });

  const scoped = await service.listDraftSkins({ heroId: "hero-1" });
  assert.deepEqual(scoped.map((skin) => skin.id), ["skin-1"]);
});

// ---- public reads ----------------------------------------------------------

const PUBLISHED: PublishedRelease = {
  release: {
    id: "release-1",
    name: "Season 1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  heroes: [
    {
      id: "pub-hero-1",
      releaseId: "release-1",
      name: "Gusion",
      slug: "gusion",
      primaryRole: "assassin",
      secondaryRole: null,
      specialty: null,
      portraitMediaId: null,
      masteryLevel: 0,
      totalMatches: 0,
      winRate: null,
      isSignature: false,
      isFavorite: false,
      publishedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  skins: [],
  achievements: [],
  timelineEntries: [],
};

test("public reads work without any session", async () => {
  const service = createInMemoryContentService({
    actor: SIGNED_OUT,
    seed: { publishedRelease: PUBLISHED },
  });

  const release = await service.getActiveRelease();
  assert.equal(release?.id, "release-1");

  const snapshot = await service.getPublishedRelease();
  assert.equal(snapshot.release.name, "Season 1");
  assert.deepEqual(snapshot.heroes.map((hero) => hero.slug), ["gusion"]);
});

test("public reads fail closed when Supabase is not configured", async () => {
  const service = createInMemoryContentService({
    actor: UNCONFIGURED,
    seed: { publishedRelease: PUBLISHED },
  });

  await assert.rejects(service.getActiveRelease(), (error) =>
    (assertCode(error, "NOT_CONFIGURED"), true)
  );
  await assert.rejects(service.getPublishedRelease(), (error) =>
    (assertCode(error, "NOT_CONFIGURED"), true)
  );
});

// ---- missing release -------------------------------------------------------

test("getActiveRelease returns null when nothing is published", async () => {
  const service = createInMemoryContentService({ actor: SIGNED_OUT });

  assert.equal(await service.getActiveRelease(), null);
});

test("getPublishedRelease is NO_PUBLISHED_RELEASE when nothing is published", async () => {
  const service = createInMemoryContentService({ actor: SIGNED_OUT });

  await assert.rejects(service.getPublishedRelease(), (error) =>
    (assertCode(error, "NO_PUBLISHED_RELEASE"), true)
  );
});

// ---- isolation -------------------------------------------------------------

test("each in-memory service instance is isolated", async () => {
  const first = createInMemoryContentService({ actor: ADMIN });
  const second = createInMemoryContentService({ actor: ADMIN });

  await first.createDraftHero(HERO_INPUT);

  const firstHeroes = await first.listDraftHeroes();
  const secondHeroes = await second.listDraftHeroes();

  assert.equal(firstHeroes.length, 1);
  assert.equal(secondHeroes.length, 0);
});

// Keep the unused import (`SeedData`) meaningful for readers of the double.
test("SeedData is re-exported for test authors", () => {
  const seed: SeedData = { heroes: [{ name: "X", slug: "x" }] };
  assert.equal(seed.heroes?.length, 1);
});
