import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ClientSpeedInsights } from "@/components/analytics/client-speed-insights";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import { SpaPageViewTracker } from "@/components/analytics/spa-page-view-tracker";
import { CspViolationReporter } from "@/components/csp-violation-reporter";
import { EditChromeMount } from "@/components/edit-chrome/edit-chrome-mount";
import { AdminQuickBarMount } from "@/components/edit-chrome/admin-quick-bar-mount";
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
import { resolveTenantAnalytics } from "@/lib/integrations/analytics-resolver";
import {
  TenantCustomCodeBody,
  TenantCustomCodeHead,
} from "@/components/integrations/tenant-custom-code";
import {
  TenantCodeSnippetsBody,
  TenantCodeSnippetsHead,
} from "@/components/integrations/tenant-code-snippets";
import { TenantTrackingHead } from "@/components/integrations/tenant-tracking";
import { GoogleFontsLink } from "./google-fonts-link";
import { TenantFontFaces } from "./tenant-font-faces";
import {
  bodySans,
  cinzel,
  fraunces,
  geistMono,
  geistSans,
  interBody,
  playfairDisplay,
} from "./fonts";
import { ScrollReveal } from "@/components/scroll-reveal";
import { LocaleSuggestionBanner } from "@/components/locale-suggestion-banner";
import { TenantRegisterMount } from "@/components/marketing/tenant-register-mount";
import { PlatformJsonLd } from "@/components/marketing/platform-json-ld";
import { BreakpointStyleEngine } from "@/components/edit-chrome/breakpoint-style-engine";
import { BUILTIN_EXTRA_TIERS } from "@/lib/site-admin/builder-node/custom-breakpoint-css";
import { PwaServiceWorkerRegister } from "@/components/pwa/sw-register";

import "./globals.css";

