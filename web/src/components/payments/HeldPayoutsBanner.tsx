"use client";

/**
 * Held-payouts banner — "you have €X waiting on bank connection".
 *
 * Shows the sum of a payee's held payout legs (earnings from confirmed,
 * paid bookings that couldn't transfer because their Stripe account wasn't
 * onboarded yet). Rendered on the talent + workspace payouts pages above the
 * Connect CTA — the concrete, money-on-the-table reason to finish onboarding.
 * Renders nothing when there's nothing held.
 *
 * Held legs auto-release the moment the account is enabled (account.updated
 * webhook + daily reconcile cron), so the banner disappears on its own.
 */

type HeldTotal = { currency: string; amountCents: number; count: number };

function formatMoney(amountCents: number, currency: string): string {
  const code = (currency || "mxn").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(
      amountCents / 100,
    );
  } catch {
    // Unknown currency code — fall back to a plain amount + code.
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

export function HeldPayoutsBanner({
  held,
  audience,
}: {
  held: HeldTotal[] | null | undefined;
  audience: "talent" | "workspace";
}) {
  const rows = (held ?? []).filter((h) => h.amountCents > 0);
  if (rows.length === 0) return null;

  const totalCount = rows.reduce((n, r) => n + r.count, 0);
  const amounts = rows.map((r) => formatMoney(r.amountCents, r.currency)).join(" + ");
  const noun = audience === "talent" ? "your earnings" : "this workspace's earnings";

  return (
    <div
      data-testid="held-payouts-banner"
      role="status"
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        background: "rgba(138,111,26,0.10)",
        border: "1px solid rgba(138,111,26,0.28)",
        borderRadius: 12,
        fontFamily: '"Inter", system-ui, sans-serif',
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1.2 }}>💸</span>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0B0B0D", lineHeight: 1.35 }}>
          {amounts} in payouts waiting to be released
        </div>
        <div style={{ fontSize: 12, color: "rgba(11,11,13,0.62)", marginTop: 3, lineHeight: 1.5 }}>
          {`${totalCount} confirmed booking${totalCount === 1 ? "" : "s"}`} already paid {noun} — finish
          connecting your bank below and we&apos;ll transfer it automatically. Nothing is lost; it&apos;s
          held safely until you&apos;re set up.
        </div>
      </div>
    </div>
  );
}
