import { APPROVED_HOMEPAGE_SECTION_IDS } from "./homepage-sections.ts";
import type { FieldIssue, HomepageSectionOrderInput } from "./validation.ts";

const ALLOWED_IDS = new Set<string>(APPROVED_HOMEPAGE_SECTION_IDS);

export type HomepageSectionsFormParseResult =
  | { ok: true; value: HomepageSectionOrderInput }
  | { ok: false; issues: FieldIssue[] };

function issue(path: string, message: string): FieldIssue {
  return { path, message };
}

function isTruthy(value: FormDataEntryValue | null): boolean {
  if (value === null) {
    return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "") {
      return false;
    }
    if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") {
      return false;
    }
    return true;
  }
  return true;
}

export function parseHomepageSectionsForm(formData: FormData): HomepageSectionsFormParseResult {
  const issues: FieldIssue[] = [];
  const entries: Array<{ sectionId: string; isEnabled: boolean; order: number }> = [];

  for (const id of APPROVED_HOMEPAGE_SECTION_IDS) {
    const enabledKey = `section.${id}.enabled`;
    const orderKey = `section.${id}.order`;
    const enabledValue = formData.get(enabledKey);
    const orderValue = formData.get(orderKey);

    if (!ALLOWED_IDS.has(id)) {
      issues.push(issue(`order`, `Unsupported section id "${id}".`));
      continue;
    }

    let order = Number.NaN;
    if (orderValue !== null && orderValue !== undefined) {
      const asString = typeof orderValue === "string" ? orderValue.trim() : String(orderValue);
      order = Number(asString);
      if (!Number.isFinite(order)) {
        issues.push(issue(orderKey, "Order must be a number."));
        continue;
      }
      if (!Number.isInteger(order) || order < 0) {
        issues.push(issue(orderKey, "Order must be a non-negative integer."));
        continue;
      }
    } else {
      issues.push(issue(orderKey, "Order is required."));
      continue;
    }

    entries.push({
      sectionId: id,
      isEnabled: isTruthy(enabledValue),
      order,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    const aIdx = APPROVED_HOMEPAGE_SECTION_IDS.indexOf(a.sectionId);
    const bIdx = APPROVED_HOMEPAGE_SECTION_IDS.indexOf(b.sectionId);
    return aIdx - bIdx;
  });

  const value = sorted.map((entry) => ({
    sectionId: entry.sectionId,
    isEnabled: entry.isEnabled,
  }));

  return { ok: true, value: value as unknown as HomepageSectionOrderInput };
}
