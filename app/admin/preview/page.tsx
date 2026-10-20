import Link from "next/link";
import { requireAdmin } from "../../auth/requireAdmin";
import { contentService } from "../../lib/content";
import { ContentServiceError, isContentServiceError } from "../../lib/content/errors";
import { PlaceholderPanel } from "../_components/placeholder-panel";

type PreviewPageProps = {
  searchParams: Promise<{ notice?: string; preset?: string }>;
};

const PRESET_LABELS = {
  desktop: "Desktop (1440px)",
  tablet: "Tablet (768px)",
  mobile: "Mobile (375px)",
};

export default async function PreviewPage({ searchParams }: PreviewPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const notice =
    typeof params.notice === "string"
      ? { saved: "Appearance settings saved to draft.", homepage_saved: "Homepage sections saved to draft." }[params.notice]
      : undefined;

  let loadError: string | null = null;
  let appearanceSettings: Awaited<ReturnType<typeof contentService.getDraftAppearanceSettings>> | null = null;
  let draftHeroes: Awaited<ReturnType<typeof contentService.listDraftHeroes>> | null = null;
  let draftHomepageSections: Awaited<ReturnType<typeof contentService.listDraftHomepageSections>> | null = null;

  try {
    [
      appearanceSettings,
      draftHeroes,
      draftHomepageSections,
    ] = await Promise.all([
      contentService.getDraftAppearanceSettings(),
      contentService.listDraftHeroes({ includeArchived: true }),
      contentService.listDraftHomepageSections(),
    ]);
  } catch (error) {
    loadError = isContentServiceError(error)
      ? error.message
      : "The preview could not be loaded.";
    if (
      error instanceof ContentServiceError &&
      (error.code === "UNAUTHENTICATED" || error.code === "UNAUTHORIZED")
    ) {
      throw error;
    }
  }

  const presetParam = typeof params.preset === "string" ? params.preset : "desktop";
  const preset: "desktop" | "tablet" | "mobile" =
    presetParam === "tablet" || presetParam === "mobile" ? presetParam : "desktop";

  return (
    <PlaceholderPanel
      title="Preview"
      description="Preview the public showcase at common viewport sizes before publishing."
      task="04-04"
      points={[
        "Responsive preview for mobile, tablet and desktop.",
        "Renders published-safe content from the draft working set.",
        "No public URL is affected until a release is published.",
      ]}
    >
      {/* Preview state label — visible to admin only */}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-foreground mt-3"
        >
          {notice}
        </p>
      )}

      {loadError ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-foreground mt-3"
        >
          {loadError}
        </div>
      ) : null}

      {/* Viewport preset controls */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          className={`rounded-md border border-2 ${
            preset === "desktop"
              ? "border-primary bg-primary-soft text-primary-fg"
              : "border-transparent text-muted hover:bg-surface-raised hover:text-foreground"
          } ${preset === "desktop" ? "active" : ""} px-4 py-2 text-sm font-medium`}

        >
          Desktop
        </button>
        <button
          type="button"
          className={`rounded-md border border-2 ${
            preset === "tablet"
              ? "border-primary bg-primary-soft text-primary-fg"
              : "border-transparent text-muted hover:bg-surface-raised hover:text-foreground"
          } ${preset === "tablet" ? "active" : ""} px-4 py-2 text-sm font-medium`}

        >
          Tablet
        </button>
        <button
          type="button"
          className={`rounded-md border border-2 ${
            preset === "mobile"
              ? "border-primary bg-primary-soft text-primary-fg"
              : "border-transparent text-muted hover:bg-surface-raised hover:text-foreground"
          } ${preset === "mobile" ? "active" : ""} px-4 py-2 text-sm font-medium`}

        >
          Mobile
        </button>
      </div>

      {/* Responsive preview grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Desktop preview card */}
        <div
          className={`p-6 rounded-lg border border-border bg-surface ${preset === "desktop" ? "border-primary" : ""} transition-colors`}
          style={{ minHeight: "420px" }}
        >
          <h3 className="font-display text-lg font-semibold text-foreground mb-4">
            {PRESET_LABELS.desktop}
          </h3>

          {/* Hero cards grid for desktop */}
          {draftHeroes && draftHeroes.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {draftHeroes.map((hero) => (
                <div
                  key={hero.id}
                  className="border rounded-md bg-background p-4 hover:bg-surface-raised transition-colors"
                >
                  <h4 className="font-medium text-foreground truncate">{hero.name}</h4>
                  <p className="text-muted text-sm mt-1">
                    Role: {hero.primaryRole || "—"}
                  </p>
                  <p className="text-muted text-xs mt-1">
                    Mastery: {hero.masteryLevel || "—"} / 100
                  </p>
                  <p className="text-muted text-xs mt-1">
                    Win rate: {hero.winRate !== undefined ? `${hero.winRate}%` : "—"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">
              No draft heroes. <Link href="/admin/heroes">Add heroes first</Link>.
            </p>
          )}

          {/* Homepage sections */}
          {draftHomepageSections && draftHomepageSections.length > 0 ? (
            <div className="mt-6 space-y-3">
              {draftHomepageSections.map((section) => (
                <div
                  key={section.sectionId}
                  className="px-2 py-1 rounded text-sm"
                >
                  {section.sectionId}
                </div>
              ))}
            </div>
          ) : null}

          {/* Appearance settings summary */}
          {appearanceSettings && (
            <div className="mt-6 p-4 bg-surface-raised rounded-md">
              <h4 className="font-display text-sm font-medium text-foreground mb-2">
                Appearance (draft)
              </h4>
              <p className="text-muted text-xs">
                Theme: {appearanceSettings.themePreset || "—"}
              </p>
              <p className="text-muted text-xs">
                Primary accent: {appearanceSettings.primaryAccent || "—"}
              </p>
              <p className="text-muted text-xs">
                Secondary accent: {appearanceSettings.secondaryAccent || "—"}
              </p>
            </div>
          )}
        </div>

        {/* Tablet preview card */}
        <div
          className={`p-4 rounded-lg border border-border bg-surface ${preset === "tablet" ? "border-primary" : ""} transition-colors`}
          style={{ minHeight: "420px" }}
        >
          <h3 className="font-display text-lg font-semibold text-foreground mb-3">
            {PRESET_LABELS.tablet}
          </h3>

          {/* Simplified hero cards for tablet */}
          {draftHeroes && draftHeroes.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {draftHeroes.map((hero) => (
                <div
                  key={hero.id}
                  className="border rounded-md bg-background p-3 hover:bg-surface-raised transition-colors"
                >
                  <h5 className="font-medium text-foreground truncate">{hero.name}</h5>
                  <p className="text-muted text-xs">
                    Role: {hero.primaryRole || "—"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">
              No draft heroes.
            </p>
          )}

          {/* Homepage sections */}
          {draftHomepageSections && draftHomepageSections.length > 0 ? (
            <div className="mt-3 space-y-2">
              {draftHomepageSections.map((section) => (
                <div
                  key={section.sectionId}
                  className="px-1 py-0.5 rounded text-xs"
                >
                  {section.sectionId}
                </div>
              ))}
            </div>
          ) : null}

          {/* Appearance summary */}
          {appearanceSettings && (
            <div className="mt-3 p-2 bg-surface-raised rounded-md">
              <p className="text-xs">
                Theme: {appearanceSettings.themePreset || "—"}
              </p>
            </div>
          )}
        </div>

        {/* Mobile preview card */}
        <div
          className={`p-3 rounded-lg border border-border bg-surface ${preset === "mobile" ? "border-primary" : ""} transition-colors`}
          style={{ minHeight: "420px" }}
        >
          <h3 className="font-display text-sm font-semibold text-foreground mb-2">
            {PRESET_LABELS.mobile}
          </h3>

          {/* Single hero line for mobile */}
          {draftHeroes && draftHeroes.length > 0 ? (
            <div>
              {draftHeroes.map((hero) => (
                <div
                  key={hero.id}
                  className="border rounded-md bg-background p-2 hover:bg-surface-raised transition-colors"
                >
                  <span className="font-medium text-foreground truncate">{hero.name}</span>
                  <span className="text-xs text-muted">
                    {hero.primaryRole || "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">
              No draft heroes.
            </p>
          )}

          {/* Homepage sections */}
          {draftHomepageSections && draftHomepageSections.length > 0 ? (
            <div className="mt-2 text-xs">
              {draftHomepageSections.map((section) => (
                <div
                  key={section.sectionId}
                  className="px-1 py-0.5 rounded"
                >
                  {section.sectionId}
                </div>
              ))}
            </div>
          ) : null}

          {/* Appearance summary */}
          {appearanceSettings && (
            <div className="mt-2 text-xs">
              <p className="text-xs">
                Theme: {appearanceSettings.themePreset || "—"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Persistent preview-state label at bottom */}
      <p
        className="mt-6 text-sm"
        style={{ color: "#6b7280" }}
      >
        Preview state: <span className="font-medium" style={{ color: "#18181b" }}>
          {preset} view
        </span> — draft data only. No changes affect the public site until a release is published.
      </p>
    </PlaceholderPanel>
  );
}