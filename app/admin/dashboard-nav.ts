/**
 * Dashboard navigation model (task 02-02).
 *
 * A single source of truth for the private dashboard information architecture.
 * Both the sidebar and the contextual workspace header read from here, so new
 * sections only need one entry when later tasks ship them.
 *
 * No React / Next imports here on purpose: this is a plain data module that is
 * safe to import from both server and client components.
 */

export type DashboardIconName =
  | "overview"
  | "heroes"
  | "skins"
  | "media"
  | "data"
  | "appearance"
  | "preview"
  | "releases"
  | "sign-out";

export interface DashboardNavItem {
  /** Stable id, also used by the icon component. */
  id: DashboardIconName;
  /** Short label shown in the sidebar and breadcrumb. */
  label: string;
  /** Route this item links to. */
  href: string;
  /** One-line explanation of what will live here. */
  description: string;
  /** Task ids that will implement the real feature (shell is a placeholder). */
  task: string;
}

export interface DashboardNavGroup {
  id: string;
  label: string;
  items: DashboardNavItem[];
}

/**
 * The dashboard is grouped into modules so the sidebar stays readable as later
 * phases add real editors. Nothing here performs or implies a backend action.
 */
export const dashboardNav: DashboardNavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: "/admin",
        description: "Private workspace home and current status.",
        task: "02-02",
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      {
        id: "heroes",
        label: "Heroes",
        href: "/admin/heroes",
        description: "Hero records, roles, mastery and signature state.",
        task: "03-01",
      },
      {
        id: "skins",
        label: "Skins",
        href: "/admin/skins",
        description: "Skin records, rarity, series and acquisition data.",
        task: "03-02",
      },
      {
        id: "media",
        label: "Media",
        href: "/admin/media",
        description: "Portraits and splash art stored in Supabase Storage.",
        task: "02-04",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      {
        id: "data",
        label: "Import and export",
        href: "/admin/import-export",
        description: "CSV import with dry run, JSON/SQL backups and restore.",
        task: "03-03 to 03-06",
      },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    items: [
      {
        id: "appearance",
        label: "Appearance",
        href: "/admin/appearance",
        description: "Design tokens, homepage sections and safe custom CSS.",
        task: "04-01 to 04-03",
      },
      {
        id: "preview",
        label: "Preview",
        href: "/admin/preview",
        description: "Responsive preview of the public showcase.",
        task: "04-04",
      },
    ],
  },
  {
    id: "release",
    label: "Release",
    items: [
      {
        id: "releases",
        label: "Releases",
        href: "/admin/releases",
        description: "Diffs, snapshots, publishing, scheduling and rollback.",
        task: "04-05 to 04-06",
      },
    ],
  },
];

/** Flat list of every navigation item, in sidebar order. */
export const dashboardNavItems: DashboardNavItem[] = dashboardNav.flatMap(
  (group) => group.items
);

/**
 * Finds the navigation item that best matches a pathname.
 *
 * Exact matches win. Otherwise the deepest item whose route is a prefix of the
 * pathname wins (so a nested editor keeps its section highlighted). The
 * overview route is exact-only, otherwise it would match every `/admin/*` URL.
 */
export function findNavItem(
  pathname: string,
  items: DashboardNavItem[] = dashboardNavItems
): DashboardNavItem | undefined {
  const exact = items.find((item) => item.href === pathname);
  if (exact) {
    return exact;
  }

  const nested = items
    .filter(
      (item) =>
        item.href !== "/admin" &&
        (pathname === item.href || pathname.startsWith(`${item.href}/`))
    )
    .sort((a, b) => b.href.length - a.href.length);

  return nested[0];
}
