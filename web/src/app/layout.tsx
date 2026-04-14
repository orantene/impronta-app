import type { Metadata } from "next";
import { Cinzel, Geist_Mono, Raleway } from "next/font/google";
import { AnalyticsConsentBanner } from "@/components/analytics/analytics-consent-banner";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import { CspViolationReporter } from "@/components/csp-violation-reporter";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { getLocaleMetadata } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/request-locale";
import { getSiteTheme } from "@/lib/site-theme";

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

// Quick follow-up option: replace `Raleway` above with `Poppins`.

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Impronta — Models & image agency",
    template: "%s · Impronta",
  },
  description:
    "Premium talent and image agency — discovery, representation, and editorial-quality presentation.",
};

/** Root reads locale from middleware header + cookies via `getRequestLocale()` — must not be statically prerendered. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteTheme = await getSiteTheme();
  const locale = await getRequestLocale();
  const { dir, hreflang } = getLocaleMetadata(locale);

  return (
    <html
      lang={hreflang}
      dir={dir}
      suppressHydrationWarning
      className={`${bodySans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className={`site-theme-${siteTheme} flex min-h-full flex-col bg-background text-foreground`}
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
