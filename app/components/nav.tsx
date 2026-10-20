import { useTheme } from "@/app/(public)/layout";
import { useEffect, useState } from "react";
import { contentService } from "@/app/lib/content";

export function PublicNav() {
  const { toggleTheme } = useTheme();
  const [activeRelease, setActiveRelease] = useState<
    | { release: any; sections: any[] }
    | null
  >(null);
  const [sections, setSections] = useState<any[]>([]);

  // Fetch data on mount
  useEffect(() => {
    async function load() {
      try {
        const release = await contentService.getActiveRelease();
        const fetchedSections = await contentService.getPublishedHomepageSections();
        setActiveRelease(release);
        setSections(fetchedSections);
      } catch (e) {
        console.error("Failed to load public nav data:", e);
      }
    }
    load();
  }, []);

  return (
    <nav className="flex items-center justify-between rounded-md px-4 py-3 mb-6 bg-surface-raised">
      <div className="flex items-center gap-3">
        {/* Logo / Site Name */}
        <a
          href="/"
          className="font-display text-xl font-semibold tracking-tick text-primary"
        >
          MLBB Showcase
        </a>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-md p-2 text-primary/70 hover:text-primary transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M17.293 13.293a8 8 0 01-11.314 1.414L3 7.414l9.293 9.293a8 8 0 11-11.313-11.314L4.707 10a8.02 8.02 0 011.528-5.472q.377-.39.895-.39t.905.017q.39.39.39.905l-5.472 5.472a8 8 0 01-1.414 1.414l5.293 5.293-5.293 5.293a8 8 0 11-11.313-11.314l9.293-9.293a8 8 0 011.414 1.414l-9.293 9.293Z"
            />
          </svg>
        </button>
      </div>

      {/* Navigation links - adaptive based on released state */}
      <ul className="flex items-center gap-6 text-sm">
        <li>
          <a
            href="/"
            className="relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Home
          </a>
        </li>

        {/* Hero explorer - only shows if there's a published release */}
        {activeRelease && (
          <li>
            <a
              href="/heroes"
              className="relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Heroes
            </a>
          </li>
        )}

        {/* Skin explorer - only shows if there's a published release */}
        {activeRelease && (
          <li>
            <a
              href="/skins"
              className="relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Skins
            </a>
          </li>
        )}

        {/* Homepage sections - only shows if sections exist */}
        {sections.length > 0 && (
          <li>
            <a
              href="/"
              className="relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Sections
            </a>
          </li>
        )}

        {/* CTA for no-release state */}
        {!activeRelease && (
          <li>
            <a
              href="/"
              className="relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors text-primary-soft hover:bg-primary/10"
            >
              Publish Your First Release
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}