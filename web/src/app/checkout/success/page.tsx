import Link from "next/link";

import { getStripe, getStripeMx, withObjectPlatformFallback } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getRequestLocale } from "@/i18n/request-locale";
import {
  CHECKOUT_CONFIRM_POLL_MAX,
  deriveGuestBookingPresentation,
  reserveModeFromCheckoutType,
  type GuestBookingPresentation,
} from "@/lib/booking/guest-booking-presentation";
import { CheckoutConfirmPoll } from "./CheckoutConfirmPoll";

export const dynamic = "force-dynamic";

type SP = { mock?: string; tx?: string; session_id?: string; poll?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 0 F1: returning from Stripe is not proof of payment. The page finds
 * the transaction this session paid, reads its settled state and its order,
 * and lets `deriveGuestBookingPresentation` decide what may be said.
 */
async function resolveTransactionId(sp: SP): Promise<string | null> {
  const sessionId = sp.session_id;
  if (sessionId && sessionId.startsWith("cs_")) {
    try {
      // The session may belong to the US or the MX platform; ask US, then MX.
      const session = await withObjectPlatformFallback((c) => c.checkout.sessions.retrieve(sessionId));
      if (session) return session.client_reference_id ?? null;
    } catch (err) {
      logServerError("checkout/success.retrieve", err);
      return null;
    }
  }
  // Mock mode only: no Stripe, the transaction id rides the URL.
  if (!getStripe() && !getStripeMx() && sp.tx && UUID_RE.test(sp.tx)) return sp.tx;
  return null;
}

async function loadPresentation(sp: SP, locale: string): Promise<GuestBookingPresentation> {
  const base = {
    bookingMode: "instant" as const,
    payAtVisit: false,
    returnedFromCheckout: true,
    now: new Date(),
    locale,
  };
  const unknown = deriveGuestBookingPresentation({
    ...base,
    reserveMode: "full",
    orderStatus: null,
    transactionStatus: null,
    holdExpiresAt: null,
  });
  const txId = await resolveTransactionId(sp);
  if (!txId || !UUID_RE.test(txId)) return unknown;
  const admin = createServiceRoleClient();
  if (!admin) return unknown;
  const { data: tx, error } = await admin
    .from("booking_transactions")
    .select("status, checkout_type, gross_amount_cents, currency, order_id")
    .eq("id", txId)
    .maybeSingle();
  if (error || !tx) {
    if (error) logServerError("checkout/success.txn", error);
    return unknown;
  }
  const t = tx as {
    status: string | null;
    checkout_type: string | null;
    gross_amount_cents: number | null;
    currency: string | null;
    order_id: string | null;
  };
  type OrderRow = { status: string | null; hold_expires_at: string | null; total_cents: number | null };
  let order: OrderRow | null = null as OrderRow | null;
  if (t.order_id) {
    const { data, error: oErr } = await admin
      .from("orders")
      .select("status, hold_expires_at, total_cents")
      .eq("id", t.order_id)
      .maybeSingle();
    if (oErr) logServerError("checkout/success.order", oErr);
    order = (data as OrderRow | null) ?? null;
  }
  return deriveGuestBookingPresentation({
    ...base,
    reserveMode: reserveModeFromCheckoutType(t.checkout_type) ?? "full",
    orderStatus: order?.status ?? null,
    transactionStatus: t.status,
    holdExpiresAt: order?.hold_expires_at ?? null,
    paidCents: t.gross_amount_cents,
    totalCents: order?.total_cents ?? null,
    currency: t.currency,
  });
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const locale = await getRequestLocale();
  const es = locale.toLowerCase().startsWith("es");
  const isMock = sp.mock === "1";
  const view = await loadPresentation(sp, locale);
  const attempt = Math.max(0, Math.min(CHECKOUT_CONFIRM_POLL_MAX, Number.parseInt(sp.poll ?? "0", 10) || 0));
  const waiting = view.bookingState === "processing";
  const gaveUp = waiting && attempt >= CHECKOUT_CONFIRM_POLL_MAX;
  const detail = gaveUp
    ? es
      ? "Esto está tardando más de lo normal. Te avisaremos por correo en cuanto se complete."
      : "This is taking longer than usual. We will email you as soon as it goes through."
    : view.detail;
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "poll") next.set(k, v);
  next.set("poll", String(attempt + 1));
  const nextHref = `/checkout/success?${next.toString()}`;
  const mark = view.bookingState === "confirmed" ? "✓" : waiting ? "…" : "!";

  return (
    <main
      data-checkout-state={view.bookingState}
      data-payment-state={view.paymentState}
      style={{
        minHeight: "60vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, padding: 32,
        fontFamily: '"Inter", system-ui, sans-serif',
        color: "var(--foreground)",
        background: "var(--background)",
        textAlign: "center",
      }}
    >
      {waiting && !gaveUp ? <CheckoutConfirmPoll nextHref={nextHref} /> : null}
      <div
        aria-hidden="true"
        style={{
          width: 56, height: 56, borderRadius: 999,
          border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 700,
        }}
      >
        {mark}
      </div>
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }} role={waiting ? "status" : undefined}>
        {view.headline}
      </h1>
      {detail ? (
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", maxWidth: 480, margin: 0 }}>{detail}</p>
      ) : null}
      {isMock ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 480, margin: 0 }}>
          {es
            ? "Modo de prueba: Stripe no está configurado, así que el pago queda pendiente hasta que se marque a mano."
            : "Test mode: Stripe is not configured, so the payment stays pending until it is marked by hand."}
        </p>
      ) : null}
      <Link
        href="/"
        style={{
          marginTop: 8, padding: "9px 16px", borderRadius: 999,
          background: "var(--primary)", color: "var(--primary-foreground)",
          fontSize: 13, fontWeight: 600, textDecoration: "none",
        }}
      >
        {es ? "Volver al inicio" : "Back to home"}
      </Link>
    </main>
  );
}
