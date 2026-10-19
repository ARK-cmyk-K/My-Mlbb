import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "../../../auth/requireAdmin";
import { contentService } from "../../../lib/content";
import { isContentServiceError } from "../../../lib/content/errors";
import type { DraftHero } from "../../../lib/content/contracts";
import { isUuid } from "../../../lib/content/hero-form";
import { HeroForm } from "../hero-form";
import { HeroRowActions } from "../hero-row-actions";

/**
 * Edit a hero (task 03-01).
 *
 * Server component: re-checks authorization, then loads the single draft hero
 * through the admin-only content service. A missing hero (or a non-UUID id, which
 * could never match a `uuid` column) renders `not-found.tsx` rather than a raw
 * database error. Unexpected failures render a recoverable error panel.
 */

export default async function EditHeroPage(
  props: PageProps<"/admin/heroes/[id]">
) {
  await requireAdmin();
  const { id } = await props.params;

  if (!isUuid(id)) {
    notFound();
  }

  let hero: DraftHero | null = null;
  let loadError: string | null = null;
  try {
    hero = await contentService.getDraftHero(id);
  } catch (error) {
    if (isContentServiceError(error) && error.code === "NOT_FOUND") {
      notFound();
    }
    loadError = isContentServiceError(error)
      ? error.message
      : "This hero could not be loaded.";
  }

  return (
    <section className="max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link
          href="/admin/heroes"
          className="transition-colors hover:text-foreground"
        >
          Heroes
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span>{hero ? hero.name : "Edit hero"}</span>
      </nav>

      <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
        {hero ? hero.name : "Edit hero"}
      </h1>

      {loadError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface-raised p-5">
          <p className="text-sm font-medium text-foreground">
            Could not load this hero
          </p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
        </div>
      ) : hero ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">
              Editing the draft record. Changes are only visible once published
              through a release.
            </p>
            <HeroRowActions hero={hero} />
          </div>
          <div className="mt-6">
            <HeroForm mode="edit" hero={hero} />
          </div>
        </>
      ) : null}
    </section>
  );
}
