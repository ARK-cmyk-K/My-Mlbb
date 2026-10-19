"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { DashboardIcon } from "./dashboard-icons";
import { dashboardNav, findNavItem } from "./dashboard-nav";
import { signOutAction } from "../actions/auth-actions";

const STORAGE_KEY = "mlbb-admin-sidebar-collapsed";
const MOBILE_DRAWER_ID = "admin-mobile-navigation";
const DESKTOP_SIDEBAR_ID = "admin-desktop-sidebar";

/**
 * Tiny external store for the desktop collapse preference.
 *
 * `useSyncExternalStore` lets the server render the default (expanded) markup
 * and the client adopt the stored value after hydration without a
 * setState-in-effect cascade. Other tabs stay in sync via the `storage` event.
 */
let collapsedCache: boolean | null = null;
const collapsedListeners = new Set<() => void>();

function readCollapsed(): boolean {
  if (collapsedCache === null) {
    try {
      collapsedCache = window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      collapsedCache = false;
    }
  }
  return collapsedCache;
}

function subscribeCollapsed(listener: () => void): () => void {
  collapsedListeners.add(listener);
  const onStorage = () => {
    collapsedCache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    collapsedListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeCollapsed(next: boolean): void {
  collapsedCache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Ignore storage failures; the toggle still works for this session.
  }
  collapsedListeners.forEach((listener) => listener());
}

/**
 * Interactive chrome for the private dashboard (task 02-02).
 *
 * This is a Client Component because it owns presentation-only state:
 *   - desktop sidebar collapse (persisted in localStorage),
 *   - the mobile navigation drawer (open/close, Escape, focus trap),
 *   - active-route highlighting via `usePathname`.
 *
 * It intentionally performs NO authorization and holds NO data. The server
 * layout calls `requireAdmin()` before this component ever renders.
 */
export function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false
  );

  // The drawer is tied to the route it was opened on, so navigation closes it
  // without an effect. `null` means closed.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const mobileOpen = openPath === pathname;

  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(!readCollapsed());
  }, []);

  // Focus management, Escape-to-close, focus trap, and scroll lock for the
  // mobile drawer.
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>("a, button")?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenPath(null);
        return;
      }

      if (event.key !== "Tab" || !drawer) {
        return;
      }

      const focusable = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground lg:flex-row">
      <a
        href="#admin-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
      >
        Skip to workspace content
      </a>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpenPath(pathname)}
          aria-label="Open dashboard navigation"
          aria-expanded={mobileOpen}
          aria-controls={MOBILE_DRAWER_ID}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-surface-raised"
        >
          <MenuIcon />
        </button>
        <Brand collapsed={false} />
      </header>

      {/* Desktop sidebar */}
      <aside
        id={DESKTOP_SIDEBAR_ID}
        aria-label="Dashboard sidebar"
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[4.75rem]" : "w-64"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Brand collapsed={collapsed} />
        </div>

        <SidebarNav collapsed={collapsed} />

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={DESKTOP_SIDEBAR_ID}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <ChevronIcon collapsed={collapsed} />
            <span className={collapsed ? "sr-only" : undefined}>
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </span>
          </button>

          <SignOutForm collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile navigation drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard navigation"
            tabIndex={-1}
            onClick={() => setOpenPath(null)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <div
            ref={drawerRef}
            id={MOBILE_DRAWER_ID}
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-border bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={() => setOpenPath(null)}
                aria-label="Close dashboard navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-surface-raised"
              >
                <CloseIcon />
              </button>
            </div>

            <SidebarNav collapsed={false} onNavigate={() => setOpenPath(null)} />

            <div className="border-t border-border p-3">
              <SignOutForm collapsed={false} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader />
        <main
          id="admin-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

interface SidebarNavProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {dashboardNav.map((group) => (
        <div key={group.id} className="mb-5 last:mb-0">
          <p
            className={`px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted ${
              collapsed ? "sr-only" : ""
            }`}
          >
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = current?.id === item.id;

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-md border-l-2 px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary-soft font-medium text-foreground"
                        : "border-transparent text-muted hover:bg-surface-raised hover:text-foreground"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    <DashboardIcon
                      name={item.id}
                      className={active ? "text-primary" : undefined}
                    />
                    <span className={collapsed ? "sr-only" : undefined}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Contextual workspace header: where the admin is, plus reserved slots for the
 * draft / published / unsaved markers that later tasks will drive. The slots
 * deliberately read as empty — they must not imply a backend operation
 * succeeded (see task 02-02 requirements).
 */
function WorkspaceHeader() {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const isOverview = !current || current.href === "/admin";

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm">
            <li>
              {isOverview ? (
                <span className="font-medium text-foreground">Admin</span>
              ) : (
                <Link
                  href="/admin"
                  className="text-muted transition-colors hover:text-foreground"
                >
                  Admin
                </Link>
              )}
            </li>
            {!isOverview ? (
              <>
                <li aria-hidden="true" className="text-muted">
                  /
                </li>
                <li aria-current="page" className="font-medium text-foreground">
                  {current.label}
                </li>
              </>
            ) : null}
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <StatusSlot
            label="Draft"
            hint="Draft status will be provided by the draft/published state service (task 02-03)."
          />
          <StatusSlot
            label="Published"
            hint="Published release status will be provided by the release workspace (tasks 04-05 and 04-06)."
          />
          <StatusSlot
            label="Unsaved changes"
            hint="Unsaved-change tracking is added with the content editors (Phase 3)."
          />
        </div>
      </div>
    </div>
  );
}

function StatusSlot({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      title={hint}
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-border-strong"
      />
      <span className="font-medium text-foreground">{label}</span>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{hint}</span>
    </span>
  );
}

/**
 * Sign-out control (task 02-01). Posts to the `signOutAction` Server Action,
 * which revokes the Supabase session on the server and redirects to `/login`.
 * Rendered here so it is always reachable from the private chrome.
 */
function SignOutForm({ collapsed }: { collapsed: boolean }) {
  return (
    <form action={signOutAction} className="mt-1">
      <button
        type="submit"
        title={collapsed ? "Sign out" : undefined}
        className={`inline-flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-foreground ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <DashboardIcon name="sign-out" className="shrink-0" />
        <span className={collapsed ? "sr-only" : undefined}>Sign out</span>
      </button>
    </form>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/admin"
      className={`flex min-w-0 items-center gap-2 ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg"
      >
        M
      </span>
      <span className={`min-w-0 ${collapsed ? "sr-only" : ""}`}>
        <span className="block truncate font-display text-sm font-semibold text-foreground">
          MLBB Showcase
        </span>
        <span className="block truncate text-xs text-muted">
          Admin dashboard
        </span>
      </span>
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
