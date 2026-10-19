"use client";

import { useEffect } from "react";

export default function SkinsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
        Skins
      </h1>
      <div className="mt-4 rounded-lg border border-border bg-surface-raised p-5">
        <p className="text-sm font-medium text-foreground">
          Something went wrong while loading skins.
        </p>
        <p className="mt-2 text-sm text-muted">{error.message}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Try again
        </button>
      </div>
    </section>
  );
}
