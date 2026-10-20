import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import "./globals.css";
import * as React from "react";

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

export const metadata: Metadata = {
  title: "MLBB Showcase",
  description:
    "A premium personal Mobile Legends: Bang Bang account showcase.",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
};

// Theme state: persist in localStorage, respect prefers-color-scheme
const prefersDark = typeof window !== "undefined"
  && window.matchMedia("(prefers-color-scheme: dark)").matches;
const savedTheme = typeof localStorage !== "undefined"
  && localStorage.getItem("theme");

const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
let currentTheme = initialTheme;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${chakraPetch.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

// Export a theme hook for use in public components
export function useTheme() {
  const [theme, setTheme] = React.useState(initialTheme);

  React.useEffect(() => {
    const html = document.documentElement;
    const setThemeAttr = (theme: string) => {
      html.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    };

    if (theme === "dark") {
      setThemeAttr("dark");
    } else {
      setThemeAttr("light");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme => (theme === "dark" ? "light" : "dark"));
  };

  return { theme, toggleTheme };
}

interface LayoutProps<Path extends string = "/"> {
  children: ReactNode;
}