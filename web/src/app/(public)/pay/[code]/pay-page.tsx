import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPaymentLinkByCode, markPaymentLinkPaid, mockPaymentsAllowed } from "@/lib/payments/links";
import { openPaymentLinkCheckout } from "@/lib/payments/link-checkout";
import { payStartViewStatus } from "@/lib/payments/pay-start-status";
import type { PayLinkPathPrefix } from "@/lib/payments/pay-link-url";
import { getRequestLocale } from "@/i18n/request-locale";
import { publicThreadPath, signThreadToken } from "@/lib/messaging/thread-token";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { venueHhmm } from "@/lib/spaces/venue-clock";

import { googleCalendarUrl, icsDataHref } from "@/lib/payments/calendar-links";
import { moneyMayHaveMoved } from "@/lib/payments/pay-closed-money";
import { CheckoutView } from "./CheckoutView";
import { payCalendarEvent } from "@/lib/payments/pay-calendar-event";
import { resolvePaidLinkDisplayStatus } from "@/lib/payments/pay-refund-status";
import { loadPayLinkFeeLines } from "@/lib/payments/pay-link-fee-lines";
import { resolveOrderPayeeName } from "@/lib/payments/payee-name";
import { interpolate } from "@/i18n/interpolate";
import { createTranslator } from "@/i18n/messages";

/**
 * Absolute origin for Stripe success/cancel URLs. Prefer NEXT_PUBLIC_BASE_URL
 * when set; otherwise the request host (agent-owned QA hosts like
 * qa-stripe-r2.tulala.digital have no BASE_URL — empty origin made Stripe
 * reject relative success_url and /pay?confirm=stripe 500'd).
 */
async function checkoutOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * The signed `/c/t/<token>` path for the conversation behind a sale: the
 * link's own inquiry, else the order's. Null when neither names one.
 */
async function threadHrefFor(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  orderId: string,
  linkInquiryId: string | null,
): Promise<string | null> {
  let inquiryId = linkInquiryId;
  if (!inquiryId) {
    const { data, error } = await admin.from("orders").select("inquiry_id").eq("id", orderId).maybeSingle();
    if (error) notFound();
    inquiryId = (data as { inquiry_id: string | null } | null)?.inquiry_id ?? null;
  }
  const token = inquiryId && tenantId ? signThreadToken(inquiryId, tenantId) : null;
  return token ? publicThreadPath(token) : null;
}

/**
 * Shared payment checkout engine for `/pay/<code>` and `/link/<code>`.
 * The code is the credential; `pathPrefix` is presentation only.
 */
