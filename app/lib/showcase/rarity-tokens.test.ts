import assert from "node:assert/strict";
import { test } from "node:test";

import { rarityLabel } from "../content/skin-form.ts";
import { SKIN_RARITIES } from "../content/validation.ts";
import { RARITY_TOKENS, rarityToken } from "./rarity-tokens.ts";

/**
 * Rarity token tests (task 05-03). Every rarity must resolve to a labelled badge
 * built from theme tokens (never a raw color), and every label must stay in sync
 * with the dashboard's `rarityLabel()` so the admin and public site agree.
 */

test("every rarity has a labelled badge", () => {
  for (const rarity of SKIN_RARITIES) {
    const token = RARITY_TOKENS[rarity];
    assert.equal(token.rarity, rarity);
    assert.equal(token.label, rarityLabel(rarity));
    assert.ok(token.chipClass.length > 0, `${rarity} needs badge classes`);
    assert.ok(
      !/#[0-9a-f]{3,8}/i.test(token.chipClass) &&
        !token.chipClass.includes("rgb"),
      `${rarity} must use semantic tokens, not raw colors`
    );
    assert.match(token.chipClass, /\b(?:border|bg|text)-/);
  }
});

test("rarity badges use distinct token families", () => {
  const classes = SKIN_RARITIES.map((rarity) => RARITY_TOKENS[rarity].chipClass);
  assert.equal(new Set(classes).size, classes.length);
});

test("unknown rarities fall back to a neutral labelled badge", () => {
  const token = rarityToken("mythic");
  assert.equal(token.label, "Mythic");
  assert.equal(token.chipClass, "border-border bg-surface text-muted");
});

test("prototype keys never resolve as a rarity token", () => {
  const token = rarityToken("constructor");
  assert.equal(token.label, "Constructor");
  assert.equal(token.chipClass, "border-border bg-surface text-muted");
});
