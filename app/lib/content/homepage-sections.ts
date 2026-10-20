import type { DraftHomepageSection, PublishedHomepageSection } from "./contracts.ts";
/**
 * The approved homepage module catalog and the pure layout composer (task
 * `04-02`).
 *
 * Two hard rules live here, and both sides of the app depend on this file:
 *
 *   1. **Allowlist.** The dashboard may only reorder/enable the five modules
 *      seeded into `public.homepage_sections` by the `01-03` migration. A
 *      section id is *data*, never a component name, a module specifier or a
 *      snippet: nothing in this module evaluates, imports or renders a value
 *      that came from the database. `validateHomepageSectionOrder` rejects any
 *      id that is not in {@link APPROVED_HOMEPAGE_SECTION_IDS}, and
 *      {@link composeHomepageLayout} filters again before the public page
 *      renders — defense in depth on both the write and the read path.
 *
 *   2. **Published-only composition.** {@link composeHomepageLayout} takes the
 *      *published* configuration (from `getPublishedHomepageSections()`, i.e.
 *      the frozen release payload once `04-05`/`04-06` ship) and returns the
 *      ordered list of module descriptors the public page lays out. It never
 *      reads the draft `homepage_sections` table.
 *
 * The module is pure and framework-free, so it is safe to import from client
 * components (the dashboard editor renders these labels) and from server
 * components alike.
 */

/** One approved homepage module, with the copy the editors display. */
export interface HomepageSectionDefinition {
  /** Stable id; matches `public.homepage_sections.section_id`. */
  sectionId: string;
  /** Human label shown in the dashboard editor. */
  label: string;
  /** One-line explanation of what the module shows. */
  description: string;
  /** Task id that ships the real module on the public site. */
  task: string;
}

/**
 * The complete allowlist. Order here is the default order (it mirrors the
 * seed rows in `20261019104827_core_schema.sql`), and adding an entry would
 * also require seeding it in the database — this list is deliberately not
 * derived from stored data.
 */
export const APPROVED_HOMEPAGE_SECTIONS: readonly HomepageSectionDefinition[] =
  [
    {
      sectionId: "spotlight",
      label: "Spotlight",
      description: "Cinematic header featuring the signature hero and account.",
      task: "05-02",
    },
    {
      sectionId: "stats",
      label: "Stats & completeness",
      description: "Account stats strip and collection completeness.",
      task: "05-02",
    },
    {
      sectionId: "showcase_tabs",
      label: "Showcase tabs",
      description: "Tabbed heroes, skins and achievements showcase.",
      task: "05-03",
    },
    {
      sectionId: "timeline",
      label: "Timeline highlights",
      description: "Highlighted milestones from the account timeline.",
      task: "05-03",
    },
    {
      sectionId: "explorer",
      label: "Explorer & search teaser",
      description: "Collection explorer entry point and search teaser.",
      task: "05-04 / 06-01",
    },
  ];

/** The allowlist ids, in default order. */
export const APPROVED_HOMEPAGE_SECTION_IDS: readonly string[] =
  APPROVED_HOMEPAGE_SECTIONS.map((section) => section.sectionId);

/** True when `value` is one of the approved module ids. */
export function isApprovedHomepageSectionId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    APPROVED_HOMEPAGE_SECTION_IDS.includes(value)
  );
}

/** The definition for an approved id, or `undefined` when it is not approved. */
export function homepageSectionDefinition(
  sectionId: string
): HomepageSectionDefinition | undefined {
  return APPROVED_HOMEPAGE_SECTIONS.find(
    (section) => section.sectionId === sectionId
  );
}

/** One ordered slot of the public homepage. */
export interface HomepageLayoutSlot extends HomepageSectionDefinition {
  /** Stored position (1-based, matching the draft rows). */
  position: number;
}

export type HomepageSectionConfiguration =
  | DraftHomepageSection[]
  | PublishedHomepageSection[]
  | ReadonlyArray<{ sectionId: string; position: number; isEnabled: boolean }>;

/**
 * Turns a published section configuration into the ordered list of modules the
 * public layout renders.
 *
 * Guarantees, regardless of what the input contains:
 *   - unapproved ids are dropped (a row naming `dangerous_div` renders
 *     nothing — there is no lookup table keyed by attacker-controlled data);
 *   - disabled sections are dropped;
 *   - duplicates are dropped (first occurrence wins);
 *   - the result is sorted by `position`, ascending and stable, so ordering is
 *     deterministic even if the source rows arrive unsorted.
 *
 * Returns `[]` when nothing is published, which the public page renders as its
 * "nothing published yet" state rather than guessing a default order.
 */
export function composeHomepageLayout(
  configuration: HomepageSectionConfiguration | null | undefined
): HomepageLayoutSlot[] {
  if (!configuration) {
    return [];
  }

  const seen = new Set<string>();
  const slots: HomepageLayoutSlot[] = [];

  for (const entry of configuration) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const { sectionId, position, isEnabled } = entry;
    if (!isApprovedHomepageSectionId(sectionId)) {
      continue;
    }
    if (seen.has(sectionId)) {
      continue;
    }
    if (!isEnabled) {
      continue;
    }
    const definition = homepageSectionDefinition(sectionId);
    if (!definition) {
      continue;
    }
    seen.add(sectionId);
    slots.push({
      ...definition,
      position: typeof position === "number" && Number.isFinite(position)
        ? position
        : Number.MAX_SAFE_INTEGER,
    });
  }

  return slots.sort((a, b) => a.position - b.position);
}

/** The default configuration: every approved module, enabled, in seed order. */
export function defaultHomepageSectionConfiguration(): Array<{
  sectionId: string;
  position: number;
  isEnabled: boolean;
}> {
  return APPROVED_HOMEPAGE_SECTIONS.map((section, index) => ({
    sectionId: section.sectionId,
    position: index + 1,
    isEnabled: true,
  }));
}
