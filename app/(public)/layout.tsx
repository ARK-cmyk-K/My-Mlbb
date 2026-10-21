import type { ReactNode } from "react";

import { PublicNav } from "@/app/components/public-nav";

/**
 * Layout shared by every public route (homepage + collection explorer).
 *
 * The header lives here so navigation is available on all public pages
 * without each page repeating it (task 05-04).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />
      {children}
    </div>
  );
}
