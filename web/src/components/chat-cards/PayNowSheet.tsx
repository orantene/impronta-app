"use client";

/**
 * PayNowSheet — on-page embedded checkout (Stripe Payment Element).
 *
 * Messages Consolidation Plan v2 — Slice J, upgraded 2026-05-29 to the
 * embedded model: the client pays RIGHT HERE in the drawer (cards + Apple/
 * Google Pay via automatic_payment_methods) with no redirect away from
 * Messages. On confirm the drawer flips to a confirmed state and tells the
 * parent to refresh (which surfaces the booking-confirmation card + PDF).
 *
 * Flow:
 *   mount → createInquiryPaymentIntent(inquiryId) → { clientSecret, mock }
 *   real  → <Elements/> + <PaymentElement/> → stripe.confirmPayment(redirect:"if_required")
 *   mock  → (no live keys) a "Simulate payment" button so the prototype demos
 *
 * The payment_intent.succeeded webhook is the durable source of truth that
 * flips the transaction to paid; the on-page success is the instant UX.
 */

import { useEffect, useState, useCallback } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { createInquiryPaymentIntent } from "@/lib/server-actions/client-pipeline";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
// Created once per page load — loadStripe memoises internally but we guard the
// missing-key case so the module never throws at import time.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

type Props = {
  inquiryId: string;
  amountLabel: string;
  onClose: () => void;
  /** Called after a successful payment so the parent can refresh the thread. */
  onPaid?: () => void;
};

const BRAND = "#0F4F3E";
const INK = "#0B0B0D";

export function PayNowSheet({ inquiryId, amountLabel, onClose, onPaid }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [succeeded, setSucceeded] = useState(false);

  // Create the PaymentIntent as soon as the drawer opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await createInquiryPaymentIntent(inquiryId);
      if (cancelled) return;
      if (!r.ok) {
        setLoadError(r.error ?? "Could not start payment.");
      } else if (r.mock) {
        setMock(true);
      } else if (r.clientSecret) {
        setClientSecret(r.clientSecret);
      } else {
        setLoadError("Payment could not be initialized — try again.");
      }
      setInitializing(false);
    })();
    return () => { cancelled = true; };
  }, [inquiryId]);

  const handleSucceeded = useCallback(() => {
    setSucceeded(true);
    onPaid?.();
  }, [onPaid]);

  const stripeP = getStripePromise();
  const canRenderElements = !!clientSecret && !!stripeP;

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
        if (e.target === e.currentTarget) onClose();
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
          maxHeight: "88vh", overflowY: "auto",
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
            color: INK, letterSpacing: -0.2,
          }}
        >
          {succeeded ? "Payment confirmed" : "Confirm payment"}
        </h2>

        <div style={{
          padding: "12px 14px",
          background: "rgba(15,79,62,0.06)",
          borderRadius: 10,
          margin: "12px 0 18px",
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "rgba(11,11,13,0.55)" }}>Total</span>
          <span style={{
            fontSize: 17, fontWeight: 700, color: INK,
            fontVariantNumeric: "tabular-nums",
          }}>
            {amountLabel}
          </span>
        </div>

        {succeeded ? (
          <SuccessPanel amountLabel={amountLabel} onClose={onClose} />
        ) : initializing ? (
          <p style={{ fontSize: 13, color: "rgba(11,11,13,0.6)", padding: "8px 0 16px" }}>
            Preparing secure payment…
          </p>
        ) : loadError ? (
          <ErrorPanel message={loadError} onClose={onClose} />
        ) : mock ? (
          <MockPanel onClose={onClose} onPaid={handleSucceeded} />
        ) : canRenderElements ? (
          <Elements
            stripe={stripeP}
            options={{
              clientSecret: clientSecret!,
              appearance: { theme: "stripe", variables: { colorPrimary: BRAND } },
            }}
          >
            <PaymentForm amountLabel={amountLabel} onClose={onClose} onPaid={handleSucceeded} />
          </Elements>
        ) : (
          <ErrorPanel
            message="Payment is not configured (publishable key missing)."
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

/** The real Payment Element + confirm button. Lives inside <Elements>. */
function PaymentForm({
  amountLabel, onClose, onPaid,
}: { amountLabel: string; onClose: () => void; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      // Stay on this page for cards; only redirect if the chosen method
      // genuinely requires it (e.g. a bank redirect).
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Payment could not be completed.");
      setSubmitting(false);
      return;
    }
    // No error + no redirect ⇒ the PaymentIntent succeeded (or is processing).
    onPaid();
  };

  return (
    <div>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <InlineError message={error} />}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <SheetButton variant="ghost" disabled={submitting} onClick={onClose}>Cancel</SheetButton>
        <SheetButton variant="primary" disabled={submitting || !stripe} onClick={pay}>
          {submitting ? "Processing…" : `Pay ${amountLabel}`}
        </SheetButton>
      </div>
    </div>
  );
}

function MockPanel({ onClose, onPaid }: { onClose: () => void; onPaid: () => void }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(11,11,13,0.55)", margin: "0 0 16px" }}>
        Demo mode — no live Stripe keys configured. Simulate a successful
        payment to preview the confirmation flow.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <SheetButton variant="ghost" onClick={onClose}>Cancel</SheetButton>
        <SheetButton variant="primary" onClick={onPaid}>Simulate payment</SheetButton>
      </div>
    </div>
  );
}

function SuccessPanel({ amountLabel, onClose }: { amountLabel: string; onClose: () => void }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span aria-hidden style={{
          width: 28, height: 28, borderRadius: "50%", background: BRAND, color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>✓</span>
        <span style={{ fontSize: 13.5, color: INK, fontWeight: 600 }}>
          {amountLabel} paid — your booking is confirmed.
        </span>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(11,11,13,0.55)", margin: "0 0 16px" }}>
        A confirmation is on its way to your email, and the receipt PDF has been
        added to this conversation&apos;s Files.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SheetButton variant="primary" onClick={onClose}>Done</SheetButton>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div role="alert" style={{
      padding: "8px 12px", marginTop: 14,
      background: "rgba(214,89,89,0.10)", color: "#A33A3A",
      borderRadius: 8, fontSize: 12,
    }}>
      {message}
    </div>
  );
}

function ErrorPanel({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div>
      <InlineError message={message} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <SheetButton variant="ghost" onClick={onClose}>Close</SheetButton>
      </div>
    </div>
  );
}

function SheetButton({
  children, onClick, disabled, variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: "ghost" | "primary";
}) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "11px 18px", borderRadius: 9,
        border: primary ? "none" : "1px solid rgba(24,24,27,0.12)",
        background: primary ? (disabled ? "rgba(15,79,62,0.6)" : BRAND) : "#fff",
        color: primary ? "#fff" : INK,
        fontSize: 13, fontWeight: primary ? 700 : 600,
        cursor: disabled ? "wait" : "pointer",
        minHeight: 44,
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {children}
    </button>
  );
}
