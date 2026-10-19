"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { contentService } from "../lib/content";
import {
  createSkinAdminService,
  type SkinActionState,
} from "../lib/content/skin-admin";

/**
 * Skin management server actions (task 03-02).
 *
 * All mutations occur here — on the server — and are always authorized by the
 * content service (which runs `requireAdminDb()` / `isAdminUser()` and RLS).
 * Only caller-safe messages and field issues are returned to the browser.
 *
 * Actions that use `useActionState` (create/update/delete/archive/restore) return
 * {@link SkinActionState} on failure; on success they `revalidatePath` and
 * `redirect` back to the skins list, so the list reloads from the server after
 * every mutation.
 */

const admin = createSkinAdminService(contentService);

export async function createSkinAction(
  _prevState: SkinActionState,
  formData: FormData
): Promise<SkinActionState> {
  const outcome = await admin.create(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/skins");
  redirect("/admin/skins?notice=created");
}

export async function updateSkinAction(
  _prevState: SkinActionState,
  formData: FormData
): Promise<SkinActionState> {
  const outcome = await admin.update(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/skins");
  redirect("/admin/skins?notice=updated");
}

export async function deleteSkinAction(
  _prevState: SkinActionState,
  formData: FormData
): Promise<SkinActionState> {
  const outcome = await admin.remove(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/skins");
  redirect("/admin/skins?notice=deleted");
}

export async function transitionSkinAction(
  _prevState: SkinActionState,
  formData: FormData
): Promise<SkinActionState> {
  const outcome = await admin.transition(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  const transition = String(formData.get("transition") ?? "").trim();
  let notice = "updated";
  if (transition === "archive") notice = "archived";
  if (transition === "restore") notice = "restored";
  if (transition === "publish") notice = "published";
  if (transition === "unpublish") notice = "unpublished";
  revalidatePath("/admin/skins");
  redirect(`/admin/skins?notice=${notice}`);
}
