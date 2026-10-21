import { initialsFromName } from "@/app/lib/showcase/showcase-model";
import type { OgCardContent } from "@/app/lib/og/og-model";

/**
 * The social preview card (task `06-02`).
 *
 * A single, deliberately simple layout that renders identically for every
 * card — a published hero, a published skin, the collection page or the
 * homepage.
 *
 * The renderer behind `next/og` (satori) supports **only** flexbox and a
 * small subset of CSS, so every style here is an inline style and no class
 * name, CSS variable or media query is used. The same rules apply to the
 * fonts: the runtime ships a single regular weight, so the card never relies
 * on a weight that is not there.
 *
 * The artwork is optional. When it is missing the card shows the entry's
 * initials on a plain panel instead — never a broken image, never a
 * placeholder that pretends to be the real artwork.
 */
export function OgCard({ content }: { content: OgCardContent }) {
  const initials = initialsFromName(content.title);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#0b0f17",
        padding: "60px 68px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#d4af37",
          }}
        >
          {content.eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 74,
            lineHeight: 1.05,
            color: "#f4f6fb",
          }}
        >
          {content.title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 30,
            lineHeight: 1.3,
            color: "#98a2b6",
          }}
        >
          {content.subtitle}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#98a2b6" }}>
          MLBB Showcase
        </div>
        {content.imageDataUrl ? (
          <div
            style={{
              display: "flex",
              width: 190,
              height: 190,
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <img
              src={content.imageDataUrl}
              width={190}
              height={190}
              alt=""
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 190,
              height: 190,
              borderRadius: 20,
              backgroundColor: "#1a2230",
              fontSize: 80,
              color: "#4d5871",
            }}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}
