"use client";

/**
 * TalentSiteActivateNudge — Today invite to activate / finish the free website.
 *
 * PR3 (W22): only shows once website eligibility is unlocked (100%). Published
 * sites never see Unlock copy. Suggested address comes from the provisioned
 * slug or a name-derived host (checked at publish).
 */

import { useEffect, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useWebsiteEligibility } from "@/components/talent/studio/useWebsiteEligibility";
import { loadTalentSiteActivationStateAction } from "@/lib/talent-site/server/site-activation-state";
import { talentSiteHost } from "@/lib/talent-site/site-public-url";
import { useAdminShell } from "@/components/admin/shell/internal/state";

const C = {
  ink: "#14161d",
  inkMuted: "rgba(20,22,29,0.62)",
  border: "rgba(47,109,106,0.28)",
  ground: "rgba(47,109,106,0.06)",
  accent: "#2f6d6a",
};
const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";

function suggestSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function TalentSiteActivateNudge({ onOpenSite }: { onOpenSite: () => void }) {
  const [show, setShow] = useState(false);
  const [started, setStarted] = useState(false);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const copy = useDashboardText();
  const [dismissed, setDismissed] = useState(false);
  const eligibility = useWebsiteEligibility();
  const { bridgeTalentSelfProfile } = useAdminShell();

  useEffect(() => {
    let live = true;
    void loadTalentSiteActivationStateAction().then((s) => {
      if (!live || !s) return;
      if (s.canManage && !s.isPublished) {
        setShow(true);
        setStarted(s.hasSite);
        setSiteSlug(s.siteSlug);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // W22 / W23: never pitch Activate while the profile is unfinished or live.
  if (!show || dismissed) return null;
  if (!eligibility.unlocked) return null;

  const suggested =
    talentSiteHost(siteSlug) ??
    talentSiteHost(suggestSlug(bridgeTalentSelfProfile?.displayName ?? "")) ??
    null;

  const title = started
    ? copy.t("Finish website setup")
    : copy.t("Your free website is unlocked");
  const body = started
    ? copy.t("Your website exists but is not live yet. Publish it to give clients a real address to visit.")
    : suggested
      ? `${copy.t("Suggested address:")} ${suggested} · ${copy.t("checked when you publish")}`
      : copy.t("Activate it and we build it from your profile");
  const cta = started ? copy.t("Finish setup") : copy.t("Activate your free website");

  return (
    <section
      data-talent-site-activate-nudge
      data-testid="talent-site-activate-nudge"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        border: `1px solid ${C.border}`,
        background: C.ground,
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 14,
        fontFamily: FONT,
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 260px" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>{title}</p>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.inkMuted, lineHeight: 1.45 }}>
          {body}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={onOpenSite}
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            padding: "9px 16px",
            borderRadius: 9,
            border: "none",
            background: C.accent,
            color: "#fff",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {cta}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={copy.t("Dismiss")}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: C.inkMuted,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {copy.t("Later")}
        </button>
      </div>
    </section>
  );
}
