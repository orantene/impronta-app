// A7 — Workspace Discover benefits panel (admin Settings).
//
// Standalone settings page rendering the tier-specific Discover
// benefits for this workspace. Spec §10.2 + plan × Discover matrix:
//   Free      — opt-in discoverable, basic placement, 7-day analytics,
//               no bulk tools
//   Studio    — default-enroll option, 30-day analytics, bulk tools
//   Agency    — priority placement, 90-day analytics, saved cohorts
//   Network   — multi-workspace rollup, unlimited history
//
// Lives outside the mega Settings shell so it can ship without
// unblocking that extraction. Sibling to /admin/discover-performance
// (the analytics dashboard) and /admin/discover-inquiries (the list).
//
// URL-only for now — promote to admin nav with the Settings extraction.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.08)",
  amber:      "#D69E2E",
  amberSoft:  "rgba(214,158,46,0.10)",
} as const;

type PlanTier = "free" | "studio" | "agency" | "network" | "hub-network" | string;

type BenefitMatrix = {
  enrollment: string;
  placement: string;
  analyticsWindow: string;
  bulkTools: string;
  priority: string;
  multiWorkspace: string;
};

const BENEFIT_FIELDS = [
  "enrollment",
  "placement",
  "analyticsWindow",
  "bulkTools",
  "priority",
  "multiWorkspace",
] as const;

/** Catalog tier key for a raw plan_tier value. `hub-network` reuses `network`. */
function benefitTierKey(tier: PlanTier): "free" | "studio" | "agency" | "network" {
  if (tier === "studio") return "studio";
  if (tier === "agency") return "agency";
  if (tier === "network" || tier === "hub-network") return "network";
  return "free";
}

function tierBenefits(tier: PlanTier, t: Translate): BenefitMatrix {
  const tierKey = benefitTierKey(tier);
  const out = {} as Record<(typeof BENEFIT_FIELDS)[number], string>;
  for (const field of BENEFIT_FIELDS) {
    out[field] = t(`dashboard.adminDiscoverSettings.benefits.${tierKey}.${field}`);
  }
  return out;
}

function planLabel(tier: PlanTier, t: Translate): string {
  if (tier === "free") return t("dashboard.adminDiscoverSettings.planFree");
  if (tier === "studio") return t("dashboard.adminDiscoverSettings.planStudio");
  if (tier === "agency") return t("dashboard.adminDiscoverSettings.planAgency");
  if (tier === "network" || tier === "hub-network") return t("dashboard.adminDiscoverSettings.planNetwork");
  return tier;
}

async function loadDiscoverSettings(tenantId: string): Promise<{
  planTier: PlanTier;
  isDiscoverableCount: number;
  totalRosterCount: number;
}> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { planTier: "free", isDiscoverableCount: 0, totalRosterCount: 0 };
  }
  // Plan tier
  const { data: agency, error: agencyErr } = await admin
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .maybeSingle();
  if (agencyErr) logServerError("settings.discover.loadPlan", agencyErr);
  const planTier = ((agency?.plan_tier as PlanTier | null) ?? "free") as PlanTier;

  // Roster enrollment counts. Two queries: total active roster, +
  // subset where the underlying talent profile has is_discoverable=true.
  const { data: rosterRaw } = await admin
    .from("agency_talent_roster")
    .select(`talent_profiles!talent_profile_id ( is_discoverable, workflow_status )`)
    .eq("tenant_id", tenantId)
    .in("status", ["active", "pending"]);
  type Row = {
    talent_profiles:
      | { is_discoverable: boolean | null; workflow_status: string | null }
      | { is_discoverable: boolean | null; workflow_status: string | null }[]
      | null;
  };
  let total = 0;
  let discoverable = 0;
  for (const r of (rosterRaw ?? []) as Row[]) {
    const tpRaw = r.talent_profiles;
    const tp = Array.isArray(tpRaw) ? tpRaw[0] : tpRaw;
    if (!tp) continue;
    total++;
    if (tp.is_discoverable && (tp.workflow_status === "approved" || tp.workflow_status === "published")) {
      discoverable++;
    }
  }
  return { planTier, isDiscoverableCount: discoverable, totalRosterCount: total };
}

