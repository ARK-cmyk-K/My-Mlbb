import Link from "next/link";

export default function SkinNotFound() {
  return (
    <section className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
        Skin not found
      </h1>
      <p className="mt-2 text-muted">
        The skin you requested does not exist or may have been deleted.
      </p>
      <Link
        href="/admin/skins"
        className="mt-4 inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Back to skins
      </Link>
    </section>
  );
}
