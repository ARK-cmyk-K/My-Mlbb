"use client";

import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

/**
 * Accessible modal shell for the quick view and the comparison modal
 * (task 05-05).
 *
 * The shell owns every overlay behaviour so the two modals cannot drift:
 *
 * - **Semantics** — `role="dialog"`, `aria-modal="true"` and an accessible
 *   name supplied by the caller (`aria-labelledby`).
 * - **Escape** — closes the modal from anywhere inside it.
 * - **Focus management** — focus moves into the panel when it opens and is
 *   returned to the element that opened it when it closes.
 * - **Focus trap** — `Tab` / `Shift+Tab` cycle inside the panel, so the page
 *   behind the modal cannot be reached by keyboard.
 * - **Scroll lock** — the page behind the modal cannot be scrolled.
 * - **Reduced motion** — the entrance animation is dropped for visitors who
 *   ask for reduced motion (`motion-reduce:animate-none`); the global
 *   `prefers-reduced-motion` block in `app/globals.css` is the second guard.
 * - **Responsive** — a bottom sheet on small screens, a centred panel from the
 *   `sm` breakpoint up.
 *
 * The component is mounted only while the modal is open, so "open" and
 * "mounted" are the same thing and the cleanup below always runs when the
 * modal closes.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export interface ModalShellProps {
  /** Id of the element that names the dialog. */
  labelledBy: string;
  /** Called when the visitor asks to close the modal. */
  onClose: () => void;
  /** Panel content. */
  children: ReactNode;
  /** Extra classes for the panel (e.g. to widen it). */
  panelClassName?: string;
  /**
   * Element that should receive focus when the modal opens.
   *
   * Defaults to the panel itself, which makes assistive technology announce
   * the dialog's name. A dialog whose first job is to accept input (the
   * global search) points this at its input instead.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function ModalShell({
  labelledBy,
  onClose,
  children,
  panelClassName = "",
  initialFocusRef,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // The close handler is kept in a ref so the effect below (which installs the
  // key handlers and captures the focus) is not re-run on every render.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const panel = panelRef.current;
    // Focus the requested element, or the panel itself so assistive technology
    // announces the dialog's name as it opens. Tab then moves into the
    // content, because the trap below pulls focus back in whenever it would
    // otherwise leave the panel.
    const initial = initialFocusRef?.current ?? null;
    if (initial) {
      initial.focus();
    } else {
      panel?.focus();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

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
  }, [initialFocusRef]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        onClick={() => onCloseRef.current()}
        className="fixed inset-0 h-full w-full cursor-default animate-[mlbb-modal-backdrop-in_150ms_ease-out] bg-black/70 motion-reduce:animate-none"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[92dvh] w-full max-w-2xl animate-[mlbb-modal-panel-in_180ms_ease-out] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl outline-none motion-reduce:animate-none sm:max-h-[88dvh] sm:rounded-2xl ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
