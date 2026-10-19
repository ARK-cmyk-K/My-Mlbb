import type { ReactNode, SVGProps } from "react";

import type { DashboardIconName } from "./dashboard-nav";

/**
 * Line icons for the dashboard sidebar (task 02-02).
 *
 * Inline SVGs keep the shell dependency-free. They are decorative: the link
 * text always carries the meaning, and every icon is `aria-hidden`.
 */
const paths: Record<DashboardIconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  heroes: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  skins: (
    <>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="m4 7 8 4 8-4" />
      <path d="M12 11v10" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-4.5-4.5L7 20" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v14c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
    </>
  ),
  appearance: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H13a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-2.8-3.6-5-9-5Z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="11" cy="7" r="1" />
      <circle cx="16" cy="8" r="1" />
    </>
  ),
  preview: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </>
  ),
  releases: (
    <>
      <path d="M5 15c-1.5 1.5-2 6-2 6s4.5-.5 6-2" />
      <path d="M9 13 4 12l1.5-3.5L9 8" />
      <path d="M11 15l1 5 3.5-1.5L16 15" />
      <path d="M9 8c0-4 3-6 7-6 0 4-2 7-6 7l-1-1Z" />
      <circle cx="14.5" cy="6.5" r="1" />
    </>
  ),
  "sign-out": (
    <>
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </>
  ),
};

export interface DashboardIconProps
  extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: DashboardIconName;
}

export function DashboardIcon({ name, ...props }: DashboardIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
