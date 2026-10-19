import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedTransitions, DRAFT_STATE_LABELS, resolveDraftTransition } from "./contracts.ts";
import { PUBLICATION_STATES } from "./validation.ts";

/**
 * Unit tests for the draft lifecycle transition table (task 02-03).
 *
 * The transition map is the single source of truth for what a draft row's
 * lifecycle marker may do; route handlers and the in-memory double both call
 * `resolveDraftTransition`, so this table is exercised indirectly as well.
 */

test("a draft row can be published or archived", () => {
  assert.equal(resolveDraftTransition("draft", "publish"), "published");
  assert.equal(resolveDraftTransition("draft", "archive"), "archived");
});

test("a published row can be unpublished or archived", () => {
  assert.equal(resolveDraftTransition("published", "unpublish"), "draft");
  assert.equal(resolveDraftTransition("published", "archive"), "archived");
});

test("an archived row can only be restored to draft", () => {
  assert.equal(resolveDraftTransition("archived", "restore"), "draft");
  // `restore` never jumps straight back to `published`.
  assert.equal(resolveDraftTransition("archived", "publish"), null);
});

test("illegal transitions return null", () => {
  const cases: Array<[Parameters<typeof resolveDraftTransition>[0], Parameters<typeof resolveDraftTransition>[1]]> = [
    ["draft", "unpublish"],
    ["draft", "restore"],
    ["published", "publish"],
    ["published", "restore"],
    ["archived", "unpublish"],
    ["archived", "archive"],
  ];

  for (const [from, transition] of cases) {
    assert.equal(
      resolveDraftTransition(from, transition),
      null,
      `${from} -> ${transition} must be illegal`
    );
  }
});

test("allowedTransitions agrees with resolveDraftTransition", () => {
  for (const state of PUBLICATION_STATES) {
    for (const transition of allowedTransitions(state)) {
      assert.notEqual(
        resolveDraftTransition(state, transition),
        null,
        `${state} -> ${transition} is listed as allowed`
      );
    }
  }

  assert.deepEqual(allowedTransitions("draft"), ["publish", "archive"]);
  assert.deepEqual(allowedTransitions("published"), ["unpublish", "archive"]);
  assert.deepEqual(allowedTransitions("archived"), ["restore"]);
});

test("every publication state has a display label", () => {
  for (const state of PUBLICATION_STATES) {
    assert.equal(typeof DRAFT_STATE_LABELS[state], "string");
    assert.ok(DRAFT_STATE_LABELS[state].length > 0);
  }
});
