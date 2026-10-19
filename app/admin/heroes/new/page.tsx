import Link from "next/link";

import { requireAdmin } from "../../../auth/requireAdmin";
import { HeroForm } from "../hero-form";

/**
 * Create a hero (task 03-01).
 *
 * Authorization is re-checked server-side; the form posts to the `createHeroAction`
 * Server Action, which re-validates and authorizes again before writing a draft.
 */

export default async function NewHeroPage() {
  await requireAdmin();

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
        <span>New hero</span>
      </nav>

      <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
        New hero
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Heroes are created as drafts. Nothing here becomes public until a release
        is published.
      </p>

      <div className="mt-6">
        <HeroForm mode="create" />
      </div>
    </section>
  );
}
