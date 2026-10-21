"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import type { FavoriteTarget } from "@/app/lib/favorites/favorites-model";
import {
  DISCORD_SHARE_TARGET,
  buildShareContent,
  buildShareIntent,
  canShareNatively,
  resolveShareOrigin,
  type ShareContent,
} from "@/app/lib/favorites/share-model";

/**
 * One-click sharing for a published entry (task `05-06`).
 *
 * The transports:
 *
 * - **Native share** — used when the browser offers a share sheet, because
 *   that is what a phone user expects.
 * - **X** and **Telegram** — third-party intent URLs built from the canonical
 *   public URL and the shared sentence.
 * - **Discord** — Discord has no public "share this link" intent, so the
 *   message is copied to the clipboard and the visitor is taken to their own
 *   Discord home, ready to paste it into any channel.
 * - **Copy link** — always available, and the fallback when the clipboard
 *   API is unavailable.
 *
 * Only published data is shared: the entry's display name, its public context
 * and the canonical public URL. No draft row, no private media id and no
 * internal identifier ever reaches a third-party service.
 *
 * The component never touches `window` during render — the native share
 * support is read through `useSyncExternalStore` (server snapshot: "not
 * supported"), and the origin is resolved when a share action is triggered.
 */

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong";

/** The native share support never changes while the page is open. */
function subscribeToNothing(): () => void {
  return () => {};
}

export interface ShareActionsProps {
  /** The published entry being shared. */
  target: FavoriteTarget;
  /** Short public context line (rarity, role, …) included in the message. */
  context?: string | null;
  className?: string;
}

export function ShareActions({
  target,
  context = null,
  className = "",
}: ShareActionsProps) {
  const [status, setStatus] = useState<string | null>(null);

  const kind = target.kind;
  const id = target.id;
  const name = target.name;
  const slug = target.slug;

  const resolveContent = useCallback((): ShareContent | null => {
    const origin = resolveShareOrigin(
      process.env.NEXT_PUBLIC_SITE_URL,
      typeof window === "undefined" ? null : window.location.origin
    );
    if (origin === "") {
      return null;
    }
    return buildShareContent(origin, { kind, id, name, slug, context });
  }, [kind, id, name, slug, context]);

  const getSnapshot = useCallback(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    const content = resolveContent();
    return content ? canShareNatively(navigator, content) : false;
  }, [resolveContent]);
  const getServerSnapshot = useCallback(() => false, []);

  const nativeAvailable = useSyncExternalStore(
    subscribeToNothing,
    getSnapshot,
    getServerSnapshot
  );

  async function copyText(text: string): Promise<boolean> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the manual path below.
    }
    return false;
  }

  async function shareNative() {
    const content = resolveContent();
    if (!content) {
      setStatus("Sharing is not available because the site address is unknown.");
      return;
    }
    try {
      await navigator.share({
        title: content.title,
        text: content.text,
        url: content.url,
      });
      setStatus(null);
    } catch {
      // The visitor dismissed the share sheet — that is not an error.
      setStatus(null);
    }
  }

  function openIntent(network: "x" | "telegram") {
    const content = resolveContent();
    if (!content) {
      setStatus("Sharing is not available because the site address is unknown.");
      return;
    }
    const intent = buildShareIntent(network, content);
    if (!intent) {
      return;
    }
    window.open(intent, "_blank", "noopener,noreferrer");
    setStatus(
      network === "x"
        ? "Opening X with the message ready to post."
        : "Opening Telegram with the message ready to send."
    );
  }

  async function shareDiscord() {
    const content = resolveContent();
    if (!content) {
      setStatus("Sharing is not available because the site address is unknown.");
      return;
    }
    const copied = await copyText(`${content.text} ${content.url}`);
    window.open(DISCORD_SHARE_TARGET, "_blank", "noopener,noreferrer");
    setStatus(
      copied
        ? "The message was copied — paste it into any Discord channel."
        : "Copy the link below and paste it into any Discord channel."
    );
  }

  async function copyLink() {
    const content = resolveContent();
    if (!content) {
      setStatus("Sharing is not available because the site address is unknown.");
      return;
    }
    const copied = await copyText(content.url);
    setStatus(copied ? "The link was copied." : `Copy this link: ${content.url}`);
  }

  return (
    <span className={className}>
      <span className="flex flex-wrap gap-2">
        {nativeAvailable ? (
          <button
            type="button"
            onClick={() => void shareNative()}
            className={BUTTON_BASE}
          >
            Share
            <span className="sr-only">
              {` ${target.name} using your device's share menu`}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => openIntent("x")}
          className={BUTTON_BASE}
        >
          X
          <span className="sr-only">{` — share ${target.name} on X`}</span>
        </button>
        <button
          type="button"
          onClick={() => openIntent("telegram")}
          className={BUTTON_BASE}
        >
          Telegram
          <span className="sr-only">{` — share ${target.name} on Telegram`}</span>
        </button>
        <button
          type="button"
          onClick={() => void shareDiscord()}
          className={BUTTON_BASE}
        >
          Discord
          <span className="sr-only">{` — share ${target.name} on Discord`}</span>
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className={BUTTON_BASE}
        >
          Copy link
          <span className="sr-only">{` — copy the link to ${target.name}`}</span>
        </button>
      </span>
      <span role="status" className="mt-1 block text-xs text-muted">
        {status ?? ""}
      </span>
    </span>
  );
}
