import { requireAdmin } from "../../auth/requireAdmin";
import { contentService } from "../../lib/content";
import { ContentServiceError, isContentServiceError } from "../../lib/content/errors";
import { AppearanceForm } from "./appearance-form";
import { HomepageSectionsEditor } from "./homepage-sections-editor";

const NOTICE_MESSAGES: Record<string, string> = {
  saved: "Appearance settings saved to draft.",
  homepage_saved: "Homepage sections saved to draft.",
};

type AppearancePageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function AppearancePage({ searchParams }: AppearancePageProps) {
  await requireAdmin();

  const params = await searchParams;
  const notice =
    typeof params.notice === "string" ? NOTICE_MESSAGES[params.notice] : undefined;

  let settings = null;
  let homepageSections: Awaited<ReturnType<typeof contentService.listDraftHomepageSections>> | null = null;
  let loadError: string | null = null;
  try {
    [settings, homepageSections] = await Promise.all([
      contentService.getDraftAppearanceSettings(),
      contentService.listDraftHomepageSections(),
    ]);
  } catch (error) {
    loadError = isContentServiceError(error)
      ? error.message
      : "The appearance settings could not be loaded.";
    if (
      error instanceof ContentServiceError &&
      (error.code === "UNAUTHENTICATED" || error.code === "UNAUTHORIZED")
    ) {
      throw error;
    }
  }

  return (
    <section className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Appearance
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Tokenised theming, homepage composition and a safe subset of custom
            CSS. Settings here are saved to draft only and published via releases.
          </p>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-foreground"
        >
          {notice}
        </p>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-foreground"
        >
          {loadError}
        </div>
      ) : null}

      {settings ? <AppearanceForm settings={settings} /> : null}

      <div className="mt-10 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
            Homepage sections
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Enable and reorder the approved homepage modules. Changes are saved to draft only.
          </p>
        </div>
        {homepageSections ? <HomepageSectionsEditor sections={homepageSections} /> : null}
      </div>
    </section>
  );
}
