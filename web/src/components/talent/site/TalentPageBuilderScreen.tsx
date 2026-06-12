"use client";

/**
 * TalentPageBuilderScreen — full-viewport wrapper for the Max-tier freeform
 * Page Builder. Gates on the Max tier (`talent_plan_key='talent_portfolio'`)
 * and either mounts `TalentMaxBuilderMount` or shows an upsell notice.
 *
 * Rendered by `/talent/page-builder` (server) which resolves the talent's id,
 * plan key, tier, managing tenant + locale. The talent layout renders this bare
 * (no dashboard shell), so this owns the whole viewport.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";

import { TalentMaxBuilderMount } from "./TalentMaxBuilderMount";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";

type Props = {
  talentProfileId: string;
  pageSlug: string;
  tenantId: string;
  /** Canonical talent plan key — Max = `talent_portfolio`. */
  talentPlanKey: string | null;
  /** Dashboard tier label: free | pro | max. */
  talentTier: string | null;
  talentDisplayName: string | null;
  locale?: string;
  /** Server-assembled in-editor canvas render data (data sources + islands). */
  canvasRenderData?: InEditorCanvasRenderData | null;
};

const MAX_PLAN_KEY = "talent_portfolio";

export function TalentPageBuilderScreen({
  talentProfileId,
  pageSlug,
  tenantId,
  talentPlanKey,
  talentTier,
  talentDisplayName,
  locale,
  canvasRenderData = null,
}: Props) {
  const router = useRouter();

  const handleExit = useCallback(() => {
    // Back to the talent "My site" dashboard surface.
    router.push("/talent/public-page");
  }, [router]);

  const isMax = talentPlanKey === MAX_PLAN_KEY || talentTier === "max";

  if (!isMax) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0E0E11",
          padding: "32px 20px",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: "#16161A",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            padding: "28px 26px",
            color: "#F5F2EB",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "4px 11px",
              borderRadius: 999,
              background: "rgba(93,211,160,0.12)",
              color: "#5DD3A0",
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: 0.3,
              marginBottom: 16,
            }}
          >
            MAX FEATURE
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            The Page Builder is a Max feature
          </h1>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "rgba(245,242,235,0.66)",
            }}
          >
            Upgrade to the Max plan to design a fully custom, freeform page for
            your profile — drag-and-drop sections, your own media, and a layout
            that is entirely yours.
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
                padding: "8px 16px",
                borderRadius: 9,
                background: "#5DD3A0",
                color: "#0E0E11",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              See plans
            </Link>
            <Link
              href="/talent/public-page"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.04)",
                color: "#F5F2EB",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to my site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-talent-page-builder-screen=""
      style={{ minHeight: "100vh", background: "#0E0E11" }}
    >
      <TalentMaxBuilderMount
        talentProfileId={talentProfileId}
        pageSlug={pageSlug}
        tenantId={tenantId}
        talentTier={talentPlanKey}
        talentDisplayName={talentDisplayName}
        locale={locale}
        onExit={handleExit}
        canvasRenderData={canvasRenderData}
      />
    </div>
  );
}
