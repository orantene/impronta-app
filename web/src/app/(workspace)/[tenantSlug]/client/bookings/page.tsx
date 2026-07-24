// Phase 3.10 — Client Bookings page.
// Confirmed bookings (status = booked/converted) for this client.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadClientBookings,
  loadClientTransactions,
  loadClientPayableTransactions,
  type ClientTransactionRow,
  loadWorkspaceRosterLite,
  type ClientBookingRow,
} from "../../_data-bridge";
import {
  formatClientWeekdayDate,
  getClientDateParts,
  isPastClientDate,
} from "../date-format";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { NewInquiryButton } from "../_components/NewInquiryButton";
import { EmptyState } from "../_components/EmptyState";
import { ReviewableBookingsSection } from "../_components/ReviewableBookingsSection";
import { BookingPayNowButton } from "../_components/BookingPayNowButton";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  accent:      "#1D4ED8",
  greenDeep:   "#1A7348",
  greenSoft:   "rgba(26,115,72,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function fmtDate(iso: string | null): string {
  return formatClientWeekdayDate(iso, "TBC");
}

function isPast(iso: string | null): boolean {
  return isPastClientDate(iso);
}

function fmtMoney(cents: number | null, currency: string | null): string | null {
  if (cents == null) return null;
  return `${currency ?? "USD"} ${(cents / 100).toLocaleString()}`;
}

// Client-facing payment label + tone from agency_bookings.payment_status.
function paymentChip(status: string | null): { label: string; paid: boolean } | null {
  switch (status) {
    case "paid":      return { label: "Paid", paid: true };
    case "partial":   return { label: "Partially paid", paid: false };
    case "unpaid":    return { label: "Payment due", paid: false };
    case "cancelled": return { label: "Cancelled", paid: false };
    default:          return null;
  }
}

