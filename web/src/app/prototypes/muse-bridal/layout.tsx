import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { MuseFooter } from "./_components/MuseFooter";
import { MuseHeader } from "./_components/MuseHeader";
import "./muse.css";

/**
 * Muse Bridal Collective — prototype brand root.
 *
 * Exists outside the tenant theme system on purpose: this is a design
 * exploration surface. Everything lives under `.muse-root` + scoped CSS
 * variables so it can be promoted into a proper theme preset later
 * without disturbing platform chrome.
 *
 * Mapping to future systemization:
 *   - Fonts → `site_font_preset` (editorial pairing)
 *   - Colors → `site_theme_tokens` (palette)
 *   - Header/Footer → CMS-controlled partials (variants `editorial-sticky`,
 *     `espresso-column`)
 *   - Motion + radii + density → `site_feel_preset`
 */

const display = Fraunces({
  variable: "--muse-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

const body = Inter({
  variable: "--muse-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Muse Bridal Collective — Curated wedding talent",
    template: "%s · Muse Bridal Collective",
  },
  description:
    "A curated collective of makeup artists, hairstylists, photographers, planners, florists, and live musicians for weddings, destination celebrations, and private events.",
  robots: { index: false, follow: false },
};

export default function MuseBridalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`muse-root ${display.variable} ${body.variable}`}>
      <MuseHeader />
      <main>{children}</main>
      <MuseFooter />
    </div>
  );
}
