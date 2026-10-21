import type { ReactNode } from "react";

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
      <a
        href={href}
        className={`relative inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          active ? "text-primary bg-primary/10" : "text-muted hover:text-foreground"
        }`}
      >
        {children}
      </a>
    </li>
  );
}