function BookingRow({
  booking,
  idx,
  total,
  tenantSlug,
  reviewPayLabel,
  payNowLabel,
  payable,
  locale,
}: {
  booking: ClientBookingRow;
  idx: number;
  total: number;
  tenantSlug: string;
  reviewPayLabel: string;
  payNowLabel: string;
  payable: PayableMap;
  locale: string;
}) {
  const future = !isPast(booking.event_date);
  // CH2 — a charge the client can settle right now (staff already requested
  // payment). When present we mount the real payment sheet; when absent we
  // fall back to the deep link, because there is genuinely nothing to pay yet.
  const payableTxn = booking.agencyBookingId ? payable.get(booking.agencyBookingId) ?? null : null;
  const dateParts = getClientDateParts(booking.event_date);
  const money = fmtMoney(booking.amountCents, booking.currencyCode);
  const chip = paymentChip(booking.paymentStatus);
  // D2 — show receipt download only when paid and a booking record exists.
  const showReceipt =
    booking.paymentStatus === "paid" &&
    booking.agencyBookingId !== null;
  // CW3 — a booking that still owes money must carry an action, not a dead
  // chip. The payment conversation lives in the inquiry thread.
  const showPayAction =
    booking.paymentStatus === "unpaid" || booking.paymentStatus === "partial";
  return (
    <div
      style={{
        borderBottom: idx < total - 1 ? `1px solid ${C.borderSoft}` : "none",
      }}
    >
    <Link
      href={`/${tenantSlug}/client/messages?inquiry=${booking.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "48px 1fr auto",
        gap: 16,
        alignItems: "center",
        padding: showReceipt || showPayAction ? "16px 18px 8px" : "16px 18px",
        fontFamily: FONT,
        textDecoration: "none",
      }}
    >
      {/* Date box */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: future ? C.greenSoft : "rgba(11,11,13,0.04)",
          borderRadius: 8,
          padding: "6px 4px",
        }}
      >
        {dateParts ? (
          <>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: future ? C.greenDeep : C.inkMuted,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {dateParts.day}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: future ? C.greenDeep : C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {dateParts.monthShort}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: C.inkDim, textAlign: "center" }}>TBC</div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {/* CW3 — who is booked: real card headshots, initials fallback. */}
          {booking.talentLineup.length > 0 && (
            <span style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden>
              {booking.talentLineup.slice(0, 3).map((t, ti) => (
                <span
                  key={t.id}
                  title={t.name}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "1.5px solid #fff",
                    marginLeft: ti === 0 ? 0 : -6,
                    background: t.thumbUrl
                      ? `url(${t.thumbUrl}) center/cover`
                      : `hsl(${(t.name.charCodeAt(0) * 47) % 360} 25% 88%)`,
                    color: "rgba(11,11,13,0.62)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {!t.thumbUrl && t.name[0]?.toUpperCase()}
                </span>
              ))}
            </span>
          )}
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: -0.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {booking.company
              ?? (booking.talentLineup.length > 0
                ? booking.talentLineup.map((t) => t.name).join(", ")
                : booking.event_location ?? "Confirmed booking")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          {booking.event_date && (
            <span style={{ fontSize: 12, color: C.inkMuted }}>{fmtDate(booking.event_date)}</span>
          )}
          {booking.event_location && (
            <span style={{ fontSize: 12, color: C.inkMuted }}>· {booking.event_location}</span>
          )}
          {booking.quantity && (
            <span style={{ fontSize: 12, color: C.inkMuted }}>· {booking.quantity} talent</span>
          )}
        </div>
        {(money || chip) && (
          <div style={{ display: "flex", gap: 8, marginTop: 5, alignItems: "center" }}>
            {money && (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{money}</span>
            )}
            {chip && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase" as const,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: chip.paid ? C.greenSoft : "rgba(11,11,13,0.05)",
                  color: chip.paid ? C.greenDeep : C.inkMuted,
                }}
              >
                {chip.label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 10px",
          borderRadius: 999,
          background: future ? C.greenSoft : "rgba(11,11,13,0.04)",
          color: future ? C.greenDeep : C.inkMuted,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase" as const,
          fontFamily: FONT,
          whiteSpace: "nowrap",
        }}
      >
        {future ? "Confirmed" : "Past"}
      </div>
    </Link>

    {/* CW3 — Review & pay strip for unpaid/partial bookings. Deep-links to
        the inquiry thread where the offer + payment settlement live. */}
    {showPayAction && (
      <div
        style={{
          padding: "0 18px 12px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        {payableTxn ? (
          <BookingPayNowButton
            inquiryId={booking.id}
            amountLabel={new Intl.NumberFormat(
              locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "en-US",
              { style: "currency", currency: payableTxn.currency, maximumFractionDigits: 2 },
            ).format(payableTxn.amountCents / 100)}
            label={payNowLabel}
          />
        ) : (
          <Link
            href={`/${tenantSlug}/client/messages?inquiry=${booking.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              fontWeight: 700,
              color: "#fff",
              textDecoration: "none",
              padding: "5px 12px",
              borderRadius: 7,
              background: C.accent,
              fontFamily: FONT,
            }}
          >
            {reviewPayLabel}
          </Link>
        )}
      </div>
    )}

    {/* D2 — Receipt download strip, shown only when payment_status = paid */}
    {showReceipt && (
      <div
        style={{
          padding: "0 18px 12px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <a
          href={`/api/receipt/${booking.agencyBookingId}`}
          download
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            fontWeight: 600,
            color: C.accent,
            textDecoration: "none",
            padding: "4px 10px",
            borderRadius: 7,
            border: `1px solid rgba(29,78,216,0.18)`,
            background: "rgba(29,78,216,0.04)",
            fontFamily: FONT,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 17V3" /><path d="M5 10l7 7 7-7" /><path d="M5 21h14" />
          </svg>
          Download receipt
        </a>
      </div>
    )}
    </div>
  );
}

type PayableMap = Map<string, { transactionId: string; amountCents: number; currency: string; checkoutType: string | null }>;

function BookingSection({ rows, label, tenantSlug, reviewPayLabel, payNowLabel, payable, locale }: { rows: ClientBookingRow[]; label: string; tenantSlug: string; reviewPayLabel: string; payNowLabel: string; payable: PayableMap; locale: string }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.inkMuted, marginBottom: 10, fontFamily: FONT }}>
        {label} ({rows.length})
      </div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
        {rows.map((b, i) => (
          <BookingRow key={b.id} booking={b} idx={i} total={rows.length} tenantSlug={tenantSlug} reviewPayLabel={reviewPayLabel} payNowLabel={payNowLabel} payable={payable} locale={locale} />
        ))}
      </div>
    </section>
  );
}

