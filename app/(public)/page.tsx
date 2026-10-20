import type { ReactNode } from "react";
import { useTheme } from "./layout";
import { contentService } from "@/app/lib/content";

export default function Home() {
  const { toggleTheme, theme } = useTheme();

  // Fetch active release and homepage sections
  const [activeRelease, setActiveRelease] = React.useState<{
    release: any;
    sections: any[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const release = await contentService.getActiveRelease();
        const sections = await contentService.getPublishedHomepageSections();
        setActiveRelease({ release, sections });
      } catch (e) {
        console.error("Failed to load public data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-24 text-center">
        <div className="animate-spin rounded-full border-4 border-border border-b-transparent w-8 h-8"></div>
        <p className="ml-4 text-lg leading-relaxed">Loading showcase…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Theme toggle in header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            MLBB Showcase
          </h1>
          <button
            onClick={toggleTheme}
            className="rounded-md bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent-text hover:bg-accent hover:text-accent-contrast transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        {activeRelease ? (
          <div className="prose lg:prose-2xl max-w-7xl mx-auto">
            {/* Hero explorer section */}
            <section className="mb-12">
              <h2 className="font-display text-xl font-semibold tracking-tight mb-4">
                Featured Heroes
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeRelease.release.heroes.map((hero: any) => (
                  <article
                    key={hero.id}
                    className="group rounded-lg border border-border p-4 hover:border-primary transition-colors"
                  >
                    <h3 className="font-medium text-primary line-clamp-2">{hero.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hero.primaryRole?.name || "No role assigned"}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            {/* Homepage sections */}
            <section className="mb-12">
              <h2 className="font-display text-xl font-semibold tracking-tight mb-4">
                {activeRelease.sections.length > 0 ? "Homepage Sections" : "No Homepage Sections"}
              </h2>
              {activeRelease.sections.length > 0 ? (
                <ul className="space-y-2">
                  {activeRelease.sections.map((section: any) => (
                    <li
                      key={section.sectionId}
                      className="flex items-center rounded-md px-3 py-2 bg-muted/50"
                    >
                      <span className="w-2 rounded-full bg-accent mr-3" />
                      <span>{section.sectionId}: {section.isEnabled ? "Enabled" : "Disabled"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No homepage sections configured yet. The public site will render
                  its default layout.
                </p>
              )}
            </section>

            {/* Stats strip */}
            <section className="mt-12 pt-8 border-t border-border">
              <h2 className="font-display text-xl font-semibold tracking-tight mb-4">
                Account Stats
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Total Heroes</p>
                  <p className="font-display text-3xl font-bold">
                    {activeRelease.release.heroes.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Published Skins</p>
                  <p className="font-display text-3xl font-bold">
                    {activeRelease.release.skins.length}
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="min-h-screen flex items-center justify-center bg-background px-6 py-24 text-center">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
              MLBB Showcase
            </h1>
            <p className="text-lg leading-relaxed text-muted">
              A premium personal Mobile Legends: Bang Bang account showcase.
            </p>
            <div className="mt-6">
              <p className="text-muted-foreground">
                No published release yet. The public site will display this state
                until a release is published through the admin workflow.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/50 py-6 text-xs text-muted-foreground">
        <p>
          MLBB Showcase — Built with Next.js 16, TypeScript, Tailwind CSS, and
          Supabase
        </p>
      </footer>
    </div>
  );
}