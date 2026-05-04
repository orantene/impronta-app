// Phase 3 — canonical workspace Account & Billing page.
// Server Component — no "use client".
//
// Shows plan tier, roster usage, subscription state, and agency identity.
// Upgrade CTAs wire through Stripe Checkout (paid plans) or direct DB write (free).
// Manage subscription CTA opens Stripe Billing Portal for active subscribers.
// Capability gate: agency.workspace.view (viewer+). Billing CTAs: manage_billing (admin+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  loadWorkspaceAgencySummary,
  loadWorkspaceBillingState,
  type WorkspacePlan,
} from "../../_data-bridge";
import {
  UpgradePlanButton,
  ManageSubscriptionButton,
  SubscriptionStatusBadge,
} from "./BillingActionButtons";
import { isStripeConfigured } from "@/lib/stripe/client";

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
  green:      "#2E7D5B",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(180,130,20,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Plan meta ────────────────────────────────────────────────────────────────

const PLAN_META: Record<
  WorkspacePlan,
  { label: string; bg: string; color: string; tagline: string; price: string | null }
> = {
  free: {
    label: "Free",
    bg: "rgba(11,11,13,0.07)",
    color: "rgba(11,11,13,0.55)",
    tagline: "Friend-link access only. No commission.",
    price: null,
  },
  studio: {
    label: "Studio",
    bg: "rgba(180,130,20,0.10)",
    color: "#8A6F1A",
    tagline: "Auto-exclusive roster, ~10–12% commission.",
    price: "$49 / month",
  },
  agency: {
    label: "Agency",
    bg: "rgba(30,80,160,0.10)",
    color: "#2B5F8A",
    tagline: "Auto-exclusive roster, ~15–20% commission.",
    price: "$149 / month",
  },
  network: {
    label: "Network",
    bg: "rgba(100,50,200,0.10)",
    color: "#6B3EC2",
    tagline: "Unlimited roster. Platform-wide placement.",
    price: null,
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
          width: 140,
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
        <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>Roster</span>
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
      <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>Roster</span>
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

function Divider() {
  return <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />;
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

  const [canManageBilling, summary, billingState] = await Promise.all([
    userHasCapability("manage_billing", scope.tenantId),
    loadWorkspaceAgencySummary(scope.tenantId),
    loadWorkspaceBillingState(scope.tenantId),
  ]);

  const stripeEnabled = isStripeConfigured();
  const planMeta = summary ? PLAN_META[summary.plan] : PLAN_META.free;

  // Subscription is "active" when there's a billing record with a non-cancelled status
  const hasActiveSubscription =
    !!billingState &&
    billingState.status !== "cancelled" &&
    billingState.status !== "incomplete_expired";

  // Format billing period end for display
  const periodEndLabel = billingState?.currentPeriodEnd
    ? new Date(billingState.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

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
            Workspace settings →
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
                <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>
                  Current plan
                </span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: planMeta.bg,
                      color: planMeta.color,
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: 0.1,
                    }}
                  >
                    {planMeta.label}
                  </span>
                  <span style={{ fontSize: 12, color: C.inkMuted }}>
                    {planMeta.tagline}
                  </span>
                </div>
              </div>

              <Divider />
              <RosterUsageBar count={summary.talentCount} limit={summary.talentLimit} />

              {/* Subscription state rows (only when there's a Stripe record) */}
              {billingState && (
                <>
                  <Divider />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 16px",
                      fontFamily: FONT,
                    }}
                  >
                    <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>
                      Billing status
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SubscriptionStatusBadge status={billingState.status} />
                      {billingState.cancelAtPeriodEnd && (
                        <span style={{ fontSize: 11.5, color: C.amber, fontFamily: FONT }}>
                          Cancels at period end
                        </span>
                      )}
                    </div>
                  </div>

                  {planMeta.price && (
                    <>
                      <Divider />
                      <DetailRow label="Price" value={planMeta.price} />
                    </>
                  )}

                  {periodEndLabel && (
                    <>
                      <Divider />
                      <DetailRow
                        label={billingState.cancelAtPeriodEnd ? "Access until" : "Next renewal"}
                        value={periodEndLabel}
                      />
                    </>
                  )}

                  {billingState.trialEnd && billingState.status === "trialing" && (
                    <>
                      <Divider />
                      <DetailRow
                        label="Trial ends"
                        value={new Date(billingState.trialEnd).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      />
                    </>
                  )}
                </>
              )}

              <Divider />
              <DetailRow
                label="Workspace slug"
                value={
                  <span style={{ fontFamily: "monospace", fontSize: 12.5 }}>
                    {summary.slug}
                  </span>
                }
              />
            </div>

            {/* Billing CTAs */}
            {canManageBilling && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {hasActiveSubscription ? (
                  // Existing subscriber → Billing Portal
                  <ManageSubscriptionButton tenantSlug={tenantSlug} />
                ) : stripeEnabled && summary.plan === "free" ? (
                  // Free tier + Stripe configured → show upgrade options
                  <>
                    <UpgradePlanButton
                      plan="studio"
                      tenantSlug={tenantSlug}
                      label="Upgrade to Studio — $49/mo"
                    />
                    <UpgradePlanButton
                      plan="agency"
                      tenantSlug={tenantSlug}
                      label="Upgrade to Agency — $149/mo"
                    />
                  </>
                ) : !stripeEnabled && summary.plan === "free" ? (
                  // Stripe not configured yet — show a contact note
                  <p style={{ fontSize: 12, color: C.inkMuted, margin: 0, fontFamily: FONT }}>
                    Billing not yet active. Contact support to upgrade.
                  </p>
                ) : null}
              </div>
            )}
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
                  <Divider />
                  <DetailRow label="Contact email" value={summary.contactEmail} />
                </>
              )}

              {summary.contactPhone && (
                <>
                  <Divider />
                  <DetailRow label="Phone" value={summary.contactPhone} />
                </>
              )}

              {summary.addressCity && (
                <>
                  <Divider />
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
