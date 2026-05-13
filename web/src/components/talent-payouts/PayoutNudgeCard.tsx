"use client";

/**
 * PayoutNudgeCard — small CTA card surfaced in the talent Offer tab
 * (and elsewhere) when the talent's Stripe Connect Express account
 * is not yet KYC-enabled.
 *
 * Messages Consolidation Plan v2 — Item #14.
 *
 * Hides itself entirely when the account is enabled — non-blocking
 * once the talent is ready to receive payouts.
 */

import Link from "next/link";

type Status = "none" | "pending" | "enabled" | "restricted" | "disabled";

export function PayoutNudgeCard({
  tenantSlug,
  status,
  /** Bookings the talent has accepted but can't yet receive payout
   *  on (because Stripe isn't enabled). When > 0, the nudge tone
   *  gets sharper. */
  pendingPayouts = 0,
}: {
  tenantSlug: string;
  status: Status;
  pendingPayouts?: number;
}) {
  // Don't render at all when payouts are ready.
  if (status === "enabled") return null;

  const isPending = status === "pending";
  const isBlocked = status === "restricted" || status === "disabled";

  const palette = isBlocked
    ? { bg: "rgba(214,89,89,0.07)", border: "rgba(214,89,89,0.22)", fg: "#A33A3A" }
    : isPending
    ? { bg: "rgba(138,111,26,0.08)", border: "rgba(138,111,26,0.22)", fg: "#8A6F1A" }
    : { bg: "rgba(15,79,62,0.05)", border: "rgba(15,79,62,0.20)", fg: "#0F4F3E" };

  const title = isBlocked
    ? "Stripe needs more info from you"
    : isPending
    ? "Finish Stripe onboarding"
    : "Connect your bank to receive payouts";

  const body = isBlocked
    ? "Stripe paused payouts until you complete the requirements they flagged. Open Stripe to resolve."
    : isPending
    ? "You started Stripe onboarding but haven't finished. Open it again to complete."
    : pendingPayouts > 0
    ? `You have ${pendingPayouts} accepted booking${pendingPayouts === 1 ? "" : "s"} ready to pay out — connect Stripe so we can transfer your earnings.`
    : "Set up Stripe Express once and we'll auto-transfer your share of every booking. Stripe handles the bank + tax info.";

  return (
    <div
      data-payout-nudge
      role="region"
      aria-labelledby="payout-nudge-title"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        fontFamily: '"Inter", system-ui, sans-serif',
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        maxWidth: 560, width: "100%",
      }}
    >
      <span aria-hidden style={{
        flexShrink: 0,
        width: 28, height: 28, borderRadius: 8,
        background: "rgba(255,255,255,0.7)", color: palette.fg,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="4" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M2 6h10" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div id="payout-nudge-title" style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          color: palette.fg, textTransform: "uppercase",
        }}>
          Payouts
        </div>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: "#0B0B0D", marginTop: 2, lineHeight: 1.35,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 12, color: "rgba(11,11,13,0.65)", marginTop: 4, lineHeight: 1.5,
        }}>
          {body}
        </div>
        <Link
          href={`/${tenantSlug}/talent/settings/payouts`}
          style={{
            display: "inline-block",
            marginTop: 10,
            padding: "7px 13px", borderRadius: 999,
            background: "#fff", color: palette.fg,
            border: `1px solid ${palette.border}`,
            fontSize: 12, fontWeight: 700,
            textDecoration: "none",
            fontFamily: '"Inter", system-ui, sans-serif',
            minHeight: 32,
          }}
        >
          {isPending || isBlocked ? "Open Stripe →" : "Connect Stripe →"}
        </Link>
      </div>
    </div>
  );
}