const BASE_METADATA: Metadata = {
  // Marketing apex base so the inherited `opengraph-image` file-route and any
  // relative canonical resolve to tulala.digital, not the request host. Every
  // non-marketing surface overrides this in its own generateMetadata.
  metadataBase: new URL(`https://${PLATFORM_BRAND.domain}`),
  title: {
    default: `${PLATFORM_BRAND.name} · ${PLATFORM_BRAND.tagline}`,
    template: `%s · ${PLATFORM_BRAND.name}`,
  },
  description: PLATFORM_BRAND.description,
  // PWA / installable-app metadata — lets users add Tulala to their
  // home screen on iOS/Android. The manifest itself lives at
  // /manifest.webmanifest (public/).
  manifest: "/manifest.webmanifest",
  // Platform icon is CONFIG-based (a public/ asset), NOT the app/icon.svg
  // file convention: file-based icons outrank metadata icons in Next, which
  // would make the per-tenant favicon override in (public)/layout.tsx
  // impossible.
  icons: { icon: [{ url: "/platform-icon.svg", type: "image/svg+xml" }] },
  appleWebApp: {
    capable: true,
    title: PLATFORM_BRAND.name,
    statusBarStyle: "default",
  },
  // Google Search Console ownership for the https://tulala.digital/ URL-prefix
  // property. Not a secret: it is served in the public <head> by design, and
  // Google requires it to stay in place or the property silently un-verifies.
  verification: {
    google: "AT_7Nj7SfihEJhb9W1jP4oFW5fyoguijnMpqpIN7x0k",
  },
  openGraph: {
    siteName: PLATFORM_BRAND.name,
    title: `${PLATFORM_BRAND.name} · ${PLATFORM_BRAND.tagline}`,
    description: PLATFORM_BRAND.description,
    url: `https://${PLATFORM_BRAND.domain}/`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PLATFORM_BRAND.name} · ${PLATFORM_BRAND.tagline}`,
    description: PLATFORM_BRAND.description,
  },
};

/**
 * Root metadata is a function (not a static export) for one reason: the
 * per-tenant favicon. Branded-host storefront routes span several route
 * groups, so the root — which every request passes — is the one place a
 * tenant's uploaded favicon (Settings → Brand identity, carried as the
 * theme_json.favicon_url piggyback) can override the platform icon without
 * per-segment duplication. Non-tenant hosts keep BASE_METADATA verbatim.
 * loadPublicBranding is unstable_cache'd + tag-busted, and the body below
 * calls it too, so this adds no extra query.
 */
export async function generateMetadata(): Promise<Metadata> {
  const publicScope = await getPublicTenantScope();
  if (!publicScope) return BASE_METADATA;
  const branding = await loadPublicBranding(publicScope.tenantId);
  const theme = (branding?.theme_json ?? {}) as Record<string, unknown>;
  const faviconUrl = typeof theme.favicon_url === "string" ? theme.favicon_url : null;
  if (!faviconUrl) return BASE_METADATA;
  return { ...BASE_METADATA, icons: { icon: [{ url: faviconUrl }] } };
}

// Theme color drives the iOS/Android browser chrome tint when the app is
// added to home screen — forest accent matches the rest of the brand.
// viewportFit:'cover' supports iOS notch areas via env(safe-area-inset-*);
// max scale 5 keeps zoom accessible without locking out users at 1.
export const viewport: import("next").Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  minimumScale: 1,
  maximumScale: 5,
  themeColor: "#0F4F3E",
};

/** Root reads locale from middleware header + cookies via `getRequestLocale()` — must not be statically prerendered. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /**
   * @modal parallel slot — intercepted routes render here ON TOP of the
   * current page (directory quick-open profile: @modal/(.)t/[profileCode]).
   * Resolves to @modal/default.tsx (null) on every non-intercepted render.
   */
  modal: React.ReactNode;
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
  const [publicBranding, tenantAnalytics] = await Promise.all([
    publicScope ? loadPublicBranding(publicScope.tenantId) : Promise.resolve(null),
    publicScope ? resolveTenantAnalytics(publicScope.tenantId) : Promise.resolve(null),
  ]);
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
      className={`${bodySans.variable} ${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${interBody.variable} ${playfairDisplay.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className={`site-theme-${siteTheme}${publicScope ? " site-theme-tenant-override" : ""} flex min-h-full flex-col text-foreground`}
      >
        {/* Tenant custom code — head snippet. Storefront-only (publicScope),
            entitlement + status gated inside the resolver. */}
        {publicScope && <TenantCustomCodeHead tenantId={publicScope.tenantId} />}
        {/* Custom code LIBRARY — named, individually publishable snippets
            (Website → Setup → Custom code). Same storefront-only gate as the
            legacy blob above; the tenant check is repeated inside
            selectSnippetsForRender. `head`-placed CSS is hoisted into <head>. */}
        {publicScope && <TenantCodeSnippetsHead tenantId={publicScope.tenantId} />}
        {/* Tenant TRACKING — the analytics / advertising accounts connected in
            Website → Setup → Tracking. Same storefront-only `publicScope` gate
            as the two injectors above, reused rather than reinvented, so this
            feature adds no new seam; the tenant check is repeated inside
            selectTrackingForRender, which also re-validates every stored ID. */}
        {publicScope && <TenantTrackingHead tenantId={publicScope.tenantId} />}
        {/* Platform JSON-LD (Organization + WebSite + SoftwareApplication).
            Emitted on the platform/marketing surface only; `publicScope` is
            non-null solely for tenant-resolved storefront requests, where the
            Tulala Organization entity would be wrong. */}
        {!publicScope && <PlatformJsonLd />}
        {/* Phase 13 — load tenant Google Fonts when picker tokens set. */}
        <GoogleFontsLink tokens={designTokens} />
        {/* Custom fonts — tenant-uploaded brand faces (@font-face + preload).
            Rendering here reaches the storefront, the editor canvas AND the
            device-preview iframe (it clones this head), so all three surfaces
            resolve an uploaded family identically. */}
        <TenantFontFaces themeJson={publicBranding?.theme_json} tokens={designTokens} />
        {/* Phase 5 — global scroll-reveal observer (no-op when no targets). */}
        <ScrollReveal />
        {/* W5-T6 — built-in extra breakpoint tiers (wide ≤1280 / compact ≤480).
            Renders a single <style>; reaches both the editor and published
            storefront so section data-section-<tier>-* overrides take effect. */}
        <BreakpointStyleEngine tiers={BUILTIN_EXTRA_TIERS} />
        <AnalyticsScripts
          gaId={tenantAnalytics?.gaId}
          gtmId={tenantAnalytics?.gtmId}
          metaPixelId={tenantAnalytics?.metaPixelId}
          tiktokPixelId={tenantAnalytics?.tiktokPixelId}
          linkedInPartnerId={tenantAnalytics?.linkedInPartnerId}
          // Tenant id → GA4 `tenant_id` custom dimension. Only present on
          // storefront requests (publicScope non-null); platform/marketing
          // surface sends no tenant_id.
          tenantId={publicScope?.tenantId}
        />
        {/* SPA page_view — GA4/pixel parity for client-side navigations
            (gtag config above uses send_page_view:false; this owns it). */}
        <SpaPageViewTracker />
        <WebVitalsReporter />
        <CspViolationReporter />
        {children}
        {/* Intercepted-route overlays (profile quick-open). Sibling of the
            page so closing = router.back() restores the page untouched. */}
        {modal}
        {/* Tenant custom code — body snippet (end of <body>). Storefront-only. */}
        {publicScope && <TenantCustomCodeBody tenantId={publicScope.tenantId} />}
        {/* Custom code library — snippets placed at the end of the page. */}
        {publicScope && <TenantCodeSnippetsBody tenantId={publicScope.tenantId} />}
        <TenantRegisterMount />
        {/* SEO-safe language suggestion. Renders nothing unless the visitor's
            browser asks for a language this tenant publishes but is not the one
            this URL serves. Never redirects, never changes what the URL renders
            (crawlers get identical HTML minus the banner) — see
            @/i18n/locale-suggestion. Mounted here because public HTML comes out
            of four different shells; this is the one node they share. */}
        <LocaleSuggestionBanner />
        <EditChromeMount />
        {/* Wave 6.1 — the admin quick bar mounts independently of the editor so
            it reaches every public page of a tenant's own site, not just the
            builder-owned ones. Same tenant + capability gate; renders nothing
            for visitors, for members of a different tenant, or in edit mode. */}
        <AdminQuickBarMount />
        <Analytics />
        <ClientSpeedInsights />
        {/* PWA — registers /sw.js in production only. No-op in dev. */}
        <PwaServiceWorkerRegister />
      </body>
    </html>
  );
}
