import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadActiveBookingTransaction,
  loadPayoutReceiverCandidatesForBooking,
} from "@/lib/bookings/transactions";
import {
  calculateTransactionAmountsForBasisPoints,
  feePercent,
  formatCents,
} from "@/lib/bookings/commission";
import { loadCommissionContext, loadInquiryActivity, type InquiryActivityItem } from "../../../_data-bridge";
import {
  cancelTransactionAction,
  createAgencyPayoutAccountAction,
  createTransactionDraftAction,
  initiatePayoutAction,
  markDisputedAction,
  markFailedAction,
  markPendingAction,
  markPaidAction,
  markPayoutSentAction,
  markRefundedAction,
  requestPaymentAction,
  selectPayoutReceiverAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;
type SearchParams = Promise<{ tx?: string; txerr?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  amber: "#8A6F1A",
  amberSoft: "rgba(212,160,23,0.12)",
  red: "#A33A3A",
  redSoft: "rgba(163,58,58,0.11)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function readRevenueCents(raw: number | string | null): number {
  if (raw == null) return 0;
  return Math.max(0, Math.round(Number(raw) * 100));
}

function transactionStatusLabel(status: string): string {
  if (status === "payment_requested") return "Payment requested";
  if (status === "pending") return "Pending";
  if (status === "paid") return "Paid";
  if (status === "payout_pending") return "Payout pending";
  if (status === "payout_sent") return "Payout sent";
  if (status === "refunded") return "Refunded";
  if (status === "disputed") return "Disputed";
  if (status === "cancelled") return "Cancelled";
  if (status === "failed") return "Failed";
  return "Draft";
}

function InquiryStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    submitted:     { bg: "rgba(43,95,138,0.10)", color: "#1B6E9C", label: "Submitted" },
    coordination:  { bg: "rgba(43,95,138,0.10)", color: "#1B6E9C", label: "In review" },
    offer_pending: { bg: C.amberSoft,            color: C.amber,   label: "Offer pending" },
    offer_sent:    { bg: C.amberSoft,            color: C.amber,   label: "Offer sent" },
    approved:      { bg: C.accentSoft,           color: C.accent,  label: "Approved" },
    booked:        { bg: "rgba(26,115,72,0.10)", color: "#1A7348", label: "Booked" },
    converted:     { bg: "rgba(26,115,72,0.10)", color: "#1A7348", label: "Booked" },
    rejected:      { bg: "rgba(11,11,13,0.05)",  color: "rgba(11,11,13,0.45)", label: "Rejected" },
    expired:       { bg: "rgba(11,11,13,0.05)",  color: "rgba(11,11,13,0.45)", label: "Expired" },
    draft:         { bg: "rgba(11,11,13,0.05)",  color: "rgba(11,11,13,0.45)", label: "Draft" },
  };
  const s = map[status] ?? { bg: "rgba(11,11,13,0.05)", color: "rgba(11,11,13,0.45)", label: status.replace(/_/g, " ") };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 10px",
      borderRadius: 999,
      background: s.bg,
      color: s.color,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      fontFamily: FONT,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

