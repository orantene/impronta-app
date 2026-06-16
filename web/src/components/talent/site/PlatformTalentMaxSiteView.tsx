import Link from "next/link";

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
      <main>
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
