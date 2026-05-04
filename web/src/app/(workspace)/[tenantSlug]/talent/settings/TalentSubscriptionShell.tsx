"use client";

/**
 * TalentSubscriptionShell — subscription section in talent settings.
 *
 * Shows current tier (Basic / Pro / Portfolio), what each tier unlocks,
 * and upgrade / manage CTAs wired through Stripe.
 */

import * as React from "react";
import { startTalentUpgrade, openTalentSubscriptionPortal } from "./stripe-talent-actions";
import type { TalentSubscriptionState } from "../../_data-bridge";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  violet:     "#7D5CFF",
  violetSoft: "rgba(125,92,255,0.08)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(180,130,20,0.08)",
  orange:     "#D96B3A",
  orangeSoft: "rgba(217,107,58,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Plan metadata ────────────────────────────────────────────────────────────

const PLAN_META = {
  talent_basic: {
    label: "Basic",
    price: "Free",
    tagline: "Standard profile on tulala.digital/t/<slug>",
    color: "rgba(11,11,13,0.55)",
    bg: "rgba(11,11,13,0.06)",
    perks: [
      "Public profile at tulala.digital/t/<slug>",
      "Photo gallery",
      "Agency roster participation",
    ],
  },
  talent_pro: {
    label: "Pro",
    price: "$12 / month",
    tagline: "Richer presentation and media embeds",
    color: C.violet,
    bg: C.violetSoft,
    perks: [
      "Everything in Basic",
      "Video and audio embeds",
      "Enhanced media gallery",
      "Social links surfaced prominently",
      "Portfolio presentation mode",
    ],
  },
  talent_portfolio: {
    label: "Portfolio",
    price: "$29 / month",
    tagline: "Your branded talent page with custom domain",
    color: C.orange,
    bg: C.orangeSoft,
    perks: [
      "Everything in Pro",
      "Custom domain (yourdomain.com)",
      "Multi-template choice",
      "SEO controls",
      "One-page builder-lite",
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_META;

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlanChip({ planKey }: { planKey: PlanKey }) {
  const meta = PLAN_META[planKey];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.1,
        fontFamily: FONT,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
}

function UpgradeButton({
  plan,
  tenantSlug,
  label,
}: {
  plan: TalentPlanKey;
  tenantSlug: string;
  label: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await startTalentUpgrade(plan, tenantSlug);
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 34,
          padding: "0 16px",
          borderRadius: 8,
          background: pending ? "rgba(15,79,62,0.5)" : C.accent,
          color: "#fff",
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          border: "none",
          cursor: pending ? "not-allowed" : "pointer",
          letterSpacing: -0.1,
          transition: "background 0.1s",
        }}
      >
        {pending ? "Redirecting…" : label}
      </button>
      {error && <span style={{ fontSize: 11, color: "#c0392b", fontFamily: FONT }}>{error}</span>}
    </div>
  );
}

function ManageButton({ tenantSlug }: { tenantSlug: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await openTalentSubscriptionPortal(tenantSlug);
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 34,
          padding: "0 14px",
          borderRadius: 8,
          background: C.cardBg,
          color: C.ink,
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          border: `1px solid ${C.border}`,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
          transition: "opacity 0.1s",
        }}
      >
        {pending ? "Opening…" : "Manage subscription →"}
      </button>
      {error && <span style={{ fontSize: 11, color: "#c0392b", fontFamily: FONT }}>{error}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TalentSubscriptionShell({
  tenantSlug,
  planKey: rawPlanKey,
  subscription,
  stripeEnabled,
}: {
  tenantSlug: string;
  planKey: string;
  subscription: TalentSubscriptionState | null;
  stripeEnabled: boolean;
}) {
  const planKey: PlanKey =
    rawPlanKey === "talent_pro" || rawPlanKey === "talent_portfolio"
      ? rawPlanKey
      : "talent_basic";

  const meta = PLAN_META[planKey];

  const hasActiveSub =
    !!subscription &&
    subscription.status !== "cancelled" &&
    subscription.status !== "incomplete_expired";

  const periodEndLabel = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section header */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: C.inkDim,
          fontFamily: FONT,
        }}
      >
        Personal page plan
      </div>

      {/* Current plan card */}
      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Current plan row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            fontFamily: FONT,
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <PlanChip planKey={planKey} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
              {meta.label} — {meta.price}
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{meta.tagline}</div>
          </div>
        </div>

        {/* What's included */}
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkDim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, fontFamily: FONT }}>
            Included
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {meta.perks.map((p) => (
              <li key={p} style={{ fontSize: 12.5, color: C.inkMuted, fontFamily: FONT }}>{p}</li>
            ))}
          </ul>
        </div>

        {/* Subscription status (paid tiers only) */}
        {hasActiveSub && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: `1px solid ${C.borderSoft}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: FONT,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px",
                borderRadius: 999,
                background: subscription!.status === "active" ? "rgba(46,125,91,0.08)" : C.amberSoft,
                color: subscription!.status === "active" ? C.green : C.amber,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: subscription!.status === "active" ? C.green : C.amber,
                }}
              />
              {subscription!.status === "trialing" ? "Trial" : "Active"}
            </span>
            {periodEndLabel && (
              <span style={{ fontSize: 11.5, color: C.inkMuted }}>
                {subscription!.cancelAtPeriodEnd ? `Cancels ${periodEndLabel}` : `Renews ${periodEndLabel}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Upgrade plans (only shown when on lower tier + Stripe enabled) */}
      {stripeEnabled && planKey === "talent_basic" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {(["talent_pro", "talent_portfolio"] as TalentPlanKey[]).map((p) => {
            const pm = PLAN_META[p];
            return (
              <div
                key={p}
                style={{
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "14px 14px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <PlanChip planKey={p} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
                    {pm.price}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: FONT, lineHeight: 1.4 }}>
                  {pm.tagline}
                </div>
                <UpgradeButton plan={p} tenantSlug={tenantSlug} label={`Upgrade to ${pm.label}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* Pro → upgrade to Portfolio */}
      {stripeEnabled && planKey === "talent_pro" && !hasActiveSub && (
        <UpgradeButton plan="talent_portfolio" tenantSlug={tenantSlug} label="Upgrade to Portfolio — $29/mo" />
      )}

      {/* Manage subscription (paid active subscribers) */}
      {hasActiveSub && <ManageButton tenantSlug={tenantSlug} />}

      {/* Stripe not configured */}
      {!stripeEnabled && planKey === "talent_basic" && (
        <p style={{ fontSize: 12, color: C.inkMuted, margin: 0, fontFamily: FONT }}>
          Pro and Portfolio upgrades coming soon.
        </p>
      )}
    </section>
  );
}
