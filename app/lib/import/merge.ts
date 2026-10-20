/**
 * CSV merge resolution (task 03-04).
 */

import type { DraftHero, DraftSkin } from "../content/contracts.ts";
import { validateHeroInput, validateSkinInput } from "../content/validation.ts";
import type {
  FieldIssue,
  HeroInput,
  SkinInput,
  ValidationResult,
} from "../content/validation.ts";
import { type ImportEntity } from "./columns.ts";
import {
  buildImportPreview,
  parseImportRecords,
  type ImportReferences,
  type ImportRowError,
} from "./preview.ts";

// ---------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------

export type MergeValue = string | number | boolean | null;

export interface MergeFieldDiff {
  field: string;
  label: string;
  existing: MergeValue;
  imported: MergeValue;
  differs: boolean;
}

export const HERO_MERGE_FIELDS = [
  "name",
  "slug",
  "primaryRole",
  "secondaryRole",
  "specialty",
  "portraitMediaId",
  "masteryLevel",
  "totalMatches",
  "winRate",
  "isSignature",
  "isFavorite",
] as const;

export const SKIN_MERGE_FIELDS = [
  "name",
  "slug",
  "heroId",
  "rarity",
  "series",
  "splashArtMediaId",
  "variant",
  "acquisitionDate",
  "acquisitionMilestone",
  "isOwned",
  "isFavorite",
] as const;

const HERO_LABELS: Record<string, string> = {
  name: "Name",
  slug: "Slug",
  primaryRole: "Primary role",
  secondaryRole: "Secondary role",
  specialty: "Specialty",
  portraitMediaId: "Portrait media",
  masteryLevel: "Mastery level",
  totalMatches: "Total matches",
  winRate: "Win rate",
  isSignature: "Signature hero",
  isFavorite: "Favourite",
};

const SKIN_LABELS: Record<string, string> = {
  name: "Name",
  slug: "Slug",
  heroId: "Hero",
  rarity: "Rarity",
  series: "Series",
  splashArtMediaId: "Splash art media",
  variant: "Variant",
  acquisitionDate: "Acquired on",
  acquisitionMilestone: "Acquisition milestone",
  isOwned: "Owned",
  isFavorite: "Favourite",
};

export function mergeFieldsFor(entity: ImportEntity): readonly string[] {
  return entity === "heroes" ? HERO_MERGE_FIELDS : SKIN_MERGE_FIELDS;
}

export function snapshotHeroValues(hero: DraftHero): Record<string, MergeValue> {
  return pick(hero, HERO_MERGE_FIELDS);
}

export function snapshotSkinValues(skin: DraftSkin): Record<string, MergeValue> {
  return pick(skin, SKIN_MERGE_FIELDS);
}

function pick(source: any, fields: readonly string[]): Record<string, MergeValue> {
  const values: Record<string, MergeValue> = {};
  for (const field of fields) {
    const value = source[field];
    values[field] = normalizeValue(value);
  }
  return values;
}

function normalizeValue(value: unknown): MergeValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value === undefined ? null : (value as MergeValue);
  }
  return String(value);
}

export function valuesMatch(a: MergeValue, b: MergeValue): boolean {
  return a === b;
}

export function mergeFieldLabel(entity: ImportEntity, field: string): string {
  const labels = entity === "heroes" ? HERO_LABELS : SKIN_LABELS;
  return labels[field] ?? field;
}

function buildDiffs(
  entity: ImportEntity,
  existing: Record<string, MergeValue>,
  imported: Record<string, MergeValue>
): MergeFieldDiff[] {
  return mergeFieldsFor(entity).map((field) => {
    const existingValue = existing[field] ?? null;
    const importedValue = imported[field] ?? null;
    return {
      field,
      label: mergeFieldLabel(entity, field),
      existing: existingValue,
      imported: importedValue,
      differs: !valuesMatch(existingValue, importedValue),
    };
  });
}