export async function PayByCodePage({
  params,
  searchParams,
  pathPrefix,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ status?: string; confirm?: string }>;
  pathPrefix: PayLinkPathPrefix;
}) {
  const { code } = await params;
  const query = await searchParams;
  if (!code || code.length < 8) notFound();

  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const loaded = await loadPaymentLinkByCode(admin, code);
  if (!loaded.ok && loaded.reason === "expired") {
    // An expired request is exactly when the customer needs the conversation
    // back: that is where they ask for a fresh one. The link's own inquiry,
    // else the order's (D-150: this view used to hand over no thread at all).
    const expiredHref = await threadHrefFor(admin, loaded.tenantId, loaded.orderId, loaded.inquiryId);
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        amountCents={0}
        currency=""
        expiresAt=""
        status="expired"
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={expiredHref}
        receiptHref={null}
      />
    );
  }
  if (!loaded.ok) notFound();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, currency, inquiry_id, receipt_code, hold_expires_at, status")
    .eq("id", loaded.orderId)
    .maybeSingle();
  if (orderError) notFound();
  const orderRow = (order ?? null) as {
    currency: string;
    inquiry_id: string | null;
    receipt_code: string | null;
    hold_expires_at: string | null;
    status: string | null;
  } | null;
  const { data: lines, error: linesError } = await admin
    .from("order_lines")
    .select("label, units, unit_cents")
    .eq("order_id", loaded.orderId);
  if (linesError) notFound();

  // What the kept time IS: a linked booking is an appointment; an order with a
  // pickup hold is a pickup; anything else gets neutral wording.
  const { data: slotBooking } = await admin
    .from("agency_bookings")
    .select("id, status, title, venue_name, venue_location_text")
    .eq("order_id", loaded.orderId)
    .limit(1)
    .maybeSingle();
  // A booking made from an accepted offer has no time yet: it keeps no slot, so
  // the page must not say the appointment time is kept.
  const slotBookingId = (slotBooking as { id?: string } | null)?.id ?? null;
  const agencySlot = (slotBooking ?? null) as {
    id?: string;
    status?: string | null;
    title?: string | null;
    venue_name?: string | null;
    venue_location_text?: string | null;
  } | null;
  const { data: slotTime } = slotBookingId
    ? await admin
        .from("talent_bookings")
        .select("starts_at, ends_at, location_text, title")
        .eq("id", slotBookingId)
        .maybeSingle()
    : { data: null };
  const talentSlot = (slotTime ?? null) as {
    starts_at?: string | null;
    ends_at?: string | null;
    location_text?: string | null;
    title?: string | null;
  } | null;
  const bookingHasTime = Boolean(talentSlot?.starts_at);
  const slotKind: "appointment" | "appointment_no_time" | "pickup" | null = slotBooking
    ? bookingHasTime
      ? "appointment"
      : "appointment_no_time"
    : orderRow?.hold_expires_at
      ? "pickup"
      : null;

  // The two clocks the customer reads ("expires 19:15", "pickup kept until
  // 19:40", MC15) in the VENUE's zone; the rows hold ISO instants and the
  // page was printing them verbatim (live run 2026-09-11).
  const { timezone } = loaded.tenantId ? await resolveTenantTimezone(loaded.tenantId) : { timezone: "UTC" };
  const expiresAtLabel = venueHhmm(loaded.expiresAt, timezone, "en");
  const holdUntilLabel = orderRow?.hold_expires_at ? venueHhmm(orderRow.hold_expires_at, timezone, "en") : null;

  // The conversation behind the sale: the order's, or the link's own when
  // the request came from Messages (D-145: that flow left orders.inquiry_id
  // null, so "Back to the conversation" never appeared).
  const inquiryId = orderRow?.inquiry_id ?? loaded.inquiryId ?? null;
  const threadToken = inquiryId && loaded.tenantId ? signThreadToken(inquiryId, loaded.tenantId) : null;
  const threadHref = threadToken ? publicThreadPath(threadToken) : null;
  const receiptHref = orderRow?.receipt_code ? `/r/${orderRow.receipt_code}` : null;
  const uiLocale = (await getRequestLocale()) === "en" ? "en" : "es";
  const cameFromConversation = Boolean(inquiryId);
  const orderLines = ((lines ?? []) as { label: string | null; units: number; unit_cents: number }[]).map((line) => ({
    label: line.label ?? "",
    units: Number(line.units) || 1,
    unitCents: Number(line.unit_cents) || 0,
  }));

  // The RECORD says paid; the query string cannot. Stripe sends the customer
  // back with `?status=paid` before the webhook settles the link, and that
  // moment is "processing" (MC16), never a paid card the ledger does not
  // hold. A hand-typed `?status=paid` on an open link used to render Paid.
  if (loaded.status !== "paid" && query.status === "paid") {
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        slotKind={slotKind}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? "USD"}
        expiresAt={expiresAtLabel}
        status="processing"
        locale={uiLocale}
        lines={orderLines}
        holdUntil={holdUntilLabel}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={null}
      />
    );
  }
  if (loaded.status === "paid") {
    // Link schema has no refunded status; consult order / booking truth so a
    // full Stripe refund does not leave /pay stuck on Paid.
    const { data: bookingForPay, error: bookingForPayError } = await admin
      .from("agency_bookings")
      .select("payment_status")
      .eq("order_id", loaded.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Empty = no linked booking (fine). A failed read must not look like "paid".
    if (bookingForPayError) notFound();
    const bookingPaymentStatus =
      (bookingForPay as { payment_status?: string | null } | null)?.payment_status ?? null;
    const paidDisplay = resolvePaidLinkDisplayStatus({
      orderStatus: orderRow?.status ?? null,
      bookingPaymentStatus,
    });
    const sellerName = await resolveOrderPayeeName(admin, loaded.tenantId, loaded.orderId);
    const t = createTranslator(uiLocale);
    // Location for .ics/Google only; skip the inquiry read on open/processing.
    const { data: inquiryLoc } =
      paidDisplay === "paid" && inquiryId
        ? await admin.from("inquiries").select("event_location").eq("id", inquiryId).maybeSingle()
        : { data: null };
    const requestedLocation =
      (inquiryLoc as { event_location?: string | null } | null)?.event_location ?? null;
    const calendarEv =
      paidDisplay === "paid"
        ? payCalendarEvent({
            uid: slotBookingId ?? loaded.orderId,
            startsAt: talentSlot?.starts_at,
            endsAt: talentSlot?.ends_at,
            title: talentSlot?.title ?? agencySlot?.title ?? orderLines[0]?.label ?? null,
            locationText: talentSlot?.location_text,
            requestedLocation,
            venueLocationText:
              [agencySlot?.venue_name, agencySlot?.venue_location_text].filter(Boolean).join(" · ") || null,
            sellerName,
            description: sellerName ? interpolate(t("public.thread.paidTo"), { seller: sellerName }) : null,
          })
        : null;
    const icsHref = calendarEv ? icsDataHref(calendarEv) : null;
    const googleHref = calendarEv ? googleCalendarUrl(calendarEv) : null;
    const calendar = icsHref && googleHref ? { icsHref, googleHref } : null;
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        slotKind={slotKind}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={expiresAtLabel}
        status={paidDisplay}
        locale={uiLocale}
        sellerName={sellerName}
        autoReturn={cameFromConversation && query.status === "paid"}
        lines={orderLines}
        holdUntil={holdUntilLabel}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={paidDisplay === "paid" ? receiptHref : null}
        calendar={calendar}
      />
    );
  }

  // Stripe's "back" arrow lands here with ?status=cancelled on a still-open link:
  // nothing was charged, and the client can try again or return to the chat.
  if (loaded.status === "open" && query.status === "cancelled") {
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={expiresAtLabel}
        status="cancelledReturn"
        locale={uiLocale}
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={null}
      />
    );
  }

  // A cancelled booking voids its order: an open link on it is no longer
  // payable, whatever the link row still says.
  // The booking is checked too: a cancel whose card payment was in flight
  // keeps the order (money may land), but its booking is cancelled and the
  // page must never offer "Pay securely" again (QA on Jor, 2026-10-01).
  const orderCancelled =
    orderRow?.status === "cancelled" ||
    (slotBooking as { status?: string | null } | null)?.status === "cancelled";
  if (loaded.status !== "open" || orderCancelled) {
    const moneyMoved =
      loaded.status === "cancelled" || orderCancelled ? await moneyMayHaveMoved(admin, loaded.orderId) : false;
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        moneyMayHaveMoved={moneyMoved}
        slotKind={slotKind}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={expiresAtLabel}
        status={
          loaded.status === "cancelled" || orderCancelled
            ? "cancelled"
            : loaded.status === "replaced"
              ? "replaced"
              : "unknown"
        }
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={receiptHref}
      />
    );
  }

  const origin = await checkoutOrigin();
  const successUrl = `${origin}${pathPrefix}/${code}?status=paid`;
  const cancelUrl = `${origin}${pathPrefix}/${code}?status=cancelled`;

  // A mock link is a demo, and it never settles on production: whoever holds
  // the code could otherwise mark it paid with no money moving. A Stripe link
  // never settles here at all; its money arrives through the webhook.
  const mockAllowed = mockPaymentsAllowed();
  if (query.confirm === "mock" && loaded.provider !== "stripe" && mockAllowed) {
    const settled = await markPaymentLinkPaid(admin, { code, tenantId: loaded.tenantId });
    if (!settled.ok) {
      return (
        <CheckoutView
          code={code}
          pathPrefix={pathPrefix}
        slotKind={slotKind}
          amountCents={loaded.amountCents}
          currency={orderRow?.currency ?? ""}
          expiresAt={expiresAtLabel}
          status="unknown"
          lines={[]}
          holdUntil={null}
          stripeUrl={null}
          threadHref={threadHref}
          receiptHref={receiptHref}
        />
      );
    }
    redirect(`${origin || ""}${pathPrefix}/${code}?status=paid`);
  }

  let stripeUrl: string | null = null;
  if (loaded.provider === "stripe" && query.confirm === "stripe") {
    if (!origin) notFound();
    // The link opens a real money row first and the session names it, so the
    // webhook settles the payment through `markPaid` (PaymentIntent id,
    // receipt, transfers, the link itself); the session dies with the link.
    // A second tap, or a retry after a decline, resumes the same session.
    const opened = await openPaymentLinkCheckout(admin, {
      code,
      successUrl,
      cancelUrl,
      locale: await getRequestLocale(),
    });
    if (opened.ok) redirect(opened.url);
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        slotKind={slotKind}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={expiresAtLabel}
        status={payStartViewStatus(opened.reason)}
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={null}
        currencyMismatch={
          opened.reason === "currency_mismatch"
            ? { linkCurrency: opened.linkCurrency, orderCurrency: opened.orderCurrency }
            : undefined
        }
      />
    );
  }
  if (loaded.provider === "stripe") {
    stripeUrl = `${origin || ""}${pathPrefix}/${code}?confirm=stripe`;
  } else if (!mockAllowed) {
    // No mock Pay button on production: it would settle a link with no money.
    return (
      <CheckoutView
        code={code}
        pathPrefix={pathPrefix}
        slotKind={slotKind}
        amountCents={loaded.amountCents}
        currency={orderRow?.currency ?? ""}
        expiresAt={expiresAtLabel}
        status="unknown"
        lines={[]}
        holdUntil={null}
        stripeUrl={null}
        threadHref={threadHref}
        receiptHref={null}
      />
    );
  }

  const feeLines = await loadPayLinkFeeLines(admin, loaded.orderId, loaded.amountCents);
  return (
    <CheckoutView
      code={code}
      pathPrefix={pathPrefix}
        slotKind={slotKind}
      amountCents={loaded.amountCents}
      currency={orderRow?.currency ?? ""}
      expiresAt={expiresAtLabel}
      status="open"
      locale={uiLocale}
      feeLines={feeLines}
      lines={((lines ?? []) as { label: string | null; units: number; unit_cents: number }[]).map((line) => ({
        label: line.label ?? "",
        units: Number(line.units) || 1,
        unitCents: Number(line.unit_cents) || 0,
      }))}
      holdUntil={holdUntilLabel}
      stripeUrl={stripeUrl}
      threadHref={threadHref}
      receiptHref={receiptHref}
    />
  );
}
