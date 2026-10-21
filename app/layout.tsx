import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";

import { resolveSiteOrigin } from "@/app/lib/og/og-model";

import "./globals.css";

// Geometric display font for headings; readable sans for body copy.
// next/font self-hosts the files at build time and injects local fallbacks.
const chakraPetch = Chakra_Petch({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  fallback: ["system-ui", "arial"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "arial"],
});

/**
 * The public origin of the deployed site.
 *
 * `NEXT_PUBLIC_SITE_URL` is the source of truth: it is what the canonical
 * URLs and the absolute social-preview image URLs are built from. When it is
 * not configured the app falls back to the local development origin, so a
 * preview build still produces resolvable URLs instead of relative ones that
 * no crawler can fetch. Production **must** set the variable — see the
 * production launch checklist (task `06-05`).
 */
const siteOrigin = resolveSiteOrigin(
  process.env.NEXT_PUBLIC_SITE_URL,
  "http://localhost:3000"
);

const SITE_NAME = "MLBB Showcase";

const SITE_DESCRIPTION =
  "A premium personal Mobile Legends: Bang Bang account showcase.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: SITE_NAME,
    template: "%s · MLBB Showcase",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // The canonical URL is declared per public route (`/` and `/collection`);
  // it is deliberately not set here, because a root-level canonical would be
  // inherited by every route, including the private dashboard.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: a future theme toggle sets data-theme on <html>
    // before hydration; see the theme switching notes in globals.css.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${chakraPetch.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