export default async function WorkspaceWorkDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug, id: inquiryId } = await params;
  const { tx, txerr } = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [
    canManageBilling,
    canSelectReceiver,
    canChangeReceiver,
    canRequestPayment,
    canMarkReceived,
    canMarkPayoutExternal,
    canRefund,
    canManagePayoutAccounts,
    supabase,
  ] = await Promise.all([
    userHasCapability("manage_billing", scope.tenantId),
    userHasCapability("booking.payment.select_receiver", scope.tenantId),
    userHasCapability("booking.payment.change_receiver", scope.tenantId),
    userHasCapability("booking.payment.request", scope.tenantId),
    userHasCapability("booking.payment.mark_received", scope.tenantId),
    userHasCapability("booking.payment.payout_mark_external", scope.tenantId),
    userHasCapability("booking.payment.refund", scope.tenantId),
    userHasCapability("agency.payout_account.manage", scope.tenantId),
    createSupabaseServerClient(),
  ]);
  if (!supabase) notFound();
  const canRunBillingActions =
    canManageBilling ||
    canSelectReceiver ||
    canChangeReceiver ||
    canRequestPayment ||
    canMarkReceived ||
    canMarkPayoutExternal ||
    canRefund ||
    canManagePayoutAccounts;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id, status, contact_name, company, event_date, event_location, quantity, created_at, next_action_by, source")
    .eq("tenant_id", scope.tenantId)
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inquiry) notFound();

  const { data: booking } = await supabase
    .from("agency_bookings")
    .select(
      "id, title, status, event_date, venue_name, venue_location_text, total_client_revenue, currency_code, payment_status, client_account_name, contact_name, contact_email",
    )
    .eq("tenant_id", scope.tenantId)
    .eq("source_inquiry_id", inquiryId)
    .maybeSingle();

  const [transaction, commission, payoutCandidates, activityItems] = await Promise.all([
    booking ? loadActiveBookingTransaction(booking.id as string, supabase) : Promise.resolve(null),
    loadCommissionContext(scope.tenantId),
    booking && canRunBillingActions
      ? loadPayoutReceiverCandidatesForBooking({
          tenantId: scope.tenantId,
          bookingId: booking.id as string,
          supabase,
        })
      : Promise.resolve([]),
    loadInquiryActivity(scope.tenantId, inquiryId, 15),
  ]);

  // Age of this inquiry in days
  const ageDays = Math.floor((Date.now() - new Date(inquiry.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const inquirySource = (inquiry as { source?: string | null }).source ?? null;

  const grossRevenueCents = readRevenueCents(
    (booking as { total_client_revenue: number | string | null } | null)?.total_client_revenue ?? null,
  );
  const preview =
    grossRevenueCents > 0
      ? calculateTransactionAmountsForBasisPoints(grossRevenueCents, commission.feeBasisPoints)
      : null;
  const breakdown = transaction
    ? {
        grossCents: transaction.grossAmountCents,
        feeCents: transaction.platformFeeCents,
        netCents: transaction.netAmountCents,
        feeLabel: feePercent(transaction.platformFeeBasisPoints),
        currency: transaction.currency,
      }
    : preview
      ? {
          grossCents: preview.grossCents,
          feeCents: preview.feeCents,
          netCents: preview.netCents,
          feeLabel: commission.feePercent,
          currency: (booking as { currency_code?: string | null } | null)?.currency_code ?? "USD",
        }
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkMuted, fontWeight: 600 }}>
            Workflow detail
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, color: C.ink, letterSpacing: 0 }}>
            {inquiry.contact_name}
          </h1>
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 3 }}>
            {inquiry.company ?? "No company"} · {inquiry.event_location ?? "Location TBD"}
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 8 }}>
          <Link
            href={`/${tenantSlug}/admin/work`}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              textDecoration: "none",
              color: C.ink,
              display: "inline-flex",
              alignItems: "center",
              fontSize: 12.5,
            }}
          >
            Back to pipeline
          </Link>
          <Link
            href={`/${tenantSlug}/admin/bookings`}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              textDecoration: "none",
              color: C.ink,
              display: "inline-flex",
              alignItems: "center",
              fontSize: 12.5,
            }}
          >
            Bookings
          </Link>
        </div>
      </div>

      {tx ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.accentSoft, color: C.accent, borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          {tx}
        </div>
      ) : null}
      {txerr ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.redSoft, color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          {txerr}
        </div>
      ) : null}

      <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.cardBg, padding: 14 }}>
        <div style={{ fontSize: 11, color: C.inkMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Inquiry
        </div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <div style={{ fontSize: 12.5, color: C.inkMuted }}>
            Status
            <div style={{ marginTop: 4 }}>
              <InquiryStatusChip status={inquiry.status} />
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted }}>
            Next action
            <div style={{ marginTop: 2, fontSize: 13, color: C.ink, fontWeight: 600 }}>
              {(inquiry as { next_action_by?: string | null }).next_action_by ?? "—"}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted }}>
            Event date
            <div style={{ marginTop: 2, fontSize: 13, color: C.ink, fontWeight: 600 }}>{inquiry.event_date ?? "TBD"}</div>
          </div>
          {(inquiry as { event_location?: string | null }).event_location && (
            <div style={{ fontSize: 12.5, color: C.inkMuted }}>
              Location
              <div style={{ marginTop: 2, fontSize: 13, color: C.ink, fontWeight: 600 }}>
                {(inquiry as { event_location?: string | null }).event_location}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: C.inkMuted }}>
            Quantity
            <div style={{ marginTop: 2, fontSize: 13, color: C.ink, fontWeight: 600 }}>{inquiry.quantity ?? 0}</div>
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted }}>
            Age
            <div style={{ marginTop: 2, fontSize: 13, color: ageDays > 7 ? C.red : C.ink, fontWeight: 600 }}>
              {ageDays === 0 ? "Today" : `${ageDays}d`}
            </div>
          </div>
          {inquirySource && (
            <div style={{ fontSize: 12.5, color: C.inkMuted }}>
              Source
              <div style={{ marginTop: 2 }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(11,11,13,0.05)",
                  color: C.ink,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: "capitalize",
                }}>
                  {inquirySource}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.cardBg, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: C.inkMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Transaction
            </div>
            <div style={{ marginTop: 6, fontSize: 14, color: C.ink, fontWeight: 600 }}>
              {booking ? (booking.title as string) || "Booking" : "No booking linked to this inquiry yet"}
            </div>
            {booking ? (
              <div style={{ marginTop: 3, fontSize: 12.5, color: C.inkMuted }}>
                {(booking.client_account_name as string | null) ?? "No client account"} · {(booking.contact_name as string | null) ?? "No contact"}
              </div>
            ) : null}
          </div>
          {transaction ? (
            <div style={{ fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 10px", color: C.ink }}>
              {transactionStatusLabel(transaction.status)}
            </div>
          ) : null}
        </div>

        {booking ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: C.inkMuted }}>Gross revenue</div>
              <div style={{ marginTop: 2, fontSize: 16, color: C.ink, fontWeight: 600 }}>
                {breakdown ? formatCents(breakdown.grossCents, breakdown.currency) : "—"}
              </div>
            </div>
            <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: C.inkMuted }}>
                Platform fee ({breakdown?.feeLabel ?? commission.feePercent})
              </div>
              <div style={{ marginTop: 2, fontSize: 16, color: C.ink, fontWeight: 600 }}>
                {breakdown ? formatCents(breakdown.feeCents, breakdown.currency) : "—"}
              </div>
            </div>
            <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: C.inkMuted }}>Net payout</div>
              <div style={{ marginTop: 2, fontSize: 16, color: C.ink, fontWeight: 600 }}>
                {breakdown ? formatCents(breakdown.netCents, breakdown.currency) : "—"}
              </div>
            </div>
          </div>
        ) : null}

        {transaction ? (
          <div style={{ marginTop: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 11, color: C.inkMuted }}>Payout receiver</div>
            {transaction.payoutReceiverId ? (
              <div style={{ marginTop: 3, fontSize: 13, color: C.ink, fontWeight: 600 }}>
                {transaction.payoutReceiverDisplayName}
                {transaction.payoutReceiverKind ? ` · ${transaction.payoutReceiverKind}` : ""}
              </div>
            ) : (
              <div style={{ marginTop: 3, fontSize: 12.5, color: C.inkMuted }}>
                Not selected yet.
              </div>
            )}
            {transaction.providerReference ? (
              <div style={{ marginTop: 4, fontSize: 12, color: C.inkMuted }}>
                Provider reference: {transaction.providerReference}
              </div>
            ) : null}
            {transaction.failureReason ? (
              <div style={{ marginTop: 4, fontSize: 12, color: C.inkMuted }}>
                Note: {transaction.failureReason}
              </div>
            ) : null}

            {canRunBillingActions && ["draft", "payment_requested", "pending"].includes(transaction.status) ? (
              <form
                action={selectPayoutReceiverAction}
                style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
              >
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <input type="hidden" name="transactionId" value={transaction.id} />
                <select
                  name="payoutAccountId"
                  defaultValue={transaction.payoutReceiverId ?? ""}
                  style={{
                    minWidth: 220,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    fontSize: 12.5,
                    color: C.ink,
                    padding: "0 8px",
                    fontFamily: FONT,
                  }}
                >
                  <option value="">Select payout receiver</option>
                  {payoutCandidates.map((candidate) => (
                    <option key={candidate.payoutAccountId} value={candidate.payoutAccountId}>
                      {candidate.displayName} · {candidate.receiverKind}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={
                    payoutCandidates.length === 0 ||
                    (!transaction.payoutReceiverId && !canSelectReceiver && !canManageBilling) ||
                    (Boolean(transaction.payoutReceiverId) && !canChangeReceiver && !canManageBilling)
                  }
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    color: C.ink,
                    fontSize: 12.5,
                    cursor:
                      payoutCandidates.length &&
                      ((transaction.payoutReceiverId && (canChangeReceiver || canManageBilling))
                        || (!transaction.payoutReceiverId && (canSelectReceiver || canManageBilling)))
                        ? "pointer"
                        : "not-allowed",
                    opacity:
                      payoutCandidates.length &&
                      ((transaction.payoutReceiverId && (canChangeReceiver || canManageBilling))
                        || (!transaction.payoutReceiverId && (canSelectReceiver || canManageBilling)))
                        ? 1
                        : 0.45,
                  }}
                >
                  Save receiver
                </button>
              </form>
            ) : null}

            {canManagePayoutAccounts && payoutCandidates.length === 0 ? (
              <form action={createAgencyPayoutAccountAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <button
                  type="submit"
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: "#fff",
                    color: C.ink,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Create workspace payout account
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {canRunBillingActions ? (
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!booking ? (
              <span style={{ fontSize: 12.5, color: C.inkMuted }}>
                Create a booking from this inquiry before starting payment flow.
              </span>
            ) : !transaction ? (
              <form action={createTransactionDraftAction}>
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <input type="hidden" name="inquiryId" value={inquiryId} />
                <button
                  type="submit"
                  disabled={!canRequestPayment && !canManageBilling}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: C.accent,
                    color: "#fff",
                    fontSize: 12.5,
                    fontFamily: FONT,
                    cursor: canRequestPayment || canManageBilling ? "pointer" : "not-allowed",
                    opacity: canRequestPayment || canManageBilling ? 1 : 0.45,
                  }}
                >
                  Create transaction draft
                </button>
              </form>
            ) : (
              <>
                <form action={requestPaymentAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button
                    type="submit"
                    disabled={
                      transaction.status !== "draft" ||
                      !transaction.payoutReceiverId ||
                      (!canRequestPayment && !canManageBilling)
                    }
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: "#fff",
                      color: C.ink,
                      fontSize: 12.5,
                      cursor:
                        transaction.status === "draft" &&
                        transaction.payoutReceiverId &&
                        (canRequestPayment || canManageBilling)
                          ? "pointer"
                          : "not-allowed",
                      opacity:
                        transaction.status === "draft" &&
                        transaction.payoutReceiverId &&
                        (canRequestPayment || canManageBilling)
                          ? 1
                          : 0.45,
                    }}
                  >
                    Request payment
                  </button>
                </form>
                <form action={markPaidAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button type="submit" disabled={!["payment_requested", "pending", "disputed"].includes(transaction.status) || (!canMarkReceived && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.ink, fontSize: 12.5, cursor: ["payment_requested", "pending", "disputed"].includes(transaction.status) && (canMarkReceived || canManageBilling) ? "pointer" : "not-allowed", opacity: ["payment_requested", "pending", "disputed"].includes(transaction.status) && (canMarkReceived || canManageBilling) ? 1 : 0.45 }}>
                    Mark paid
                  </button>
                </form>
                <form action={markPendingAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button type="submit" disabled={transaction.status !== "payment_requested" || (!canMarkReceived && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.ink, fontSize: 12.5, cursor: transaction.status === "payment_requested" && (canMarkReceived || canManageBilling) ? "pointer" : "not-allowed", opacity: transaction.status === "payment_requested" && (canMarkReceived || canManageBilling) ? 1 : 0.45 }}>
                    Mark pending
                  </button>
                </form>
                <form action={initiatePayoutAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button type="submit" disabled={transaction.status !== "paid" || (!canMarkPayoutExternal && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.ink, fontSize: 12.5, cursor: transaction.status === "paid" && (canMarkPayoutExternal || canManageBilling) ? "pointer" : "not-allowed", opacity: transaction.status === "paid" && (canMarkPayoutExternal || canManageBilling) ? 1 : 0.45 }}>
                    Start payout
                  </button>
                </form>
                <form action={markPayoutSentAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <input
                    type="text"
                    name="payoutExternalReference"
                    placeholder="Payout reference (optional)"
                    defaultValue=""
                    style={{
                      height: 32,
                      width: 190,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      padding: "0 10px",
                      fontSize: 12,
                      fontFamily: FONT,
                    }}
                  />
                  <input
                    type="text"
                    name="payoutExternalNote"
                    placeholder="Payout note (optional)"
                    defaultValue=""
                    style={{
                      height: 32,
                      width: 180,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      padding: "0 10px",
                      fontSize: 12,
                      fontFamily: FONT,
                    }}
                  />
                  <button type="submit" disabled={transaction.status !== "payout_pending" || (!canMarkPayoutExternal && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.ink, fontSize: 12.5, cursor: transaction.status === "payout_pending" && (canMarkPayoutExternal || canManageBilling) ? "pointer" : "not-allowed", opacity: transaction.status === "payout_pending" && (canMarkPayoutExternal || canManageBilling) ? 1 : 0.45 }}>
                    Mark payout sent externally
                  </button>
                </form>
                <form action={markFailedAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button type="submit" disabled={!["payment_requested", "pending", "payout_pending"].includes(transaction.status) || (!canMarkReceived && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.redSoft, color: C.red, fontSize: 12.5, cursor: ["payment_requested", "pending", "payout_pending"].includes(transaction.status) && (canMarkReceived || canManageBilling) ? "pointer" : "not-allowed", opacity: ["payment_requested", "pending", "payout_pending"].includes(transaction.status) && (canMarkReceived || canManageBilling) ? 1 : 0.45 }}>
                    Mark failed
                  </button>
                </form>
                <form action={markDisputedAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button type="submit" disabled={transaction.status !== "paid" || (!canRefund && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.redSoft, color: C.red, fontSize: 12.5, cursor: transaction.status === "paid" && (canRefund || canManageBilling) ? "pointer" : "not-allowed", opacity: transaction.status === "paid" && (canRefund || canManageBilling) ? 1 : 0.45 }}>
                    Mark disputed
                  </button>
                </form>
                <form action={markRefundedAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <input
                    type="text"
                    name="refundReference"
                    placeholder="Refund reference (optional)"
                    defaultValue=""
                    style={{
                      height: 32,
                      width: 190,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      padding: "0 10px",
                      fontSize: 12,
                      fontFamily: FONT,
                    }}
                  />
                  <input
                    type="text"
                    name="refundNote"
                    placeholder="Refund note (optional)"
                    defaultValue=""
                    style={{
                      height: 32,
                      width: 180,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      padding: "0 10px",
                      fontSize: 12,
                      fontFamily: FONT,
                    }}
                  />
                  <button type="submit" disabled={!["paid", "payout_pending", "payout_sent", "disputed"].includes(transaction.status) || (!canRefund && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.amberSoft, color: C.amber, fontSize: 12.5, cursor: ["paid", "payout_pending", "payout_sent", "disputed"].includes(transaction.status) && (canRefund || canManageBilling) ? "pointer" : "not-allowed", opacity: ["paid", "payout_pending", "payout_sent", "disputed"].includes(transaction.status) && (canRefund || canManageBilling) ? 1 : 0.45 }}>
                    Mark refunded
                  </button>
                </form>
                <form action={cancelTransactionAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="inquiryId" value={inquiryId} />
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <button type="submit" disabled={!["draft", "payment_requested", "failed"].includes(transaction.status) || (!canRequestPayment && !canManageBilling)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.amberSoft, color: C.amber, fontSize: 12.5, cursor: ["draft", "payment_requested", "failed"].includes(transaction.status) && (canRequestPayment || canManageBilling) ? "pointer" : "not-allowed", opacity: ["draft", "payment_requested", "failed"].includes(transaction.status) && (canRequestPayment || canManageBilling) ? 1 : 0.45 }}>
                    Cancel
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12.5, color: C.inkMuted }}>
            You do not currently have permission to change transaction billing state.
          </div>
        )}
      </section>

      {/* ── Activity feed ── */}
      {activityItems.length > 0 && (
        <section style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.cardBg, padding: 14 }}>
          <div style={{ fontSize: 11, color: C.inkMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>
            Activity
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {(activityItems as InquiryActivityItem[]).map((evt, i) => {
              const label = (() => {
                const t = evt.event_type;
                if (t === "inquiry_submitted")     return "Inquiry submitted";
                if (t === "status_changed")        return "Status changed";
                if (t === "offer_sent")            return "Offer sent";
                if (t === "offer_approved")        return "Offer approved";
                if (t === "offer_declined")        return "Offer declined";
                if (t === "offer_revised")         return "Offer revised";
                if (t === "booking_created")       return "Booking created";
                if (t === "booking_confirmed")     return "Booking confirmed";
                if (t === "talent_assigned")       return "Talent assigned";
                if (t === "talent_accepted")       return "Talent accepted";
                if (t === "talent_declined")       return "Talent declined";
                if (t === "payment_requested")     return "Payment requested";
                if (t === "payment_received")      return "Payment received";
                if (t === "payout_sent")           return "Payout sent";
                if (t === "coordinator_accepted")  return "Coordinator accepted";
                if (t === "note_added")            return "Note added";
                if (t === "message_sent")          return "Message sent";
                return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              })();
              const when = new Date(evt.created_at).toLocaleDateString("en-AU", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              });
              return (
                <div
                  key={evt.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "9px 0",
                    borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
                    fontFamily: FONT,
                  }}
                >
                  <span style={{
                    flexShrink: 0, marginTop: 2,
                    width: 7, height: 7, borderRadius: "50%",
                    background: "rgba(11,11,13,0.18)",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: C.ink }}>{label}</div>
                    {evt.actor_name && (
                      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>
                        {evt.actor_name}{evt.actor_role ? ` · ${evt.actor_role}` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 11, color: C.inkMuted }}>{when}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