export function differingFields(diffs: readonly MergeFieldDiff[]): string[] {
  return diffs.filter((diff) => diff.differs).map((diff) => diff.field);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface ExistingRowSnapshot {
  id: string;
  updatedAt: string;
  values: Record<string, MergeValue>;
}

export interface MergePreviewRow {
  row: number;
  slug: string;
  name: string;
  action: "new" | "existing";
  diffs: MergeFieldDiff[];
  snapshot?: ExistingRowSnapshot;
  payload?: HeroInput | SkinInput;
}

export interface MergePreviewPayload {
  entity: ImportEntity;
  records: string[][];
  totalRows: number;
  rows: MergePreviewRow[];
  errors: ImportRowError[];
}

export type MergePreviewResult =
  | { ok: true; payload: MergePreviewPayload }
  | { ok: false; error: string };

export interface MergeReferences extends ImportReferences {
  heroes: ReadonlyArray<DraftHero>;
  skins: ReadonlyArray<DraftSkin>;
}

export function buildMergePreview(
  entity: ImportEntity,
  records: readonly (readonly string[])[],
  references: MergeReferences
): MergePreviewResult {
  const parsed = parseImportRecords(
    entity,
    records,
    {
      existingSlugs:
        references.existingSlugs.length > 0
          ? references.existingSlugs
          : entity === "heroes"
            ? references.heroes.map((row) => row.slug)
            : references.skins.map((row) => row.slug),
      heroes: references.heroes.map((hero) => ({
        id: hero.id,
        slug: hero.slug,
      })),
    }
  );
  if (!parsed.ok) return parsed;

  const skinBySlug = new Map(
    references.skins.map((skin) => [skin.slug, skin])
  );

  const rows: MergePreviewRow[] = [];
  for (const row of parsed.rows) {
    if (row.action === "new") {
      rows.push({
        row: row.row,
        slug: row.slug,
        name: row.name,
        action: "new",
        diffs: [],
        payload: row.payload,
      });
      continue;
    }

    const stored =
      entity === "heroes"
        ? references.heroes.find((hero) => hero.slug === row.slug)
        : skinBySlug.get(row.slug);

    if (stored === undefined) {
      return {
        ok: false,
        error: `Row ${row.row} matches slug "${row.slug}" but no stored record was supplied.`,
      };
    }

    const existingValues =
      entity === "heroes"
        ? snapshotHeroValues(stored as DraftHero)
        : snapshotSkinValues(stored as DraftSkin);
    const importedValues = payloadValues(entity, row.payload);

    rows.push({
      row: row.row,
      slug: row.slug,
      name: row.name,
      action: "existing",
      diffs: buildDiffs(entity, existingValues, importedValues),
      snapshot: {
        id: stored.id,
        updatedAt: stored.updatedAt,
        values: existingValues,
      },
      payload: row.payload,
    });
  }

  return {
    ok: true,
    payload: {
      entity,
      records: records.map((record) => [...record]),
      totalRows: parsed.totalRows,
      rows,
      errors: parsed.errors,
    },
  };
}

function payloadValues(entity: ImportEntity, payload: any): Record<string, MergeValue> {
  return entity === "heroes"
    ? pick(payload as any, HERO_MERGE_FIELDS)
    : pick(payload as any, SKIN_MERGE_FIELDS);
}

export { buildImportPreview };

// ---------------------------------------------------------------------------
// Resolutions
// ---------------------------------------------------------------------------

export type MergeAction = "include" | "skip";
export type MergeChoice = "keep" | "use";

export interface MergeRowResolution {
  row: number;
  action: MergeAction;
  fields: Record<string, MergeChoice>;
}

export type ValidatedResolutions = Map<number, MergeRowResolution>;

export function validateMergeResolutions(
  payload: MergePreviewPayload,
  input: unknown
): ValidationResult<ValidatedResolutions> {
  const issues: FieldIssue[] = [];

  if (!Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ path: "resolutions", message: "must be a list of row choices" }],
    };
  }

  const byRow = new Map<number, MergeRowResolution>();
  input.forEach((entry: any, index: number) => {
    if (entry === null || typeof entry !== "object") {
      issues.push({
        path: `resolutions[${index}]`,
        message: "must be an object",
      });
      return;
    }
    const row = entry.row;
    if (typeof row !== "number" || !Number.isInteger(row) || row <= 0) {
      issues.push({
        path: `resolutions[${index}].row`,
        message: "must be a positive row number",
      });
      return;
    }
    if (byRow.has(row)) {
      issues.push({
        path: `resolutions[${row}].row`,
        message: "is resolved more than once",
      });
      return;
    }

    const action = entry.action;
    if (action !== "include" && action !== "skip") {
      issues.push({
        path: `resolutions[${row}].action`,
        message: 'must be "include" or "skip"',
      });
      return;
    }

    const rawFields = entry.fields ?? {};
    if (rawFields === null || typeof rawFields !== "object" || Array.isArray(rawFields)) {
      issues.push({
        path: `resolutions[${row}].fields`,
        message: "must be an object of field choices",
      });
      return;
    }

    const fields: Record<string, MergeChoice> = {};
    for (const [field, choice] of Object.entries(rawFields)) {
      if (choice !== "keep" && choice !== "use") {
        issues.push({
          path: `resolutions[${row}].fields.${field}`,
          message: 'must be "keep" or "use"',
        });
        continue;
      }
      fields[field] = choice as MergeChoice;
    }

    byRow.set(row, { row, action, fields });
  });

  for (const viewRow of payload.rows) {
    const resolved = byRow.get(viewRow.row);
    if (resolved === undefined) {
      issues.push({
        path: `resolutions.${viewRow.row}`,
        message: `is missing a choice for row ${viewRow.row}`,
      });
      continue;
    }

    const expected = new Set(differingFields(viewRow.diffs));
    for (const field of Object.keys(resolved.fields)) {
      if (!expected.has(field)) {
        issues.push({
          path: `resolutions.${viewRow.row}.fields.${field}`,
          message:
            viewRow.action === "new"
              ? "new rows have no field choices"
              : "field does not differ and needs no choice",
        });
      }
    }
    for (const field of expected) {
      if (!(field in resolved.fields)) {
        issues.push({
          path: `resolutions.${viewRow.row}.fields.${field}`,
          message: "is missing a keep/use choice",
        });
      }
    }
  }

  const known = new Set(payload.rows.map((row) => row.row));
  for (const row of byRow.keys()) {
    if (!known.has(row)) {
      issues.push({
        path: `resolutions.${row}`,
        message: `refers to row ${row}, which is not in this preview`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: byRow };
}

export function defaultResolutions(payload: MergePreviewPayload): MergeRowResolution[] {
  return payload.rows.map((row) => ({
    row: row.row,
    action: "include",
    fields: Object.fromEntries(
      differingFields(row.diffs).map((field) => [field, "keep" as const])
    ),
  }));
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface MergePlanOp {
  row: number;
  slug: string;
  kind: "create" | "update";
  id?: string;
  payload: HeroInput | SkinInput;
  before?: HeroInput | SkinInput;
}

export interface MergeCommitPlan {
  entity: ImportEntity;
  ops: MergePlanOp[];
  unchanged: Array<{ row: number; slug: string }>;
  skipped: Array<{ row: number; slug: string }>;
}

export type MergePlanResult =
  | { ok: true; plan: MergeCommitPlan }
  | { ok: false; issues: FieldIssue[] };

export function buildMergePlan(
  payload: MergePreviewPayload,
  resolutions: ValidatedResolutions
): MergePlanResult {
  const issues: FieldIssue[] = [];
  const ops: MergePlanOp[] = [];
  const unchanged: Array<{ row: number; slug: string }> = [];
  const skipped: Array<{ row: number; slug: string }> = [];

  for (const row of payload.rows) {
    const resolved = resolutions.get(row.row);
    if (resolved === undefined) {
      issues.push({ path: `resolutions.${row.row}`, message: "is missing" });
      continue;
    }
    if (resolved.action === "skip") {
      skipped.push({ row: row.row, slug: row.slug });
      continue;
    }

    if (row.action === "new") {
      if (row.payload === undefined) {
        issues.push({
          path: `resolutions.${row.row}`,
          message: "has no imported payload",
        });
        continue;
      }
      const validated = validatePayload(payload.entity, row.payload);
      if (!validated.ok) {
        pushRowIssues(issues, row.row, validated.issues);
        continue;
      }
      ops.push({
        row: row.row,
        slug: row.slug,
        kind: "create",
        payload: validated.value,
      });
      continue;
    }

    const snapshot = row.snapshot;
    if (snapshot === undefined) {
      issues.push({
        path: `resolutions.${row.row}`,
        message: "has no stored snapshot to merge against",
      });
      continue;
    }
    const merged = applyChoices(
      snapshot.values,
      payloadValues(payload.entity, row.payload ?? ({} as any)),
      resolved
    );

    const validated = validatePayload(payload.entity, merged);
    if (!validated.ok) {
      pushRowIssues(issues, row.row, validated.issues);
      continue;
    }

    if (payloadValuesEqual(payload.entity, validated.value, snapshot.values)) {
      unchanged.push({ row: row.row, slug: row.slug });
      continue;
    }

    ops.push({
      row: row.row,
      slug: row.slug,
      kind: "update",
      id: snapshot.id,
      payload: validated.value,
      before: validated.value,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, plan: { entity: payload.entity, ops, unchanged, skipped } };
}

function applyChoices(
  stored: Record<string, MergeValue>,
  imported: Record<string, MergeValue>,
  resolved: MergeRowResolution
): Record<string, MergeValue> {
  const merged: Record<string, MergeValue> = { ...stored };
  for (const [field, choice] of Object.entries(resolved.fields)) {
    if (choice === "use") {
      merged[field] = imported[field] ?? null;
    }
  }
  return merged;
}

import { validateHeroInput as validateHeroInputFn, validateSkinInput as validateSkinInputFn } from "../content/validation.ts";

function validatePayload(entity: any, payload: unknown): any {
  return entity === "heroes" ? validateHeroInputFn(payload) : validateSkinInputFn(payload);
}

function payloadValuesEqual(entity: any, payload: any, values: any): boolean {
  const current = payloadValues(entity, payload);
  return mergeFieldsFor(entity).every((field: any) => valuesMatch(current[field] ?? null, values[field] ?? null));
}

function pushRowIssues(target: any[], row: number, source: readonly any[]): void {
  for (const issue of source) {
    target.push({ path: `rows.${row}.${issue.path}`, message: issue.message });
  }
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

export function detectStaleness(previewed: any, fresh: any): Array<{ row: number; message: string }> {
  const issues: any[] = [];
  const freshByRow = new Map((fresh as any[]).map((r: any) => [r.row, r]));
  for (const before of previewed as any[]) {
    const after: any = freshByRow.get(before.row);
    if (after === undefined) {
      issues.push({ row: before.row, message: "is no longer valid or no longer present in the collection" });
      continue;
    }
    if (after.action !== before.action) {
      issues.push({ row: before.row, message: after.action === "new" ? "no longer matches an existing record" : "now matches a record that did not exist at preview time" });
      continue;
    }
    if (before.action !== "existing" || !before.snapshot) continue;
    if (!after.snapshot) {
      issues.push({ row: before.row, message: "lost its stored snapshot" });
      continue;
    }
    if (after.snapshot.id !== before.snapshot.id) {
      issues.push({ row: before.row, message: "now points at a different record" });
      continue;
    }
    if (after.snapshot.updatedAt !== before.snapshot.updatedAt) {
      issues.push({ row: before.row, message: "was edited after the preview was generated" });
      continue;
    }
    for (const [field, value] of Object.entries(before.snapshot.values)) {
      const latest = (after.snapshot.values as any)[field] ?? null;
      if (value !== latest) {
        issues.push({ row: before.row, message: "changed the value of \"" + field + "\" after the preview was generated" });
        break;
      }
    }
  }
  return issues;
}
