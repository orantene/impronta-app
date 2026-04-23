import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { CCFooter } from "./_components/CCFooter";
import { CCHeader } from "./_components/CCHeader";
import "./cc.css";

/**
 * Creator Circuit — prototype brand root.
 *
 * Standalone design exploration — lives outside the tenant theme system on
 * purpose. Everything is scoped under `.cc-root` + namespaced CSS variables
 * so it can be promoted into a proper theme preset later without disturbing
 * platform chrome.
 *
 * Mapping to future systemization:
 *   - Fonts → `site_font_preset` ("creator-modern" pairing: Space Grotesk + Inter)
 *   - Colors → `site_theme_tokens` ("creator-circuit" palette)
 *   - Header/Footer → CMS-controlled partials (variant `translucent-product`)
 */

const display = Space_Grotesk({
  variable: "--cc-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const body = Inter({
  variable: "--cc-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Creator Circuit — Premium creator marketplace",
    template: "%s · Creator Circuit",
  },
  description:
    "A curated marketplace of influencer, UGC, and content creators built for modern brands. Discover, book, and launch social-first campaigns — without the DM pitch fatigue.",
  robots: { index: false, follow: false },
};

export default function CreatorCircuitLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`cc-root ${display.variable} ${body.variable}`}>
      <CCHeader />
      <main>{children}</main>
      <CCFooter />
    </div>
  );
}
