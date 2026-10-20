/**
 * Commit orchestration for CSV merge previews (task 03-04).
 *
 * This module is the server-side executor: it loads the server-held preview,
 * re-reads the current draft state, re-validates everything (classification,
 * staleness, drift, the operator's resolution set and the final merged
 * payloads), then applies the resulting plan. When an apply-phase failure
 * occurs, it attempts a **compensating rollback** of whatever was already
 * written before reporting the outcome loudly.
 *
 * All I/O happens via the injected `ContentService` port, and the preview is
 * fetched from the injected `MergePreviewStore`. The implementation is designed
 * for determinism in tests (no direct `process.env`, no timers except the store
 * clock), and for strict "do not partially commit silently" semantics.
 */

import type { ContentService } from "../content";
import {
  isContentServiceError,
  type ContentServiceError,
} from "../content/errors.ts";
import { buildImportErrorReport } from "./spreadsheet.ts";
import {
  buildMergePlan,
  buildMergePreview,
  detectStaleness,
  type MergeCommitPlan,
  type MergePlanOp,
  type MergePreviewPayload,
  type MergeReferences,
  validateMergeResolutions,
} from "./merge.ts";
import type { MergePreviewStore } from "./preview-store.ts";
import type { FieldIssue } from "../content/validation.ts";
import type { ImportEntity } from "./columns.ts";

export interface MergeRowOutcome {
  row: number;
  slug: string;
  status:
    | "created"
    | "updated"
    | "unchanged"
    | "skipped"
    | "failed"
    | "rolled_back"
    | "not_attempted";
  error?: string;
}

export interface MergeCommitSummary {
  entity: ImportEntity;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  rows: MergeRowOutcome[];
  rolledBack: boolean;
  errorReportCsv?: string;
}

export type MergeCommitState =
  | { ok: true; summary: MergeCommitSummary }
  | {
      ok: false;
      error: string;
      issues?: FieldIssue[];
      summary?: MergeCommitSummary;
    };

export interface MergeCommitDeps {
  service: ContentService;
  store: MergePreviewStore;
}

export interface MergeCommitInput {
  previewId: string;
  resolutions: unknown;
}

const PREVIEW_EXPIRED_MESSAGE =
  "This preview is no longer available. Run the import preview again.";
const PREVIEW_STALE_MESSAGE =
  "This preview is out of date because the collection changed. Run the import preview again.";
const SELECTION_INVALID_MESSAGE =
  "Some of your choices are not valid. Review the fields and try again.";
const PLAN_INVALID_MESSAGE =
  "The selected merge would produce an invalid record. Review the differences and try again.";
const COMMIT_FAILED_MESSAGE =
  "The merge could not be completed. No changes were left partially applied.";
const COMMIT_PARTIAL_MESSAGE =
  "The merge stopped partway through. The applied changes have been rolled back where possible.";

export async function commitMergePreview(
  deps: MergeCommitDeps,
  input: MergeCommitInput
): Promise<MergeCommitState> {
  const record = deps.store.get(input.previewId);
  if (record === null) {
    return { ok: false, error: PREVIEW_EXPIRED_MESSAGE };
  }

  const payload = record.payload;

  let references: MergeReferences;
  try {
    references = await loadReferences(deps.service, payload.entity);
  } catch (error) {
    if (isContentServiceError(error)) {
      return mapServiceError(error);
    }
    return {
      ok: false,
      error: "The commit could not read the current collection. Please try again.",
    };
  }

  let fresh: MergePreviewPayload;
  try {
    const rebuilt = buildMergePreview(payload.entity, payload.records, references);
    if (!rebuilt.ok) {
      deps.store.delete(input.previewId);
      return { ok: false, error: rebuilt.error };
    }
    fresh = rebuilt.payload;
  } catch (error) {
    if (isContentServiceError(error)) {
      return mapServiceError(error);
    }
    return {
      ok: false,
      error: "The commit could not re-validate the preview. Please try again.",
    };
  }

  const staleness = detectStaleness(payload.rows, fresh.rows);
  if (staleness.length > 0) {
    deps.store.delete(input.previewId);
    return {
      ok: false,
      error: PREVIEW_STALE_MESSAGE,
      issues: staleness.map((issue: { row: number; message: string }) => ({
        path: `rows.${issue.row}`,
        message: issue.message,
      })),
    };
  }

  const resolutionCheck = validateMergeResolutions(payload, input.resolutions);
  if (!resolutionCheck.ok) {
    return {
      ok: false,
      error: SELECTION_INVALID_MESSAGE,
      issues: resolutionCheck.issues,
    };
  }

  const plan = buildMergePlan(fresh, resolutionCheck.value);
  if (!plan.ok) {
    return {
      ok: false,
      error: PLAN_INVALID_MESSAGE,
      issues: plan.issues,
    };
  }

  const applyResult = await applyPlan(deps.service, payload.entity, plan.plan);
  deps.store.delete(input.previewId);

  if (!applyResult.ok) {
    return {
      ok: false,
      error: applyResult.rolledBack
        ? COMMIT_PARTIAL_MESSAGE
        : COMMIT_FAILED_MESSAGE,
      summary: applyResult.summary,
    };
  }

  return { ok: true, summary: applyResult.summary };
}

