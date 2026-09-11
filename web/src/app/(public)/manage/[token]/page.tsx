import type { Metadata } from "next";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { interpolate } from "@/i18n/interpolate";
import { verifyBookingManageToken } from "@/lib/bookings/manage-token";
import { readPolicyOverride } from "@/lib/bookings/policy-overrides";
import { requestNowMs } from "@/lib/projects/request-clock";
import { bookingOfferingId } from "@/lib/scheduling/cancel-booking";
import { resolveCancellationWindow } from "@/lib/bookings/cancellation-window";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { getPublicHostContext } from "@/lib/saas/scope";
import { schedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { ManageBookingView, type ManageBookingFacts } from "./manage-booking-view";

/**
 * `/manage/<token>` — the customer's own booking (A07, R04, R05, A10).
 *
 * THE TOKEN IS THE CREDENTIAL. `verifyBookingManageToken` checks the HMAC,
 * the expiry and the shape; the payload names the booking, the tenant and
 * the ONE action the link allows (cancel or reschedule). The page then
 * insists the token's tenant is the host's tenant: a link minted on one
 * storefront does not open on another. Anything short of that is the
 * `token_invalid` sentence and nothing else, so an expired or forwarded
 * link tells the holder nothing about the booking.
 *
 * READ, THEN ONE WRITE. The page reads the booking's own facts (what, when,
 * what was paid, the cancellation deadline the engine will apply); the one
 * write is the engine's (`cancelBookingByManageToken`,
 * `rescheduleBookingByManageToken`), carrying the same token again. A
 * refund is never taken here: the cancel opens the refund intent and money
 * moves on the existing path, which the page says in the reader's words.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: t("public.manageBooking.title") };
}

type Params = { params: Promise<{ token: string }> };

function Refused({ title, sentence, name }: { title: string; sentence: string; name: string | null }) {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 sm:px-6" data-manage-state="refused">
        {name ? <p className="m-0 text-sm text-[var(--token-color-muted,#737373)]">{name}</p> : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        <p role="alert" className="mt-4 text-base">
          {sentence}
        </p>
      </main>
      <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
    </>
  );
}

export default async function ManageBookingPage({ params }: Params) {
  const { token } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const engine = schedulingEngineSentences(t);
  const host = await getPublicHostContext();
  const hostTenantId = host.kind === "agency" || host.kind === "hub" ? host.tenantId : null;
  const identity = hostTenantId ? await loadPublicIdentity(hostTenantId) : null;
  const name = identity?.public_name?.trim() || null;

  const verified = verifyBookingManageToken(token);
  if (!verified.ok || !hostTenantId || verified.payload.tenantId !== hostTenantId) {
    return <Refused title={t("public.manageBooking.title")} sentence={engine.token_invalid} name={name} />;
  }
  const admin = createServiceRoleClient();
  if (!admin) return <Refused title={t("public.manageBooking.title")} sentence={engine.unavailable} name={name} />;

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, title, status, starts_at, ends_at, timezone, order_id, venue_name, venue_address, currency_code, contact_name")
    .eq("id", verified.payload.bookingId)
    .eq("tenant_id", hostTenantId)
    .maybeSingle();
  if (error) {
    logServerError("manage.loadBooking", error);
    return <Refused title={t("public.manageBooking.title")} sentence={engine.unavailable} name={name} />;
  }
  if (!row) return <Refused title={t("public.manageBooking.title")} sentence={engine.not_found} name={name} />;
  const booking = row as {
    id: string;
    title: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
    order_id: string | null;
    venue_name: string | null;
    venue_address: string | null;
    currency_code: string | null;
    contact_name: string | null;
  };

  let paidCents = 0;
  if (booking.order_id) {
    const { data: txns, error: txnErr } = await admin.from("booking_transactions").select("gross_amount_cents, status").eq("order_id", booking.order_id);
    if (txnErr) {
      logServerError("manage.loadPaid", txnErr);
      return <Refused title={t("public.manageBooking.title")} sentence={engine.unavailable} name={name} />;
    }
    for (const x of (txns ?? []) as Array<{ gross_amount_cents: number; status: string }>) {
      if (x.status === "paid") paidCents += Number(x.gross_amount_cents) || 0;
    }
  }
  // Same rule as `cancelBookingSet`: the offering is on the order's lines.
  let cancelFreeHours: number | null = null;
  const offeringId = booking.order_id ? await bookingOfferingId(admin, booking.order_id) : null;
  if (offeringId) {
    const override = await readPolicyOverride(admin, { tenantId: hostTenantId, offeringId });
    if (override.ok) cancelFreeHours = override.row?.cancelFreeHours ?? null;
  }
  const window = resolveCancellationWindow({ cancellationHours: cancelFreeHours, startsAt: booking.starts_at, eventDate: null, nowMs: requestNowMs() });
  const currency = (booking.currency_code ?? "USD").toUpperCase();
  const zone = booking.timezone ?? "UTC";
  const when = (iso: string | null, opts: Intl.DateTimeFormatOptions) =>
    iso ? new Intl.DateTimeFormat(locale, { timeZone: zone, ...opts }).format(new Date(iso)) : null;

  const facts: ManageBookingFacts = {
    action: verified.payload.action,
    title: booking.title,
    status: booking.status,
    startsAt: booking.starts_at,
    whenLabel: booking.starts_at
      ? `${when(booking.starts_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${
          booking.ends_at ? ` – ${when(booking.ends_at, { hour: "2-digit", minute: "2-digit" })}` : ""
        }`
      : t("public.manageBooking.noDate"),
    place: [booking.venue_name, booking.venue_address].filter(Boolean).join(" · ") || null,
    paidLabel: paidCents > 0 ? formatOrderMoney(paidCents, currency) : t("public.manageBooking.nothingPaid"),
    deadlineLabel: window.enforceable
      ? window.insideWindow
        ? t("public.manageBooking.deadlinePassed")
        : interpolate(t("public.manageBooking.deadlineUntil"), { when: when(window.deadlineIso, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ?? "" })
      : t("public.manageBooking.deadlineNone"),
    refundIfCancelled: window.enforceable && window.insideWindow ? 0 : paidCents,
    paidCents,
    currency,
    timeZone: zone,
    closed: booking.status === "cancelled" || booking.status === "completed" || booking.status === "archived",
  };

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 sm:px-6" data-manage-state="open" data-manage-action={facts.action}>
        {name ? <p className="m-0 text-sm text-[var(--token-color-muted,#737373)]">{name}</p> : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t("public.manageBooking.title")}</h1>
        <ManageBookingView
          token={token}
          facts={facts}
          copy={{
            statusConfirmed: t("public.manageBooking.statusConfirmed"),
            statusClosed: t("public.manageBooking.statusClosed"),
            paid: t("public.manageBooking.paid"),
            atVisit: t("public.manageBooking.atVisit"),
            atVisitValue: t("public.manageBooking.atVisitValue"),
            freeUntil: t("public.manageBooking.freeUntil"),
            reschedule: t("public.manageBooking.reschedule"),
            cancel: t("public.manageBooking.cancel"),
            addToCalendar: t("public.manageBooking.addToCalendar"),
            onlyCancels: t("public.manageBooking.onlyCancels"),
            onlyReschedules: t("public.manageBooking.onlyReschedules"),
            closed: t("public.manageBooking.closedSentence"),
            note: t("public.manageBooking.note"),
            cancelTitle: t("public.manageBooking.cancelTitle"),
            cancelPolicy: t("public.manageBooking.cancelPolicy"),
            cancelRefund: t("public.manageBooking.cancelRefund"),
            cancelNoRefund: t("public.manageBooking.cancelNoRefund"),
            cancelNothingPaid: t("public.manageBooking.cancelNothingPaid"),
            reason: t("public.manageBooking.reason"),
            reasonPlaceholder: t("public.manageBooking.reasonPlaceholder"),
            keep: t("public.manageBooking.keep"),
            cancelConfirm: t("public.manageBooking.cancelConfirm"),
            cancelled: t("public.manageBooking.cancelled"),
            cancelledRefund: t("public.manageBooking.cancelledRefund"),
            rescheduleTitle: t("public.manageBooking.rescheduleTitle"),
            newTime: t("public.manageBooking.newTime"),
            rescheduleConfirm: t("public.manageBooking.rescheduleConfirm"),
            rescheduled: t("public.manageBooking.rescheduled"),
            engine,
          }}
        />
      </main>
      <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
    </>
  );
}
