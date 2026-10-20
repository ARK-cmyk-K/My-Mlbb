"use server";

import { requireAdmin } from "../auth/requireAdmin";

export interface ReleaseActionState {
  error?: string;
  releaseId?: string;
  snapshotId?: string;
}

export async function listReleaseSnapshots(): Promise<
  Array<{ id: string; version: number; label: string | null; createdAt: string }>
> {
  await requireAdmin();
  return [];
}

export async function publishReleaseAction(
  _prevState: ReleaseActionState,
  _formData: FormData
): Promise<ReleaseActionState> {
  await requireAdmin();
  return { error: "Publishing is not implemented yet." };
}

export async function rollbackReleaseAction(
  _prevState: ReleaseActionState,
  _formData: FormData
): Promise<ReleaseActionState> {
  await requireAdmin();
  return { error: "Rollback is not implemented yet." };
}