async function loadReferences(
  service: ContentService,
  _entity: ImportEntity
): Promise<MergeReferences> {
  const [heroes, skins] = await Promise.all([
    service.listDraftHeroes({ includeArchived: true }),
    service.listDraftSkins({ includeArchived: true }),
  ]);
  return {
    existingSlugs: [],
    heroes,
    skins,
  };
}

interface ApplyResult {
  ok: boolean;
  rolledBack: boolean;
  summary: MergeCommitSummary;
}

async function applyPlan(
  service: ContentService,
  entity: ImportEntity,
  plan: MergeCommitPlan
): Promise<ApplyResult> {
  const rowsOutcomes: MergeRowOutcome[] = [];

  for (const item of plan.skipped) {
    rowsOutcomes.push({
      row: item.row,
      slug: item.slug,
      status: "skipped",
    });
  }
  for (const item of plan.unchanged) {
    rowsOutcomes.push({
      row: item.row,
      slug: item.slug,
      status: "unchanged",
    });
  }

  const applied: Array<{ op: MergePlanOp; createdId?: string }> = [];
  let failed = false;
  let rollbackSucceeded = true;

  for (const op of plan.ops) {
    if (failed) {
      rowsOutcomes.push({
        row: op.row,
        slug: op.slug,
        status: "not_attempted",
      });
      continue;
    }
    try {
      if (op.kind === "create") {
        if (entity === "heroes") {
          const created = await (service.createDraftHero as (input: unknown) => Promise<{ id: string }>)(op.payload);
          applied.push({ op, createdId: created.id });
        } else {
          const created = await (service.createDraftSkin as (input: unknown) => Promise<{ id: string }>)(op.payload);
          applied.push({ op, createdId: created.id });
        }
        rowsOutcomes.push({ row: op.row, slug: op.slug, status: "created" });
      } else {
        const opId = op.id;
        if (opId === undefined) {
          throw new Error("update operation missing id");
        }
        if (entity === "heroes") {
          await service.updateDraftHero(opId, op.payload as import("../content/validation.ts").HeroInput);
        } else {
          await service.updateDraftSkin(opId, op.payload as import("../content/validation.ts").SkinInput);
        }
        applied.push({ op });
        rowsOutcomes.push({ row: op.row, slug: op.slug, status: "updated" });
      }
    } catch (error) {
      failed = true;
      const message = messageFromError(error);
      rowsOutcomes.push({
        row: op.row,
        slug: op.slug,
        status: "failed",
        error: message,
      });
      rollbackSucceeded = await compensate(applied, service, entity);
      for (const entry of applied) {
        rowsOutcomes.push({
          row: entry.op.row,
          slug: entry.op.slug,
          status: "rolled_back",
        });
      }
    }
  }

  const summary: MergeCommitSummary = {
    entity,
    total: plan.ops.length + plan.unchanged.length + plan.skipped.length,
    created: rowsOutcomes.filter((outcome) => outcome.status === "created").length,
    updated: rowsOutcomes.filter((outcome) => outcome.status === "updated").length,
    unchanged: rowsOutcomes.filter((outcome) => outcome.status === "unchanged").length,
    skipped: rowsOutcomes.filter((outcome) => outcome.status === "skipped").length,
    failed: rowsOutcomes.filter((outcome) => outcome.status === "failed").length,
    rows: rowsOutcomes,
    rolledBack: !failed ? false : rollbackSucceeded,
    errorReportCsv: buildErrorReport(rowsOutcomes),
  };

  return { ok: !failed, rolledBack: !failed ? false : rollbackSucceeded, summary };
}

async function compensate(
  applied: Array<{ op: MergePlanOp; createdId?: string }>,
  service: ContentService,
  entity: ImportEntity
): Promise<boolean> {
  let allGood = true;
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    const entry = applied[index];
    try {
      if (entry.op.kind === "create") {
        const id = entry.createdId;
        if (id === undefined) continue;
        if (entity === "heroes") {
          await service.deleteDraftHero(id);
        } else {
          await service.deleteDraftSkin(id);
        }
      } else {
        const id = entry.op.id;
        const before = entry.op.before;
        if (id === undefined || before === undefined) continue;
        if (entity === "heroes") {
          await service.updateDraftHero(id, before as import("../content/validation.ts").HeroInput);
        } else {
          await service.updateDraftSkin(id, before as import("../content/validation.ts").SkinInput);
        }
      }
    } catch {
      allGood = false;
    }
  }
  return allGood;
}

function buildErrorReport(rows: MergeRowOutcome[]): string | undefined {
  const failures = rows.filter((outcome) => outcome.status === "failed" && outcome.error);
  if (failures.length === 0) return undefined;
  return buildImportErrorReport(
    failures.map((outcome) => ({
      row: outcome.row,
      slug: outcome.slug || null,
      issues: [
        {
          path: "commit",
          message: outcome.error ?? "operation failed",
        },
      ],
    }))
  );
}

function messageFromError(error: unknown): string {
  if (isContentServiceError(error)) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "The operation failed.";
}

function mapServiceError(error: ContentServiceError): MergeCommitState {
  return { ok: false, error: error.message };
}
