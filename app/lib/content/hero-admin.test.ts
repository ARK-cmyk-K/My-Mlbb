import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeroAdminService } from "./hero-admin.ts";
import { createInMemoryContentService } from "./in-memory-service.ts";
import type {
  InMemoryActor,
  InMemoryServiceOptions,
} from "./in-memory-service.ts";

/**
 * Hero workflow tests (task 03-01).
 *
 * `createHeroAdminService` is the exact orchestration the Server Actions use —
 * parsing, authorization delegation and error serialization. Running it against
 * `createInMemoryContentService` covers the acceptance criteria that matter here
 * (server-side validation and fail-closed authorization) without a database,
 * while live RLS stays tracked as unverified in PROJECT_STATE.md.
 */

const ADMIN: InMemoryActor = { authenticated: true, admin: true, configured: true };
const SIGNED_OUT: InMemoryActor = {
  authenticated: false,
  admin: false,
  configured: true,
};
const NON_ADMIN: InMemoryActor = {
  authenticated: true,
  admin: false,
  configured: true,
};
const UNCONFIGURED: InMemoryActor = {
  authenticated: true,
  admin: true,
  configured: false,
};

function heroForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "Layla");
  form.set("slug", "layla");
  form.set("primaryRole", "marksman");
  form.set("masteryLevel", "40");
  form.set("totalMatches", "900");
  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }
  return form;
}

function serviceWith(
  actor: InMemoryActor,
  seed?: InMemoryServiceOptions["seed"]
) {
  return createHeroAdminService(createInMemoryContentService({ actor, seed }));
}

test("create writes a draft hero for the configured admin", async () => {
  const outcome = await serviceWith(ADMIN).create(heroForm({ isSignature: "on" }));
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.hero?.name, "Layla");
    assert.equal(outcome.hero?.publicationState, "draft");
    assert.equal(outcome.hero?.isSignature, true);
  }
});

test("create rejects invalid input with field issues and does not write", async () => {
  const outcome = await serviceWith(ADMIN).create(heroForm({ name: "", winRate: "150" }));
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    const paths = (outcome.state.issues ?? []).map((issue) => issue.path);
    assert.ok(paths.includes("name"));
    assert.ok(paths.includes("winRate"));
    assert.ok(outcome.state.error);
  }
});

test("create surfaces a duplicate slug as a typed conflict, not a database error", async () => {
  const outcome = await serviceWith(ADMIN, {
    heroes: [{ id: "hero-0001", name: "Layla", slug: "layla" }],
  }).create(heroForm({ slug: "layla" }));
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.match(outcome.state.error ?? "", /already in use/i);
  }
});

test("mutations fail closed for a signed-out caller", async () => {
  const create = await serviceWith(SIGNED_OUT).create(heroForm());
  assert.equal(create.ok, false);
  if (!create.ok) {
    assert.match(create.state.error ?? "", /sign in/i);
  }

  const remove = await serviceWith(SIGNED_OUT).remove(
    formId("3f2504e0-4f89-41d3-9a0c-0305e82c3301")
  );
  assert.equal(remove.ok, false);
});

test("mutations fail closed for a non-admin session", async () => {
  const create = await serviceWith(NON_ADMIN).create(heroForm());
  assert.equal(create.ok, false);
  if (!create.ok) {
    assert.match(create.state.error ?? "", /not authorized/i);
  }

  const transition = await serviceWith(NON_ADMIN).transition(
    formTransition("3f2504e0-4f89-41d3-9a0c-0305e82c3301", "archive")
  );
  assert.equal(transition.ok, false);
  if (!transition.ok) {
    assert.match(transition.state.error ?? "", /not authorized/i);
  }
});

test("mutations report an unconfigured content store", async () => {
  const outcome = await serviceWith(UNCONFIGURED).create(heroForm());
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.match(outcome.state.error ?? "", /not configured/i);
  }
});

test("update requires an id and validates the payload", async () => {
  const seeded = createInMemoryContentService({
    actor: ADMIN,
    seed: { heroes: [{ id: "hero-0001", name: "Layla", slug: "layla" }] },
  });
  const bind = createHeroAdminService(seeded);

  const noId = await bind.update(heroForm());
  assert.equal(noId.ok, false);
  if (!noId.ok) {
    assert.match(noId.state.error ?? "", /could not be identified/i);
  }

  const invalid = await bind.update(formId("hero-0001", { name: "" }));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok((invalid.state.issues ?? []).some((issue) => issue.path === "name"));
  }

  const updated = await bind.update(formId("hero-0001", { name: "Layla Prime" }));
  assert.equal(updated.ok, true);
  if (updated.ok) {
    assert.equal(updated.hero?.name, "Layla Prime");
  }
});

test("delete removes the hero and reports a missing target", async () => {
  const bind = serviceWith(ADMIN, {
    heroes: [{ id: "hero-0001", name: "Layla", slug: "layla" }],
  });

  const deleted = await bind.remove(formId("hero-0001"));
  assert.equal(deleted.ok, true);

  const again = await bind.remove(formId("hero-0001"));
  assert.equal(again.ok, false);
  if (!again.ok) {
    assert.match(again.state.error ?? "", /no record exists/i);
  }

  const noId = await bind.remove(new FormData());
  assert.equal(noId.ok, false);
});

test("transition applies legal moves and rejects illegal ones", async () => {
  const bind = serviceWith(ADMIN, {
    heroes: [{ id: "hero-0001", name: "Layla", slug: "layla" }],
  });

  const archived = await bind.transition(formTransition("hero-0001", "archive"));
  assert.equal(archived.ok, true);

  const illegal = await bind.transition(formTransition("hero-0001", "publish"));
  assert.equal(illegal.ok, false);
  if (!illegal.ok) {
    assert.match(illegal.state.error ?? "", /cannot publish/i);
  }

  const restored = await bind.transition(formTransition("hero-0001", "restore"));
  assert.equal(restored.ok, true);

  const unsupported = await bind.transition(formTransition("hero-0001", "explode"));
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.match(unsupported.state.error ?? "", /not supported/i);
  }
});

function formId(id: string, extra: Record<string, string> = {}): FormData {
  const form = heroForm(extra);
  form.set("id", id);
  return form;
}

function formTransition(id: string, transition: string): FormData {
  const form = new FormData();
  form.set("id", id);
  form.set("transition", transition);
  return form;
}
