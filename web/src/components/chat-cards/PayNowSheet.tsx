"use client";

/**
 * PayNowSheet — bottom-sheet that wraps the Stripe checkout kickoff
 * for the client.
 *
 * Messages Consolidation Plan v2 — Slice J.
 *
 * Called by the PaymentRequestCard's "Pay now" action. Calls
 * `startInquiryCheckout` server action (which routes to Stripe Connect
 * Direct Charge with application_fee_amount snapshotted from the
 * commission engine, per Phase B PR 3). Redirects to the hosted
 * Stripe URL on success.
 */

import { useState, useTransition } from "react";
import { startInquiryCheckout } from "@/lib/server-actions/client-pipeline";

type Props = {
  inquiryId: string;
  amountLabel: string;
  onClose: () => void;
};

export function PayNowSheet({ inquiryId, amountLabel, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const proceed = () => {
    setError(null);
    startTransition(async () => {
      const r = await startInquiryCheckout(inquiryId);
      if (!r.ok) {
        setError(r.error ?? "Could not start checkout.");
        return;
      }
      if (r.url) {
        // Redirect to Stripe Checkout (or mock URL in dev).
        window.location.href = r.url;
      } else {
        setError("Checkout URL missing — try again.");
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-now-title"
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(11,11,13,0.5)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 460,
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -20px 50px rgba(11,11,13,0.20)",
        }}
      >
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: "rgba(24,24,27,0.18)",
          margin: "0 auto 14px",
        }} />

        <h2
          id="pay-now-title"
          style={{
            margin: 0, marginBottom: 6,
            fontSize: 17, fontWeight: 700,
            color: "#0B0B0D", letterSpacing: -0.2,
          }}
        >
          Confirm payment
        </h2>
        <p style={{
          margin: 0, marginBottom: 18,
          fontSize: 12.5, lineHeight: 1.5,
          color: "rgba(11,11,13,0.55)",
        }}>
          You&apos;ll be redirected to Stripe to complete payment securely.
          Your card details never touch this app.
        </p>

        <div style={{
          padding: "12px 14px",
          background: "rgba(15,79,62,0.06)",
          borderRadius: 10,
          marginBottom: 18,
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "rgba(11,11,13,0.55)" }}>
            Total
          </span>
          <span style={{
            fontSize: 17, fontWeight: 700,
            color: "#0B0B0D",
            fontVariantNumeric: "tabular-nums",
          }}>
            {amountLabel}
          </span>
        </div>

        {error && (
          <div role="alert" style={{
            padding: "8px 12px", marginBottom: 14,
            background: "rgba(214,89,89,0.10)",
            color: "#A33A3A",
            borderRadius: 8, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: "11px 16px", borderRadius: 9,
              border: "1px solid rgba(24,24,27,0.12)",
              background: "#fff", color: "#0B0B0D",
              fontSize: 13, fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
              minHeight: 44,
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={proceed}
            disabled={pending}
            style={{
              padding: "11px 18px", borderRadius: 9,
              border: "none",
              background: pending ? "rgba(15,79,62,0.6)" : "#0F4F3E",
              color: "#fff",
              fontSize: 13, fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
              minHeight: 44,
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            {pending ? "Opening Stripe…" : `Pay ${amountLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
