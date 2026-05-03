// Phase 3 — canonical workspace Account & Billing page.
// Server Component — no "use client".
//
// Shows plan tier, roster usage, and agency identity for the tenant.
// Manage-billing CTA gated on manage_billing (admin+).
// Capability gate: agency.workspace.view (viewer+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceAgencySummary, type WorkspacePlan } from "../../_data-bridge";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Plan meta ────────────────────────────────────────────────────────────────

const PLAN_META: Record<
  WorkspacePlan,
  { label: string; bg: string; color: string; tagline: string }
> = {
  free: {
    label: "Free",
    bg: "rgba(11,11,13,0.07)",
    color: "rgba(11,11,13,0.55)",
    tagline: "Friend-link access only. No commission.",
  },
  studio: {
    label: "Studio",
    bg: "rgba(180,130,20,0.10)",
    color: "#8A6F1A",
    tagline: "Auto-exclusive roster, ~10–12% commission.",
  },
  agency: {
    label: "Agency",
    bg: "rgba(30,80,160,0.10)",
    color: "#2B5F8A",
    tagline: "Auto-exclusive roster, ~15–20% commission.",
  },
  network: {
    label: "Network",
    bg: "rgba(100,50,200,0.10)",
    color: "#6B3EC2",
    tagline: "Unlimited roster. Platform-wide placement.",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase" as const,
        color: C.inkDim,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 120,
          fontSize: 12,
          color: C.inkMuted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 500,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function RosterUsageBar({ count, limit }: { count: number; limit: number | null }) {
  if (limit === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 16px",
          fontFamily: FONT,
        }}
      >
        <span style={{ flexShrink: 0, width: 120, fontSize: 12, color: C.inkMuted }}>Roster</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
          <span style={{ fontSize: 12, color: C.inkMuted }}>of unlimited</span>
        </div>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min((count / limit) * 100, 100) : 0;
  const nearLimit = pct >= 80;
  const barColor = nearLimit ? "#D4A017" : C.accent;
  const countColor = nearLimit ? "#8A6F1A" : C.ink;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span style={{ flexShrink: 0, width: 120, fontSize: 12, color: C.inkMuted }}>Roster</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: countColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </span>
          <span style={{ fontSize: 12, color: C.inkMuted }}>of {limit}</span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "rgba(11,11,13,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 999,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceAccountPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);

  const summary = await loadWorkspaceAgencySummary(scope.tenantId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: 4,
            }}
          >
            {scope.membership.display_name}
          </div>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            Account &amp; billing
          </h1>
        </div>

        {canManageBilling && (
          <Link
            href={`/${tenantSlug}/admin/settings`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            Manage →
          </Link>
        )}
      </div>

      {summary ? (
        <>
          {/* ── Plan section ── */}
          <section>
            <SectionHead>Plan</SectionHead>
            <div
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* Current plan row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 16px",
                  fontFamily: FONT,
                }}
              >
                <span style={{ flexShrink: 0, width: 120, fontSize: 12, color: C.inkMuted }}>
                  Current plan
                </span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: PLAN_META[summary.plan].bg,
                      color: PLAN_META[summary.plan].color,
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: 0.1,
                    }}
                  >
                    {PLAN_META[summary.plan].label}
                  </span>
                  <span style={{ fontSize: 12, color: C.inkMuted }}>
                    {PLAN_META[summary.plan].tagline}
                  </span>
                </div>
              </div>

              <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />

              <RosterUsageBar count={summary.talentCount} limit={summary.talentLimit} />

              <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />

              <DetailRow
                label="Workspace slug"
                value={
                  <span style={{ fontFamily: "monospace", fontSize: 12.5 }}>
                    {summary.slug}
                  </span>
                }
              />
            </div>
          </section>

          {/* ── Agency identity section ── */}
          <section>
            <SectionHead>Agency identity</SectionHead>
            <div
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <DetailRow label="Display name" value={summary.displayName} />

              {summary.contactEmail && (
                <>
                  <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />
                  <DetailRow label="Contact email" value={summary.contactEmail} />
                </>
              )}

              {summary.contactPhone && (
                <>
                  <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />
                  <DetailRow label="Phone" value={summary.contactPhone} />
                </>
              )}

              {summary.addressCity && (
                <>
                  <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />
                  <DetailRow
                    label="Location"
                    value={
                      [summary.addressCity, summary.addressCountry]
                        .filter(Boolean)
                        .join(", ")
                    }
                  />
                </>
              )}
            </div>

            {canManageBilling && (
              <p
                style={{
                  marginTop: 8,
                  paddingLeft: 2,
                  fontSize: 12,
                  color: C.inkMuted,
                  fontFamily: FONT,
                }}
              >
                Update at{" "}
                <Link
                  href={`/${tenantSlug}/admin/site-settings/identity`}
                  style={{ color: C.accent, textDecoration: "underline" }}
                >
                  Site → Identity
                </Link>
              </p>
            )}
          </section>
        </>
      ) : (
        <div
          style={{
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 13, color: C.inkMuted }}>Account details unavailable.</p>
        </div>
      )}
    </div>
  );
}
