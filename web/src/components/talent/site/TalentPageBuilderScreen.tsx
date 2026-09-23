"use client";

/**
 * TalentPageBuilderScreen — full-viewport wrapper for the freeform Page
 * Builder. Gates on `siteCapabilities.personalSiteEdit` (Phase 1) — while
 * `TALENT_FREE_WEBSITE_ENABLED` is off that resolves Max-only, so this is
 * byte-identical to the old `isMax` gate. When it is false, shows the "Web
 * Office" upsell notice instead of mounting the editor. (The "no site yet"
 * case is a ROUTING decision, handled by the server route redirecting to the
 * Public page screen before this component ever mounts — see
 * `/talent/page-builder/page.tsx`.)
 *
 * Rendered by `/talent/page-builder` (server) which resolves the talent's id,
 * plan key, tier, managing tenant + locale. The talent layout renders this bare
 * (no dashboard shell), so this owns the whole viewport.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";

import { TalentMaxBuilderMount } from "./TalentMaxBuilderMount";
import { TalentSiteShellBuilderMount } from "./TalentSiteShellBuilderMount";
import { CHROME } from "@/components/edit-chrome/kit/tokens";
import { siteCapabilityDeniedMessageClient } from "@/lib/talent-site/free-site-capability-denied-copy";
import type { TalentSiteCapabilities } from "@/lib/access/talent-membership";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";

type Props = {
  talentProfileId: string;
  pageSlug: string;
  tenantId: string;
  /** Canonical talent plan key — Max = `talent_portfolio`. */
  talentPlanKey: string | null;
  /** Dashboard tier label: free | pro | max. */
  talentTier: string | null;
  /** Phase 1 — the per-capability record (`buildTalentSiteCapabilities`). */
  siteCapabilities: TalentSiteCapabilities;
  talentDisplayName: string | null;
  locale?: string;
  /** Server-assembled in-editor canvas render data (data sources + islands). */
  canvasRenderData?: InEditorCanvasRenderData | null;
  /** When true, edit the SITE SHELL (header/logo/footer) instead of a page. */
  shellMode?: boolean;
  /** The site's pages — powers the in-editor page switcher. */
  sitePages?: MaxSiteManagerPage[];
};

const UPSELL_HEADING = {
  en: "The Page Builder is a Web Office feature",
  es: "El editor de páginas es una función de Web Office",
} as const;

const UPSELL_SEE_PLANS = {
  en: "See plans",
  es: "Ver planes",
} as const;

const UPSELL_BACK = {
  en: "Back to my site",
  es: "Volver a mi sitio",
} as const;

export function TalentPageBuilderScreen({
  talentProfileId,
  pageSlug,
  tenantId,
  talentPlanKey,
  siteCapabilities,
  talentDisplayName,
  locale,
  canvasRenderData = null,
  shellMode = false,
  sitePages,
}: Props) {
  const router = useRouter();

  const handleExit = useCallback(() => {
    // Back to the talent "My site" dashboard surface.
    router.push("/talent/site");
  }, [router]);

  const canEdit = siteCapabilities.personalSiteEdit;

  if (!canEdit) {
    const isEs = locale === "es";
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: CHROME.canvasWorkspace,
          padding: "32px 20px",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            borderRadius: 16,
            padding: "28px 26px",
            color: CHROME.text,
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.10)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "4px 11px",
              borderRadius: 999,
              background: CHROME.greenBg,
              color: CHROME.green,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: 0.3,
              marginBottom: 16,
            }}
          >
            WEB OFFICE
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {isEs ? UPSELL_HEADING.es : UPSELL_HEADING.en}
          </h1>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: CHROME.muted,
            }}
          >
            {siteCapabilityDeniedMessageClient("site_edit", locale)}
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/talent/settings"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                padding: "8px 16px",
                borderRadius: 9,
                background: CHROME.accent,
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {isEs ? UPSELL_SEE_PLANS.es : UPSELL_SEE_PLANS.en}
            </Link>
            <Link
              href="/talent/public-page"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                padding: "8px 16px",
                borderRadius: 9,
                border: `1px solid ${CHROME.controlBorder}`,
                background: CHROME.controlFill,
                color: CHROME.text,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {isEs ? UPSELL_BACK.es : UPSELL_BACK.en}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-talent-page-builder-screen=""
      // Light "desk" behind the editor canvas (modern 2026 builder). The canvas
      // region paints its own theme background on top; this is what shows in any
      // gap / behind the chrome. Was the legacy dark #0E0E11.
      style={{ minHeight: "100vh", background: CHROME.canvasWorkspace }}
    >
      {shellMode ? (
        <TalentSiteShellBuilderMount
          talentProfileId={talentProfileId}
          tenantId={tenantId}
          talentDisplayName={talentDisplayName}
          siteCapabilities={siteCapabilities}
          locale={locale}
          onExit={handleExit}
          sitePages={sitePages}
        />
      ) : (
        <TalentMaxBuilderMount
          talentProfileId={talentProfileId}
          pageSlug={pageSlug}
          tenantId={tenantId}
          talentTier={talentPlanKey}
          siteCapabilities={siteCapabilities}
          talentDisplayName={talentDisplayName}
          locale={locale}
          onExit={handleExit}
          canvasRenderData={canvasRenderData}
          sitePages={sitePages}
        />
      )}
    </div>
  );
}
