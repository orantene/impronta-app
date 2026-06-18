import Link from "next/link";

import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { SitePageViewAnalytics } from "@/components/analytics/site-page-view-analytics";
import { PublicHeader } from "@/components/public-header";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import { TalentSiteRenderer } from "./TalentSiteRenderer";

type Props = {
  snapshot: TalentSiteSnapshot;
  locale: string;
  draftPreview?: boolean;
  /**
   * ADDITIVE — freeform render context for a platform-default freeform snapshot
   * (tenant + talent subject scope). Ignored by slot snapshots. Forwarded to
   * `TalentSiteRenderer`.
   */
  freeformContext?: {
    tenantId: string | null;
    talentProfileId: string;
    publicPathPrefix?: string;
  };
};

/**
 * Tulala-platform chrome wrapper for a published (or owner draft-preview) Max site.
 * Used only on app / marketing hosts — agency hosts never render this shell.
 */
export function PlatformTalentMaxSiteView({
  snapshot,
  locale,
  draftPreview = false,
  freeformContext,
}: Props) {
  return (
    <div data-talent-personal-site-shell="">
      {/* A11Y-2 — skip link is the first focusable element on the platform-host
          talent profile (this branch renders instead of LightProfileLayout on
          app/marketing hosts; the agency-host LightProfileLayout already has it). */}
      <SkipToContent />
      {/* ANALYTICS-2 — first-party page-view on the platform-host talent profile. */}
      {freeformContext ? (
        <SitePageViewAnalytics
          surface="talent-profile"
          tenantId={freeformContext.tenantId}
          talentId={freeformContext.talentProfileId}
          locale={locale}
        />
      ) : null}
      <PublicHeader />
      {draftPreview ? (
        <div
          style={{
            background: "rgba(180, 83, 9, 0.12)",
            color: "#92400e",
            fontSize: 12,
            padding: "8px 16px",
            textAlign: "center",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          Draft preview — visitors see the published version until you publish again.
        </div>
      ) : null}
      <main id="main-content">
        <TalentSiteRenderer
          snapshot={snapshot}
          locale={locale}
          freeformContext={freeformContext}
        />
      </main>
      <footer
        style={{
          borderTop: "1px solid rgba(24,24,27,0.08)",
          padding: "24px 16px",
          textAlign: "center",
          fontSize: 12,
          color: "rgba(11,11,13,0.45)",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <Link href="/" style={{ color: "inherit" }}>
          Powered by Tulala
        </Link>
      </footer>
    </div>
  );
}
