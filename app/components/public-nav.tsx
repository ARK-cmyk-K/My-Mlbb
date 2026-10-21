"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavLink } from "@/app/components/nav";
import { GlobalSearch } from "@/app/components/search/global-search";

/**
 * Site-wide header for the public routes (task 05-04).
 *
 * The explorer is only useful if visitors can find it, and before this the
 * public pages had no navigation between them at all. Kept deliberately
 * minimal: a wordmark back to the homepage plus the two public
 * destinations, with the active link derived from the pathname so the header
 * renders identically on the server and after client navigation.
 *
 * The global search (task `06-01`) lives in the header too, so Cmd/Ctrl+K
 * works from every public page.
 */
const PUBLIC_LINKS = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  {
    href: "/collection",
    label: "Collection",
    match: (path: string) => path.startsWith("/collection"),
  },
] as const;

export function PublicNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-3"
      >
        <Link
          href="/"
          className="mr-3 font-display text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          MLBB Showcase
        </Link>
        <ul className="flex items-center gap-1">
          {PUBLIC_LINKS.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              active={link.match(pathname)}
            >
              {link.label}
            </NavLink>
          ))}
        </ul>
        <div className="ml-auto">
          <GlobalSearch />
        </div>
      </nav>
    </header>
  );
}