export default async function DiscoverSettingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const { planTier, isDiscoverableCount, totalRosterCount } = await loadDiscoverSettings(scope.tenantId);
  const benefits = tierBenefits(planTier, t);
  const isFree = planTier === "free";
  const enrollmentPct = totalRosterCount > 0
    ? Math.round((isDiscoverableCount / totalRosterCount) * 100)
    : 0;

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 960 }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={`/${tenantSlug}/admin/settings`}
          style={{ fontSize: 11.5, color: C.inkMuted, textDecoration: "none" }}
        >
          {t("dashboard.adminDiscoverSettings.backToSettings")}
        </Link>
      </div>

      <div className="mb-6">
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: C.ink, letterSpacing: -0.3 }}>
          {t("dashboard.adminDiscoverSettings.pageTitle")}
        </h1>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 1.5, maxWidth: 600 }}>
          {t("dashboard.adminDiscoverSettings.pageIntro")}
        </div>
      </div>

      {/* Plan tier chip + enrollment summary */}
      <div style={{
        display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24,
      }}>
        <div style={{
          padding: "12px 16px", background: C.accentSoft,
          border: `1px solid ${C.accent}33`,
          borderRadius: 10, minWidth: 220,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.accent, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {t("dashboard.adminDiscoverSettings.currentPlan")}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, marginTop: 4 }}>
            {planLabel(planTier, t)}
          </div>
        </div>
        <div style={{
          padding: "12px 16px", background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 10, minWidth: 220,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {t("dashboard.adminDiscoverSettings.enrolledTalent")}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, marginTop: 4 }}>
            {isDiscoverableCount}
            <span style={{ fontSize: 13, fontWeight: 500, color: C.inkMuted, marginLeft: 6 }}>
              {interpolate(t("dashboard.adminDiscoverSettings.enrolledOfTotal"), {
                total: totalRosterCount,
                percent: enrollmentPct,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Tier-specific benefits */}
      <div style={{
        background: C.cardBg, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: "18px 22px", marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 12 }}>
          {t("dashboard.adminDiscoverSettings.benefitsTitle")}
        </div>
        <BenefitRow label={t("dashboard.adminDiscoverSettings.rowEnrollment")}     value={benefits.enrollment} />
        <BenefitRow label={t("dashboard.adminDiscoverSettings.rowPlacement")}      value={benefits.placement} />
        <BenefitRow label={t("dashboard.adminDiscoverSettings.rowAnalytics")}      value={benefits.analyticsWindow} />
        <BenefitRow label={t("dashboard.adminDiscoverSettings.rowBulkTools")}      value={benefits.bulkTools} />
        <BenefitRow label={t("dashboard.adminDiscoverSettings.rowPriority")}       value={benefits.priority} />
        <BenefitRow label={t("dashboard.adminDiscoverSettings.rowMultiWorkspace")} value={benefits.multiWorkspace} />
      </div>

      {/* Free-plan upsell — soft amber band that doesn't compete with
          the main content. */}
      {isFree && (
        <div style={{
          padding: "14px 18px", background: C.amberSoft,
          border: `1px solid ${C.amber}33`,
          borderRadius: 10, marginBottom: 16, fontSize: 13, color: C.ink, lineHeight: 1.55,
        }}>
          <strong>{t("dashboard.adminDiscoverSettings.upsellTitle")}</strong>{" "}
          {t("dashboard.adminDiscoverSettings.upsellBody")}{" "}
          <Link
            href={`/${tenantSlug}/admin/settings`}
            style={{ color: C.accent, textDecoration: "underline" }}
          >
            {t("dashboard.adminDiscoverSettings.upsellLink")}
          </Link>.
        </div>
      )}

      {/* Quick links */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href={`/${tenantSlug}/admin/discover-performance`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 14px", background: C.accent, color: "#fff",
            borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            textDecoration: "none",
          }}
        >
          📊 {t("dashboard.adminDiscoverSettings.linkPerformance")}
        </Link>
        <Link
          href={`/${tenantSlug}/admin/discover-inquiries`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 14px", background: "transparent",
            color: C.ink, border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            textDecoration: "none",
          }}
        >
          📬 {t("dashboard.adminDiscoverSettings.linkInquiries")}
        </Link>
        <Link
          href={`/${tenantSlug}/admin/roster`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 14px", background: "transparent",
            color: C.ink, border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            textDecoration: "none",
          }}
        >
          🎭 {t("dashboard.adminDiscoverSettings.linkRoster")}
        </Link>
      </div>
    </div>
  );
}

function BenefitRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "180px 1fr",
      gap: 16, padding: "8px 0",
      borderBottom: `1px solid ${C.borderSoft}`,
      fontSize: 13,
    }}>
      <div style={{ color: C.inkMuted, fontWeight: 500 }}>{label}</div>
      <div style={{ color: C.ink }}>{value}</div>
    </div>
  );
}
