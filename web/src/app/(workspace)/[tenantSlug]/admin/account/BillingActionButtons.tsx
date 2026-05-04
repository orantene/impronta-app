"use client";

/**
 * BillingActionButtons — client component for workspace billing CTAs.
 *
 * Renders an "Upgrade" button (→ Stripe Checkout) or "Manage subscription"
 * button (→ Billing Portal) depending on whether the tenant has an active
 * subscription.
 *
 * Uses useTransition for loading state. On success, redirects to the Stripe
 * URL returned by the server action.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { startWorkspaceUpgrade, openSubscriptionPortal } from "./stripe-billing-actions";
import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";

const C = {
  accent:     "#0F4F3E",
  accentHov:  "#0a3d2f",
  white:      "#ffffff",
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  border:     "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(180,130,20,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Upgrade button (free → paid) ─────────────────────────────────────────────

export function UpgradePlanButton({
  plan,
  tenantSlug,
  label = `Upgrade to ${plan}`,
}: {
  plan: WorkspacePlanKey;
  tenantSlug: string;
  label?: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await startWorkspaceUpgrade(plan, tenantSlug);
      if (result.ok) {
        // Redirect to Stripe Checkout
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
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
          background: pending ? "rgba(15,79,62,0.6)" : C.accent,
          color: C.white,
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          border: "none",
          cursor: pending ? "not-allowed" : "pointer",
          letterSpacing: -0.1,
          transition: "background 0.12s",
        }}
      >
        {pending ? "Redirecting…" : label}
      </button>
      {error && (
        <span style={{ fontSize: 11.5, color: "#c0392b", fontFamily: FONT }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Billing portal button (paid → manage) ────────────────────────────────────

export function ManageSubscriptionButton({ tenantSlug }: { tenantSlug: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await openSubscriptionPortal(tenantSlug);
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
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
          letterSpacing: -0.1,
          opacity: pending ? 0.6 : 1,
          transition: "opacity 0.1s",
        }}
      >
        {pending ? "Opening portal…" : "Manage subscription →"}
      </button>
      {error && (
        <span style={{ fontSize: 11.5, color: "#c0392b", fontFamily: FONT }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Subscription status badge ────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  active:             { label: "Active",          bg: "rgba(46,125,91,0.08)",  color: "#2E7D5B" },
  trialing:           { label: "Trial",           bg: "rgba(27,110,200,0.08)", color: "#1B6EC8" },
  past_due:           { label: "Past due",        bg: "rgba(200,100,20,0.10)", color: "#B05B0D" },
  cancelled:          { label: "Cancelled",       bg: "rgba(11,11,13,0.06)",   color: "rgba(11,11,13,0.55)" },
  paused:             { label: "Paused",          bg: "rgba(180,130,20,0.10)", color: "#8A6F1A" },
  incomplete:         { label: "Incomplete",      bg: "rgba(200,100,20,0.08)", color: "#B05B0D" },
  incomplete_expired: { label: "Expired",         bg: "rgba(11,11,13,0.06)",   color: "rgba(11,11,13,0.55)" },
};

export function SubscriptionStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, bg: "rgba(11,11,13,0.06)", color: "rgba(11,11,13,0.55)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.1,
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: meta.color,
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  );
}
