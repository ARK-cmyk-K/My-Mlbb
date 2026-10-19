import Link from "next/link";

import { requireAdmin } from "../../../auth/requireAdmin";
import { contentService } from "../../../lib/content";
import { isContentServiceError } from "../../../lib/content/errors";
import type { SkinHeroOption } from "../../../lib/content/skin-form";
import { SkinForm } from "../skin-form";

/**
 * Create a skin (task 03-02).
 *
 * Authorization is re-checked server-side; the form posts to the `createSkinAction`
 * Server Action, which re-validates and authorizes again before writing a draft.
 * The hero options are loaded server-side so the browser never queries drafts.
 */

export default async function NewSkinPage() {
  await requireAdmin();

  let heroOptions: SkinHeroOption[] = [];
  let loadError: string | null = null;
  try {
    const heroes = await contentService.listDraftHeroes({
      includeArchived: true,
    });
    heroOptions = heroes.map((hero) => ({
      value: hero.id,
      label:
        hero.publicationState === "archived"
          ? `${hero.name} (archived)`
          : hero.name,
    }));
  } catch (error) {
    loadError = isContentServiceError(error)
      ? error.message
      : "The hero list could not be loaded.";
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
        <span>New skin</span>
      </nav>

      <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
        New skin
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Skins are created as drafts. Nothing here becomes public until a release
        is published.
      </p>

      {loadError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface-raised p-5">
          <p className="text-sm font-medium text-foreground">
            Could not load the hero list
          </p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <p className="mt-2 text-xs text-muted">
            The hero association selector needs this list. Hero references are
            checked again on the server when you save.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <SkinForm mode="create" heroOptions={heroOptions} />
        </div>
      )}
    </section>
  );
}
