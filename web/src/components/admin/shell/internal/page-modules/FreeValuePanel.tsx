"use client";

// WP1 (2026-09-02) — extracted verbatim from the deleted WorkPage.tsx stub.
// The only survivor of that file: the Overview page renders this panel.

import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { workspacePathHost } from "@/lib/saas/workspace-public-url";
import { GhostButton, Icon, PrimaryButton, SecondaryButton } from "../primitives";
import { COLORS, FONTS, FREE_PLAN_VALUE, useAdminShell } from "../state";

/**
 * "Today on Free" — the value-not-walls panel. Replaces the old "here's
 * what's locked" framing with an honest list of what works on Free, plus
 * concrete usage caps shown as soft progress bars (not blockers). When a
 * cap nears 80% we surface a one-line upgrade nudge inline.
 *
 * Why: the prior architecture made Free feel like a sandbox with all the
 * doors locked. The actual model is "your agency is live, with caps." We
 * now lead with that.
 */
export function FreeValuePanel() {
  const t = useT();
  const { setPage, openDrawer, effectiveRoster, effectiveTenant } = useAdminShell();
  // Patch the static FREE_PLAN_VALUE entries that contain fixture data:
  // - "roster" → real count from bridge (cap stays 5)
  // - "storefront" → real subdomain URL
  const freePlanItems = FREE_PLAN_VALUE.map((v): typeof v & { detailOverride?: string } => {
    if (v.id === "roster" && v.used) {
      return { ...v, used: { ...v.used, current: effectiveRoster.length } };
    }
    if (v.id === "storefront") {
      // Real public host replaces the fixture detail; localized frame.
      // Must NOT synthesize `<slug>.tulala.digital`: branded subdomains are a
      // paid-tier feature and are provisioned per tenant, so for a Free
      // workspace that host is never attached and 404s. workspacePathHost is
      // the canonical Free address (tulala.digital/w/<slug>).
      return {
        ...v,
        detailOverride: interpolate(t("dashboard.adminWork.storefrontLivesAt"), {
          domain: workspacePathHost(effectiveTenant.slug),
        }),
      };
    }
    return v;
  });
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "18px 20px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink-muted">
            {t("dashboard.adminWork.todayOnFree")}
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.1 }} className="text-admin-ink">
            {t("dashboard.adminWork.whatWorksNow")}
          </div>
        </div>
        <GhostButton onClick={() => openDrawer("plan-compare")}>
          {t("dashboard.adminWork.comparePlans")}
        </GhostButton>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {freePlanItems.map((v, idx) => {
          const pct = v.used ? Math.min(100, Math.round((v.used.current / v.used.cap) * 100)) : 0;
          const near = v.used ? pct >= 80 : false;
          return (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 0",
                borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 999, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="bg-admin-green">
                <Icon name="check" size={11} stroke={2.5} color="#fff" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-admin-ink text-admin-13 font-semibold">
                  {t(v.labelKey)}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                  {v.detailOverride ?? t(v.detailKey)}
                </div>
              </div>
              {v.used && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      color: near ? COLORS.amber : COLORS.inkMuted,
                      letterSpacing: 0.2,
                    }}
                  >
                    {v.used.current} / {v.used.cap} {t(v.used.unitKey)}
                  </span>
                  <div
                    style={{
                      width: 60,
                      height: 4,
                      background: "rgba(11,11,13,0.06)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{ '--progress-w': `${pct}%`, '--progress-bg': near ? COLORS.amber : COLORS.fill }}
                      className="w-[var(--progress-w)] h-full bg-[var(--progress-bg)]"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}
      >
        <span style={{ fontSize: 12, flex: 1 }} className="text-admin-ink-muted">
          {t("dashboard.adminWork.capsAreSoft")}
        </span>
        <SecondaryButton onClick={() => setPage("talent")}>{t("dashboard.adminWork.openRoster")}</SecondaryButton>
        <PrimaryButton onClick={() => setPage("work")}>{t("dashboard.adminWork.seePipeline")}</PrimaryButton>
      </div>
    </div>
  );
}
