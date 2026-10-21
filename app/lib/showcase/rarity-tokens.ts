import type { SkinRarity } from "../content/validation.ts";
import { formatEnumLabel } from "./showcase-model.ts";

/**
 * Rarity presentation tokens (task 05-03).
 *
 * Every skin badge in the showcase resolves through this map so the same
 * rarity always looks the same. Classes reference *only* the semantic tokens
 * from `app/globals.css` (`accent-gold`, `accent-purple`, `accent-blue`,
 * `accent-emerald`, `secondary`, surface/border/text) — no hard-coded colors —
 * so both themes stay correct.
 *
 * The visual order follows prestige: Collector (gold) → Legend (amber) →
 * Epic (purple) → Starlight (blue) → Special (emerald) → Elite/Basic (neutral).
 */
export interface RarityToken {
  rarity: SkinRarity;
  label: string;
  /** Border + background + text classes for the badge. */
  chipClass: string;
}

const NEUTRAL_CHIP = "border-border bg-surface text-muted";

export const RARITY_TOKENS: Record<SkinRarity, RarityToken> = {
  collector: {
    rarity: "collector",
    label: formatEnumLabel("collector"),
    chipClass: "border-accent-gold/50 bg-accent-gold-soft text-accent-gold-text",
  },
  legend: {
    rarity: "legend",
    label: formatEnumLabel("legend"),
    chipClass: "border-secondary/50 bg-secondary-soft text-secondary",
  },
  epic: {
    rarity: "epic",
    label: formatEnumLabel("epic"),
    chipClass:
      "border-accent-purple/50 bg-accent-purple-soft text-accent-purple-text",
  },
  starlight: {
    rarity: "starlight",
    label: formatEnumLabel("starlight"),
    chipClass:
      "border-accent-blue/50 bg-accent-blue-soft text-accent-blue-text",
  },
  special: {
    rarity: "special",
    label: formatEnumLabel("special"),
    chipClass:
      "border-accent-emerald/50 bg-accent-emerald-soft text-accent-emerald-text",
  },
  elite: {
    rarity: "elite",
    label: formatEnumLabel("elite"),
    chipClass: "border-border-strong/70 bg-surface-raised text-foreground",
  },
  basic: {
    rarity: "basic",
    label: formatEnumLabel("basic"),
    chipClass: NEUTRAL_CHIP,
  },
};

/**
 * Looks up the token for a rarity, falling back to a neutral badge for an
 * unknown value instead of rendering nothing (and without trusting
 * `Object.prototype` keys such as `"constructor"`).
 */
export function rarityToken(rarity: SkinRarity | string): RarityToken {
  if (Object.prototype.hasOwnProperty.call(RARITY_TOKENS, rarity)) {
    return RARITY_TOKENS[rarity as SkinRarity];
  }
  return {
    rarity: rarity as SkinRarity,
    label: formatEnumLabel(rarity),
    chipClass: NEUTRAL_CHIP,
  };
}
