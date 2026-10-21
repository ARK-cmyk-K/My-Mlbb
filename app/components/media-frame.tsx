"use client";

import { useState } from "react";

import { initialsFromName } from "@/app/lib/showcase/showcase-model";

/**
 * Shared media frame for published artwork (extracted in task `05-04` so the
 * showcase tabs and the collection explorer render images identically).
 *
 * Published media is resolved at runtime from the release (there is no
 * statically analysable asset to hand to `next/image`), so this renders a plain
 * `<img>` with lazy loading and falls back to the entry's initials when the
 * artwork is missing or fails to load — never a broken-image icon, and never an
 * invented placeholder image.
 */
export interface MediaFrameProps {
  /** Published media id, or `null` when no artwork is attached. */
  mediaId: string | null;
  /** Alt text for the image; the fallback is decorative, so it is not used there. */
  alt: string;
  /** Name used to derive the fallback initials. */
  name: string;
  /** Aspect-ratio/size classes, e.g. `aspect-[4/5]`. */
  className: string;
}

export function MediaFrame({
  mediaId,
  alt,
  name,
  className,
}: MediaFrameProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(mediaId) && !failed;

  return (
    <div className={`relative w-full overflow-hidden bg-surface ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- published media is resolved from the release at runtime, so there is no statically analysable asset to hand to next/image
        <img
          src={`/showcase-public/${mediaId}.png`}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-raised via-surface to-background"
          aria-hidden="true"
        >
          <span className="font-display text-3xl font-semibold text-muted/70">
            {initialsFromName(name)}
          </span>
        </div>
      )}
    </div>
  );
}
