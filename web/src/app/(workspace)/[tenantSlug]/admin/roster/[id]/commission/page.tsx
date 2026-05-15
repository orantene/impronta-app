// A8 — Discover commission preview (per-talent, roster-scoped).
//
// Standalone route: /<tenant>/admin/roster/<talentId>/commission
//
// The roster-drawer commission preview was the last genuinely-deferred
// Discover audit item — it was "blocked" only because the obvious home
// (the roster-edit drawer) is a mega-area under concurrent edit. This
// ships it as a sibling standalone route instead (same pattern as
// /admin/settings/discover, /talent/discover, etc.), so the mega-file
// stays untouched and there's zero merge-conflict risk.
//
// What it shows: a what-if commission split for booking THIS talent
// through Discover, computed with the real resolver
// (resolveBookingCommissions) against this workspace's plan tier +
// platform config + any per-tenant override. Sample booking amount is
// adjustable via ?gross= and ?talent= query params (cents-free dollar
// inputs); defaults to a $1,000 booking with a $700 talent cost.
//
// Spec: project_commission_model.md + project_discover_unified.md §10.2 (A8).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveBookingCommissions,
  CommissionResolutionError,
  type WorkspacePlanTier,
  type PlatformCommissionConfig,
  type WorkspaceCommissionOverride,
  type BookingCommissionSnapshot,
} from "@/lib/billing/commission";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string; id: string }>;
type PageSearch = Promise<{ gross?: string; talent?: string }>;

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
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#D69E2E",
  amberSoft:  "rgba(214,158,46,0.10)",
  platform:   "#7C3AED",
  platformSoft: "rgba(124,58,237,0.10)",
} as const;

const PLAN_LABEL: Record<WorkspacePlanTier, string> = {
  free: "Free", studio: "Studio", agency: "Agency", network: "Network",
};

