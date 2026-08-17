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
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { stripeJsLocale, type StripeJsLocale } from "@/lib/i18n/vendor-locale";
import { interpolate } from "@/i18n/interpolate";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
// One promise PER LOCALE. Stripe.js reads the BROWSER language when no `locale`
// is passed, so a client paying inside a Spanish app on an English browser got
// an English Payment Element. loadStripe memoises the script load internally,
// so a second call with a different locale is cheap; keying the cache on the
// locale is what stops the first (pre-hydration) "en" render from freezing the
// language for the rest of the session.
const stripePromises = new Map<string, Promise<Stripe | null>>();
function getStripePromise(locale: StripeJsLocale | undefined): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  const key = locale ?? "";
  let promise = stripePromises.get(key);
  if (!promise) {
    promise = loadStripe(PUBLISHABLE_KEY, locale ? { locale } : undefined);
    stripePromises.set(key, promise);
  }
  return promise;
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
  const t = useT();
  const dashboardLocale = useDashboardLocale();
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
        setLoadError(r.error ?? t("dashboard.clientPay.couldNotStart"));
      } else if (r.mock) {
        setMock(true);
      } else if (r.clientSecret) {
        setClientSecret(r.clientSecret);
      } else {
        setLoadError(t("dashboard.clientPay.couldNotInit"));
      }
      setInitializing(false);
    })();
    return () => { cancelled = true; };
  }, [inquiryId, t]);

  const handleSucceeded = useCallback(() => {
    setSucceeded(true);
    onPaid?.();
  }, [onPaid]);

  // Resolved from the app's own locale cookie, never from navigator.language.
  // It reads "en" until hydration, but `<Elements>` only mounts once the
  // PaymentIntent resolves — well after that — so the real locale is the one
  // Stripe.js is created with.
  const paymentLocale = stripeJsLocale(dashboardLocale);
  const stripeP = getStripePromise(paymentLocale);
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
          {succeeded ? t("dashboard.clientPay.confirmedTitle") : t("dashboard.clientPay.confirmTitle")}
        </h2>

        <div style={{
          padding: "12px 14px",
          background: "rgba(15,79,62,0.06)",
          borderRadius: 10,
          margin: "12px 0 18px",
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "rgba(11,11,13,0.55)" }}>{t("dashboard.clientPay.total")}</span>
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
            {t("dashboard.clientPay.preparing")}
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
              // Belt and braces with the locale baked into `stripeP`: an
              // Elements group created without one re-reads the browser.
              ...(paymentLocale ? { locale: paymentLocale } : {}),
              appearance: { theme: "stripe", variables: { colorPrimary: BRAND } },
            }}
          >
            <PaymentForm amountLabel={amountLabel} onClose={onClose} onPaid={handleSucceeded} />
          </Elements>
        ) : (
          <ErrorPanel
            message={t("dashboard.clientPay.notConfigured")}
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
  const t = useT();
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
      setError(confirmError.message ?? t("dashboard.clientPay.confirmError"));
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
        <SheetButton variant="ghost" disabled={submitting} onClick={onClose}>{t("dashboard.clientPay.cancel")}</SheetButton>
        <SheetButton variant="primary" disabled={submitting || !stripe} onClick={pay}>
          {submitting ? t("dashboard.clientPay.processing") : interpolate(t("dashboard.clientPay.payAmount"), { amount: amountLabel })}
        </SheetButton>
      </div>
    </div>
  );
}

function MockPanel({ onClose, onPaid }: { onClose: () => void; onPaid: () => void }) {
  const t = useT();
  return (
    <div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(11,11,13,0.55)", margin: "0 0 16px" }}>
        {t("dashboard.clientPay.mockNote")}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <SheetButton variant="ghost" onClick={onClose}>{t("dashboard.clientPay.cancel")}</SheetButton>
        <SheetButton variant="primary" onClick={onPaid}>{t("dashboard.clientPay.simulate")}</SheetButton>
      </div>
    </div>
  );
}

function SuccessPanel({ amountLabel, onClose }: { amountLabel: string; onClose: () => void }) {
  const t = useT();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span aria-hidden style={{
          width: 28, height: 28, borderRadius: "50%", background: BRAND, color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>✓</span>
        <span style={{ fontSize: 13.5, color: INK, fontWeight: 600 }}>
          {interpolate(t("dashboard.clientPay.successLine"), { amount: amountLabel })}
        </span>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(11,11,13,0.55)", margin: "0 0 16px" }}>
        {t("dashboard.clientPay.successBody")}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SheetButton variant="primary" onClick={onClose}>{t("dashboard.clientPay.done")}</SheetButton>
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
  const t = useT();
  return (
    <div>
      <InlineError message={message} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <SheetButton variant="ghost" onClick={onClose}>{t("dashboard.clientPay.close")}</SheetButton>
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
