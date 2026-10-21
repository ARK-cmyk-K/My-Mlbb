import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared navigation link (task 05-01).
 *
 * Rendered as a real Next.js link so navigation stays client-side; the caller
 * decides what "active" means (the public header derives it from the
 * pathname).
 */
export function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: ReactNode;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted hover:text-foreground"
        }`}
      >
        {children}
      </Link>
    </li>
  );
}
