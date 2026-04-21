import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono, Inter, Playfair_Display, Raleway } from "next/font/google";
import { AnalyticsConsentBanner } from "@/components/analytics/analytics-consent-banner";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import { CspViolationReporter } from "@/components/csp-violation-reporter";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { getLocaleMetadata } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/request-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getPublicFontPreset } from "@/lib/site-font-preset";
import { getSiteTheme } from "@/lib/site-theme";
import { getPublicTenantScope } from "@/lib/saas/scope";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
  resolveDesignTokens,
} from "@/lib/site-admin";
import { loadPublicBranding } from "@/lib/site-admin/server/reads";

import "./globals.css";

const bodySans = Raleway({
  variable: "--font-body-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Platform surface display + UI typography. Scoped to the marketing site via `--plt-font-*`. */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Legacy editorial preset used by non-marketing public surfaces. */
const interBody = Inter({
  variable: "--font-inter-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`,
    template: `%s · ${PLATFORM_BRAND.name}`,
  },
  description: PLATFORM_BRAND.description,
};

/** Root reads locale from middleware header + cookies via `getRequestLocale()` — must not be statically prerendered. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [siteTheme, publicFontPreset, publicScope] = await Promise.all([
    getSiteTheme(),
    getPublicFontPreset(),
    getPublicTenantScope(),
  ]);
  const locale = await getRequestLocale();
  const { dir, hreflang } = getLocaleMetadata(locale);

  // M6 — Governed design tokens. Public scope is non-null only for
  // tenant-resolved storefront requests (middleware sets the header).
  // Platform routes (auth, onboarding, platform admin) fall through to
  // registry defaults, which keeps the root layout safe on any path.
  // We read the LIVE row (never draft); the read is cached + tagged
  // `branding`, so publishDesign's updateTag(branding) busts this.
  const publicBranding = publicScope
    ? await loadPublicBranding(publicScope.tenantId)
    : null;
  const designTokens = resolveDesignTokens(publicBranding);
  const tokenCssVars = designTokensToCssVars(designTokens);
  const tokenDataAttrs = designTokensToDataAttrs(designTokens);

  return (
    <html
      lang={hreflang}
      dir={dir}
      suppressHydrationWarning
      data-public-font-preset={publicFontPreset}
      {...tokenDataAttrs}
      style={tokenCssVars as React.CSSProperties}
      className={`${bodySans.variable} ${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${interBody.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className={`site-theme-${siteTheme} flex min-h-full flex-col text-foreground`}
      >
        <AnalyticsScripts />
        <WebVitalsReporter />
        <CspViolationReporter />
        <AnalyticsConsentBanner />
        {children}
      </body>
    </html>
  );
}
