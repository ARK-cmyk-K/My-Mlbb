import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "../../../auth/requireAdmin";
import { contentService } from "../../../lib/content";
import { isContentServiceError } from "../../../lib/content/errors";
import type { DraftSkin } from "../../../lib/content/contracts";
import { isUuid } from "../../../lib/content/form-utils";
import type { SkinHeroOption } from "../../../lib/content/skin-form";
import { SkinForm } from "../skin-form";
import { SkinRowActions } from "../skin-row-actions";

/**
 * Edit a skin (task 03-02).
 *
 * Server component: re-checks authorization, then loads the single draft skin
 * through the admin-only content service. A missing skin (or a non-UUID id, which
 * could never match a `uuid` column) renders `not-found.tsx` rather than a raw
 * database error. Unexpected failures render a recoverable error panel.
 */

export default async function EditSkinPage(
  props: PageProps<"/admin/skins/[id]">
) {
  await requireAdmin();
  const { id } = await props.params;

  if (!isUuid(id)) {
    notFound();
  }

  let skin: DraftSkin | null = null;
  let heroOptions: SkinHeroOption[] = [];
  let loadError: string | null = null;
  try {
    const [loadedSkin, heroes] = await Promise.all([
      contentService.getDraftSkin(id),
      contentService.listDraftHeroes({ includeArchived: true }),
    ]);
    skin = loadedSkin;
    heroOptions = heroes.map((hero) => ({
      value: hero.id,
      label:
        hero.publicationState === "archived"
          ? `${hero.name} (archived)`
          : hero.name,
    }));
  } catch (error) {
    if (isContentServiceError(error) && error.code === "NOT_FOUND") {
      notFound();
    }
    loadError = isContentServiceError(error)
      ? error.message
      : "This skin could not be loaded.";
  }

  return (
    <section className="max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link
          href="/admin/skins"
          className="transition-colors hover:text-foreground"
        >
          Skins
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span>{skin ? skin.name : "Edit skin"}</span>
      </nav>

      <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
        {skin ? skin.name : "Edit skin"}
      </h1>

      {loadError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface-raised p-5">
          <p className="text-sm font-medium text-foreground">
            Could not load this skin
          </p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
        </div>
      ) : skin ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">
              Editing the draft record. Changes are only visible once published
              through a release.
            </p>
            <SkinRowActions skin={skin} />
          </div>
          <div className="mt-6">
            <SkinForm mode="edit" skin={skin} heroOptions={heroOptions} />
          </div>
        </>
      ) : null}
    </section>
  );
}