export default async function ClientBookingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [bookings, roster] = await Promise.all([
    loadClientBookings(session.user.id, scope.tenantId),
    loadWorkspaceRosterLite(scope.tenantId),
  ]);
  // CW5 — scope payments to THIS tenant via the client's own booking ids.
  const agencyBookingIds = bookings.map((b) => b.agencyBookingId).filter((x): x is string => !!x);
  const [transactions, payable] = await Promise.all([
    loadClientTransactions(session.user.id, agencyBookingIds),
    // CH2 — which of those bookings the client can pay right now.
    loadClientPayableTransactions(session.user.id, agencyBookingIds),
  ]);

  // CW3 — every booking lives in exactly ONE bucket. Undated rows used to
  // appear under BOTH Upcoming (TBC box) and Past (!event_date), so 8
  // bookings rendered as 15 rows.
  const upcoming = bookings.filter((b) => b.event_date && !isPast(b.event_date));
  const dateTbc  = bookings.filter((b) => !b.event_date);
  const past     = bookings.filter((b) => b.event_date && isPast(b.event_date));

  const clientForBtn = {
    displayName: clientProfile.displayName,
    company: clientProfile.company,
    agencyName: clientProfile.agencyName,
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Bookings"
        title="Your bookings"
        subtitle={
          bookings.length === 0
            ? "Confirmed bookings will appear here once your offers are accepted."
            : `${bookings.length} confirmed · ${upcoming.length + dateTbc.length} upcoming`
        }
        badge={upcoming.length + dateTbc.length > 0 ? <HeaderBadge tone="success">{upcoming.length + dateTbc.length} upcoming</HeaderBadge> : undefined}
        actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} />}
      />

      {bookings.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No bookings yet"
          body="Once your inquiries are confirmed, they'll appear here as bookings."
          actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} label="Start inquiry" />}
        />
      ) : (
        <div className="flex flex-col gap-7">
          <BookingSection rows={upcoming} label={t("dashboard.clientBookings.upcoming")} tenantSlug={tenantSlug} reviewPayLabel={t("dashboard.clientBookings.reviewPay")} payNowLabel={t("dashboard.clientBookings.payNow")} payable={payable} locale={locale} />
          <BookingSection rows={dateTbc} label={t("dashboard.clientBookings.dateTbc")} tenantSlug={tenantSlug} reviewPayLabel={t("dashboard.clientBookings.reviewPay")} payNowLabel={t("dashboard.clientBookings.payNow")} payable={payable} locale={locale} />
          <BookingSection rows={past}     label={t("dashboard.clientBookings.past")} tenantSlug={tenantSlug} reviewPayLabel={t("dashboard.clientBookings.reviewPay")} payNowLabel={t("dashboard.clientBookings.payNow")} payable={payable} locale={locale} />
          {/* W7 — client→talent reviews. Self-hides when nothing is eligible. */}
          <ReviewableBookingsSection tenantSlug={tenantSlug} />
          {/* CW5 — payment history: every payment + refund, with receipts. */}
          <PaymentsSection transactions={transactions} locale={locale} />
        </div>
      )}
    </div>
  );
}

// ─── CW5 — Payments & receipts ────────────────────────────────────────────────

function PaymentsSection({ transactions, locale }: { transactions: ClientTransactionRow[]; locale: string }) {
  if (transactions.length === 0) return null;
  const t = createTranslator(locale);
  const fmt = (cents: number, cur: string) =>
    new Intl.NumberFormat(locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(cents / 100);
  const CHECKOUT_LABEL: Record<string, string> = {
    deposit: t("dashboard.clientBookings.deposit"),
    balance: t("dashboard.clientBookings.balance"),
    full: t("dashboard.clientBookings.payment"),
  };
  return (
    <section>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.inkMuted, marginBottom: 10, fontFamily: FONT }}>
        {t("dashboard.clientBookings.paymentsTitle")} ({transactions.length})
      </div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
        {transactions.map((tx, i) => {
          const refunded = tx.status === "refunded" || !!tx.refundedAt;
          const isRefundRow = !!tx.refundOfTransactionId;
          const when = tx.paidAt ?? tx.createdAt;
          return (
            <div
              key={tx.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 14,
                alignItems: "center",
                padding: "12px 18px",
                borderBottom: i < transactions.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                fontFamily: FONT,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  {isRefundRow ? t("dashboard.clientBookings.refund") : CHECKOUT_LABEL[tx.checkoutType ?? "full"] ?? t("dashboard.clientBookings.payment")}
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: refunded ? "rgba(11,11,13,0.05)" : C.greenSoft,
                      color: refunded ? C.inkMuted : C.greenDeep,
                    }}
                  >
                    {refunded ? t("dashboard.clientBookings.refunded") : t("dashboard.clientBookings.paid")}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                  {fmtDate(when)}
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: refunded ? C.inkMuted : C.ink, fontVariantNumeric: "tabular-nums", textDecoration: refunded && !isRefundRow ? "line-through" : "none" }}>
                {isRefundRow ? "-" : ""}{fmt(tx.grossAmountCents, tx.currency)}
              </div>
              {!isRefundRow && !refunded ? (
                <a
                  href={`/api/receipt/${tx.bookingId}`}
                  download
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: C.accent,
                    textDecoration: "none",
                    padding: "4px 10px",
                    borderRadius: 7,
                    border: "1px solid rgba(29,78,216,0.18)",
                    background: "rgba(29,78,216,0.04)",
                    fontFamily: FONT,
                  }}
                >
                  {t("dashboard.clientBookings.receipt")}
                </a>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
