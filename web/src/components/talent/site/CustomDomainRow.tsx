"use client";

/**
 * Compact Custom domain row for Presence → My website (and Website settings).
 * Locked / trial → upgrade drawer. Unlocked → Domain setup drawer.
 */

import { useEffect, useState } from "react";

import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  loadTalentSiteDomainsForPanel,
  type TalentSiteDomainView,
} from "@/lib/talent-site/server/talent-site-domain-actions";

type Props = {
  /** Capability hint from site capabilities (`personalSiteCustomDomain`). */
  canManage: boolean;
  /** When true, treat as locked even if canManage (Web Office trial). */
  trialActive?: boolean;
  initialDomains?: TalentSiteDomainView[];
};

function statusSummary(
  domains: TalentSiteDomainView[],
  copy: { t: (s: string) => string },
): string {
  if (domains.length === 0) return copy.t("No custom domain yet");
  const primary = domains.find((d) => d.isPrimary) ?? domains[0];
  if (!primary) return copy.t("No custom domain yet");
  if (primary.status === "active") {
    return copy.t("Live at {domain}").replace("{domain}", primary.domain);
  }
  if (primary.status === "error") {
    return copy.t("Needs attention: {domain}").replace("{domain}", primary.domain);
  }
  return copy.t("Pending: {domain}").replace("{domain}", primary.domain);
}

export function CustomDomainRow({
  canManage,
  trialActive = false,
  initialDomains,
}: Props) {
  const copy = useDashboardText();
  const { openDrawer, bridgeTalentPlanTrial } = useAdminShell();
  const trialOn = trialActive || bridgeTalentPlanTrial?.active === true;
  const unlocked = canManage && !trialOn;

  const [domains, setDomains] = useState<TalentSiteDomainView[]>(initialDomains ?? []);

  useEffect(() => {
    if (!unlocked) return;
    if (initialDomains) return;
    let cancelled = false;
    void (async () => {
      const result = await loadTalentSiteDomainsForPanel();
      if (cancelled) return;
      if (result.domains) setDomains(result.domains);
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, initialDomains]);

  const summary = !canManage
    ? copy.t("Custom domain needs Web Office")
    : trialOn
      ? copy.t("Unlocks after the Web Office trial")
      : statusSummary(domains, copy);

  const affordance = !unlocked
    ? copy.t("See plans")
    : domains.some((d) => d.status === "active")
      ? copy.t("Manage")
      : copy.t("Set up");

  function onOpen() {
    if (!unlocked) {
      openDrawer("talent-tier-compare");
      return;
    }
    openDrawer("talent-custom-domain");
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="talent-custom-domain-row"
      data-unlocked={unlocked ? "true" : "false"}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        background: COLORS.card,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 650,
            color: COLORS.ink,
          }}
        >
          {copy.t("Custom domain")}
          {!unlocked ? (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.inkMuted,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {copy.t("Locked")}
            </span>
          ) : null}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 3,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, flexShrink: 0 }}>
        {affordance} ›
      </span>
    </button>
  );
}
