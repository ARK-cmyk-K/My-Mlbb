"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { contentService } from "../lib/content";
import {
  createAppearanceAdminService,
  type AppearanceActionState,
} from "../lib/content/appearance-admin";

/**
 * Appearance settings server actions (task 04-01).
 */

const admin = createAppearanceAdminService(contentService);

export async function updateAppearanceAction(
  _prevState: AppearanceActionState,
  formData: FormData
): Promise<AppearanceActionState> {
  const outcome = await admin.update(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/appearance");
  revalidatePath("/");
  redirect("/admin/appearance?notice=saved");
}
