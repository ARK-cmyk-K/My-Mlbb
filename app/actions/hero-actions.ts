"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { contentService } from "../lib/content";
import {
  createHeroAdminService,
  type HeroActionState,
} from "../lib/content/hero-admin";

/**
 * Hero management server actions (task 03-01).
 *
 * All mutations occur here — on the server — and are always authorized by the
 * content service (which runs `requireAdminDb()` / `isAdminUser()` and RLS).
 * Only caller-safe messages and field issues are returned to the browser.
 *
 * Actions that use `useActionState` (create/update/delete/archive/restore) return
 * {@link HeroActionState} on failure; on success they `revalidatePath` and
 * `redirect` back to the heroes list. That keeps the dashboard state consistent
 * (the list reloads from the server after every mutation).
 */

const admin = createHeroAdminService(contentService);

export async function createHeroAction(
  _prevState: HeroActionState,
  formData: FormData
): Promise<HeroActionState> {
  const outcome = await admin.create(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/heroes");
  redirect("/admin/heroes?notice=created");
}

export async function updateHeroAction(
  _prevState: HeroActionState,
  formData: FormData
): Promise<HeroActionState> {
  const outcome = await admin.update(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/heroes");
  redirect("/admin/heroes?notice=updated");
}

export async function deleteHeroAction(
  _prevState: HeroActionState,
  formData: FormData
): Promise<HeroActionState> {
  const outcome = await admin.remove(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/heroes");
  redirect("/admin/heroes?notice=deleted");
}

export async function transitionHeroAction(
  _prevState: HeroActionState,
  formData: FormData
): Promise<HeroActionState> {
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
  revalidatePath("/admin/heroes");
  redirect(`/admin/heroes?notice=${notice}`);
}