function normalizePlan(raw: string | null): WorkspacePlanTier {
  if (raw === "studio" || raw === "agency" || raw === "network") return raw;
  if (raw === "hub-network") return "network";
  return "free";
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function clampDollarsToCents(raw: string | undefined, fallbackCents: number): number {
  if (!raw) return fallbackCents;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return fallbackCents;
  return Math.round(n * 100);
}

export default async function CommissionPreviewPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearch;
}) {
  const { tenantSlug, id: talentId } = await params;
  const { gross: grossRaw, talent: talentRaw } = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) notFound();

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  // ── Talent (name) + roster membership guard ──
  const { data: talent } = await admin
    .from("talent_profiles")
    .select("id, display_name, first_name, last_name")
    .eq("id", talentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!talent) notFound();

  const { data: roster } = await admin
    .from("agency_talent_roster")
    .select("status")
    .eq("tenant_id", scope.tenantId)
    .eq("talent_profile_id", talentId)
    .neq("status", "removed")
    .maybeSingle();
  if (!roster) notFound();

  const talentName =
    ((talent.display_name as string | null) ?? "").trim()
    || `${(talent.first_name as string | null) ?? ""} ${(talent.last_name as string | null) ?? ""}`.trim()
    || "This talent";

  // ── Workspace plan tier ──
  const { data: agency, error: agencyErr } = await admin
    .from("agencies")
    .select("plan_tier")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (agencyErr) logServerError("roster.commission.plan", agencyErr);
  const workspacePlan = normalizePlan((agency?.plan_tier as string | null) ?? null);

  // ── Platform commission config (singleton) ──
  const { data: cfgRow, error: cfgErr } = await admin
    .from("platform_commission_config")
    .select("default_take_bps, default_take_floor_cents, plan_tier_bps")
    .limit(1)
    .maybeSingle();
  if (cfgErr) logServerError("roster.commission.config", cfgErr);
  const platformConfig: PlatformCommissionConfig = {
    default_take_bps: (cfgRow?.default_take_bps as number | null) ?? 500,
    default_take_floor_cents: (cfgRow?.default_take_floor_cents as number | null) ?? 0,
    plan_tier_bps: (cfgRow?.plan_tier_bps as Record<string, number> | null) ?? {},
  };

  // ── Per-tenant override (optional) ──
  const { data: ovr } = await admin
    .from("workspace_commission_overrides")
    .select("platform_take_bps, platform_take_floor_cents")
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  const tenantOverride: WorkspaceCommissionOverride | null = ovr
    ? {
        platform_take_bps: (ovr.platform_take_bps as number | null) ?? null,
        platform_take_floor_cents: (ovr.platform_take_floor_cents as number | null) ?? null,
      }
    : null;

  // ── Sample booking (adjustable via query params) ──
  const grossCents = clampDollarsToCents(grossRaw, 100_000); // $1,000
  const rawTalentCents = clampDollarsToCents(talentRaw, 70_000); // $700
  // Talent cost can't exceed gross — clamp so the resolver doesn't throw.
  const talentCostCents = Math.min(rawTalentCents, grossCents);

  let snapshot: BookingCommissionSnapshot | null = null;
  let resolverError: string | null = null;
  try {
    snapshot = resolveBookingCommissions({
      tenantId: scope.tenantId,
      workspacePlan,
      offerLineItems: [
        {
          units: 1,
          unit_price_cents: grossCents,
          talent_cost_cents: talentCostCents,
        },
      ],
      currencyCode: "USD",
      paymentMethod: "card",
      platformConfig,
      tenantOverride,
    });
  } catch (err) {
    resolverError =
      err instanceof CommissionResolutionError ? err.code : "unknown_error";
    logServerError("roster.commission.resolve", err);
  }

  const RESOLVED_FROM_LABEL: Record<string, string> = {
    platform_default: "Platform default rate",
    plan_tier: `${PLAN_LABEL[workspacePlan]}-plan rate`,
    tenant_override: "Negotiated rate for this workspace",
    booking_override: "Per-booking override",
  };

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 880 }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={`/${tenantSlug}/admin/roster/${talentId}`}
          style={{ fontSize: 11.5, color: C.inkMuted, textDecoration: "none" }}
        >
          ← Back to {talentName}
        </Link>
      </div>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: C.ink, letterSpacing: -0.3 }}>
          Commission preview
        </h1>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 1.5, maxWidth: 600 }}>
          What you and Tulala take if you book <strong>{talentName}</strong>{" "}
          through Discover. Computed with the live resolver against your{" "}
          <strong>{PLAN_LABEL[workspacePlan]}</strong> plan. Adjust the
          sample below to model different rates.
        </div>
      </div>

      {/* Sample inputs — GET form, server re-renders with new query params */}
      <form
        method="GET"
        style={{
          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
          padding: "14px 16px", background: C.surface,
          border: `1px solid ${C.borderSoft}`, borderRadius: 10, marginBottom: 20,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.inkMuted }}>
          Client pays (gross)
          <input
            name="gross"
            type="number"
            min="0"
            step="50"
            defaultValue={(grossCents / 100).toString()}
            style={{
              padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`,
              fontSize: 13, fontFamily: FONT, width: 130,
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.inkMuted }}>
          Talent cost
          <input
            name="talent"
            type="number"
            min="0"
            step="50"
            defaultValue={(talentCostCents / 100).toString()}
            style={{
              padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`,
              fontSize: 13, fontFamily: FONT, width: 130,
            }}
          />
        </label>
        <button
          type="submit"
          style={{
            padding: "8px 16px", borderRadius: 7, border: "none",
            background: C.accent, color: "#fff", fontSize: 12.5,
            fontWeight: 600, cursor: "pointer", fontFamily: FONT,
          }}
        >
          Recalculate
        </button>
      </form>

      {resolverError ? (
        <div style={{
          padding: "14px 18px", background: C.amberSoft,
          border: `1px solid ${C.amber}33`, borderRadius: 10,
          fontSize: 13, color: C.ink, lineHeight: 1.55,
        }}>
          <strong>Can&apos;t compute this split.</strong>{" "}
          {resolverError === "talent_cost_exceeds_price"
            ? "Talent cost is higher than what the client pays — re-enter so talent cost ≤ gross."
            : resolverError === "currency_invalid"
              ? "Currency misconfigured."
              : `Resolver error: ${resolverError}.`}
        </div>
      ) : snapshot ? (
        <>
          {/* Three-lane split */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14, marginBottom: 18,
          }}>
            <LaneCard
              title="Talent net"
              amount={dollars(snapshot.talent_net_cents)}
              pct={snapshot.gross_cents > 0 ? Math.round((snapshot.talent_net_cents / snapshot.gross_cents) * 100) : 0}
              bg={C.successSoft}
              fg={C.success}
              note="Paid to the talent (or their payout account)."
            />
            <LaneCard
              title="Your workspace fee"
              amount={dollars(snapshot.workspace_fee_cents)}
              pct={snapshot.gross_cents > 0 ? Math.round((snapshot.workspace_fee_cents / snapshot.gross_cents) * 100) : 0}
              bg={C.accentSoft}
              fg={C.accent}
              note="Your margin = (client price − talent cost) per line."
            />
            <LaneCard
              title="Tulala platform fee"
              amount={dollars(snapshot.platform_fee_cents)}
              pct={snapshot.gross_cents > 0 ? Math.round((snapshot.platform_fee_cents / snapshot.gross_cents) * 100) : 0}
              bg={C.platformSoft}
              fg={C.platform}
              note={`${(snapshot.platform_take_bps / 100).toFixed(2)}% take${snapshot.platform_take_floor_cents > 0 ? ` (min ${dollars(snapshot.platform_take_floor_cents)})` : ""}.`}
            />
          </div>

          {/* Summary row */}
          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "16px 20px", marginBottom: 16,
          }}>
            <SummaryRow label="Client pays (gross)" value={dollars(snapshot.gross_cents)} bold />
            <SummaryRow label="− Tulala platform fee" value={`− ${dollars(snapshot.platform_fee_cents)}`} />
            <SummaryRow label="− Your workspace fee" value={`− ${dollars(snapshot.workspace_fee_cents)}`} />
            <SummaryRow label="= Talent net" value={dollars(snapshot.talent_net_cents)} bold last />
          </div>

          {/* Resolution provenance */}
          <div style={{
            padding: "10px 14px", background: C.accentSoft,
            border: `1px solid ${C.accent}22`, borderRadius: 10,
            fontSize: 12, color: C.ink, lineHeight: 1.5,
          }}>
            <strong>Platform take resolved from:</strong>{" "}
            {RESOLVED_FROM_LABEL[snapshot.resolved_from] ?? snapshot.resolved_from}{" "}
            ({(snapshot.platform_take_bps / 100).toFixed(2)}%).{" "}
            {workspacePlan === "free"
              ? "Free-plan workspaces keep their full workspace fee — no exclusivity, no plan-tier discount on the platform take."
              : `${PLAN_LABEL[workspacePlan]} plan applies its negotiated platform-take tier.`}
          </div>
        </>
      ) : null}

      <div style={{
        marginTop: 18, fontSize: 11, color: C.inkDim, lineHeight: 1.55,
      }}>
        This is a model, not a quote. Actual splits are frozen onto the
        booking at acceptance time from the real offer line items. Off-
        platform (cash) bookings settle via the balance ledger instead
        of an instant Stripe split — see the commission model spec.
      </div>
    </div>
  );
}

function LaneCard({
  title, amount, pct, bg, fg, note,
}: {
  title: string; amount: string; pct: number; bg: string; fg: string; note: string;
}) {
  return (
    <div style={{
      background: bg, border: `1px solid ${fg}22`,
      borderRadius: 12, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: fg, letterSpacing: 0.3, textTransform: "uppercase" }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 6 }}>
        {amount}
      </div>
      <div style={{ fontSize: 11.5, color: fg, fontWeight: 600, marginTop: 2 }}>
        {pct}% of gross
      </div>
      <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8, lineHeight: 1.45 }}>
        {note}
      </div>
    </div>
  );
}

function SummaryRow({
  label, value, bold = false, last = false,
}: {
  label: string; value: string; bold?: boolean; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0",
      borderBottom: last ? "none" : `1px solid ${C.borderSoft}`,
      fontSize: 13.5,
      fontWeight: bold ? 700 : 500,
      color: bold ? C.ink : C.inkMuted,
    }}>
      <span>{label}</span>
      <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
