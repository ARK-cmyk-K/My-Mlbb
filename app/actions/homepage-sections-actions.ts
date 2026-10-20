"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { contentService } from "../lib/content";
import {
  createHomepageSectionsAdminService,
  type HomepageSectionsActionState,
} from "../lib/content/homepage-sections-admin";

const admin = createHomepageSectionsAdminService(contentService);

export async function updateHomepageSectionsAction(
  _prevState: HomepageSectionsActionState,
  formData: FormData
): Promise<HomepageSectionsActionState> {
  const outcome = await admin.update(formData);
  if (!outcome.ok) {
    return outcome.state;
  }
  revalidatePath("/admin/appearance");
  revalidatePath("/admin/homepage");
  revalidatePath("/");
  redirect("/admin/appearance?notice=homepage_saved");
}
