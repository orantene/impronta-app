"use client";

/**
 * OfferTab — replaces the Phase C stub. Renders the live offer card +
 * Approve / Counter / Decline CTAs that fire the canonical engine paths
 * (clientAcceptOffer / clientRejectOffer).
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §6.3 + §19
 * Plan: web/docs/client-execution-plan-2026-05-14.md §23 Phase E
 *
 * Permission boundary:
 *   - Renders line items by display_name + label + units + total only.
 *     talent_cost / coordinator_fee / commission internals are never
 *     sent to the client (loader excludes them).
 *   - Approve & Decline open confirmation drawers; irreversible action
 *     gets explicit confirmation per spec §6.3.
 */

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import {
  approveOfferAction,
  rejectOfferAction,
  counterOfferAction,
  type InquiryOfferActionState,
} from "../_actions/inquiry-offer-actions";
import {
  BALANCE_METHOD_LABEL_KEYS,
  BALANCE_METHOD_DESCRIPTION_KEYS,
  REFUND_POLICY_LABEL_KEYS,
  REFUND_POLICY_DESCRIPTION_KEYS,
  normalizeDepositPct,
} from "@/lib/billing/commercial-terms-types";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { TabLoadingSkeleton } from "./TabLoadingSkeleton";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface: "#FAFAF7",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.10)",
  amber: "#92400E",
  amberSoft: "rgba(146,64,14,0.10)",
  crimson: "#991B1B",
  crimsonSoft: "rgba(153,27,27,0.08)",
} as const;

export function OfferTab({
  details,
  tenantSlug,
  onAfterAction,
}: {
  details: ClientInquiryDetails | null;
  tenantSlug: string;
  /** Called after Approve/Decline succeeds (parent typically refreshes details). */
  onAfterAction?: () => void;
}) {
  const t = useT();
  if (!details) {
    return <TabLoadingSkeleton label={t("dashboard.clientOffer.loading")} />;
  }
  if (!details.offer?.exists) {
    return (
      <div style={{ padding: "24px 22px", fontFamily: FONT }}>
        <div style={emptyCardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {t("dashboard.clientOffer.label")}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: C.ink, fontWeight: 600 }}>
            {t("dashboard.clientOffer.noOfferYet")}
          </div>
          <p style={{ marginTop: 6, fontSize: 13, color: C.inkMuted, lineHeight: 1.5 }}>
            {t("dashboard.clientOffer.noOfferBody")}
          </p>
        </div>
      </div>
    );
  }

  const offer = details.offer;
  const expired = isExpired(offer.expires_at);
  // Audit #12-A (client side): once the client has approved, the offer stays
  // `sent` while the multi-party gate waits on the talents — so suppress the
  // re-decide CTAs and show an honest "awaiting the other parties" state.
  const clientApproved = offer.myApprovalStatus === "accepted";
  const canDecide = offer.status === "sent" && !expired && !clientApproved;

  return (
    <div style={{ padding: "16px 22px 32px", fontFamily: FONT }}>
      <Card>
        <OfferHeader offer={offer} expired={expired} />
        <Divider />
        <LineItemsTable offer={offer} />
        <CostBreakdown offer={offer} />
        <Divider />
        <Totals offer={offer} />
        {offer.commercialTerms && (
          <>
            <Divider />
            <BookingTerms offer={offer} canDecide={canDecide} />
          </>
        )}
        {offer.notes && (
          <>
            <Divider />
            <Notes notes={offer.notes} />
          </>
        )}
        {(offer.status === "rejected" || offer.rejection_reason) && (
          <>
            <Divider />
            <RejectionSummary offer={offer} />
          </>
        )}
        {canDecide && (
          <>
            <Divider />
            <DecisionRibbon
              details={details}
              tenantSlug={tenantSlug}
              onAfterAction={onAfterAction}
            />
          </>
        )}
        {clientApproved && offer.status === "sent" && !expired && (
          <>
            <Divider />
            <div style={{ padding: "12px 0 2px", fontFamily: FONT }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{t("dashboard.clientOffer.youApproved")}</div>
              <p style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
                {t("dashboard.clientOffer.youApprovedBody")}
              </p>
            </div>
          </>
        )}
        {offer.status === "accepted" && (
          <>
            <Divider />
            <AcceptedBanner />
          </>
        )}
      </Card>

      <Disclosures expired={expired} status={offer.status} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function OfferHeader({
  offer,
  expired,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
  expired: boolean;
}) {
  const t = useT();
  // Audit #12-A (client side): once the client has approved, don't keep
  // badging "Awaiting your decision" — the decision is theirs and it's made.
  const statusInfo =
    offer.myApprovalStatus === "accepted" && offer.status === "sent" && !expired
      ? { tone: "success" as const, label: t("dashboard.clientOffer.approvedAwaitingOthers") }
      : statusBadgeInfo(offer.status, expired, t);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {t("dashboard.clientOffer.label")}
        </div>
        <h2 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 600, fontFamily: FONT_DISPLAY, color: C.ink, letterSpacing: -0.2 }}>
          {formatMoney(offer.total_client_price, offer.currency)}
        </h2>
        {offer.sent_at && (
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 4 }}>
            {t("dashboard.clientOffer.sentPrefix")} {formatDateTime(offer.sent_at)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span style={statusBadgeStyle(statusInfo.tone)}>{statusInfo.label}</span>
        {offer.expires_at && (
          <span style={{ fontSize: 11, color: expired ? C.crimson : C.inkMuted, fontWeight: expired ? 600 : 400 }}>
            {expired ? `${t("dashboard.clientOffer.expiredPrefix")} ` : `${t("dashboard.clientOffer.expiresPrefix")} `}
            {formatDateTime(offer.expires_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function LineItemsTable({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  const t = useT();
  if (offer.lines.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.inkMuted, fontStyle: "italic", padding: "10px 0" }}>
        {t("dashboard.clientOffer.singleLine")}
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
        {t("dashboard.clientOffer.whatsIncluded")}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: FONT }}>
        <tbody>
          {offer.lines.map((ln) => (
            <tr key={ln.id}>
              <td style={{ padding: "8px 0", color: C.ink, verticalAlign: "top" }}>
                <div className="font-semibold">
                  {ln.label || ln.talent_name || t("dashboard.clientOffer.lineItemFallback")}
                </div>
                {ln.talent_name && ln.label && (
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                    {ln.talent_name}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                  {ln.units} × {formatMoney(ln.unit_price, offer.currency)} / {ln.pricing_unit}
                </div>
                {ln.service_name && ln.service_name !== ln.label && (
                  <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
                    {interpolate(t("dashboard.clientOffer.fromService"), { service: ln.service_name })}
                  </div>
                )}
              </td>
              <td
                style={{
                  padding: "8px 0",
                  textAlign: "right",
                  color: C.ink,
                  fontVariantNumeric: "tabular-nums",
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                }}
              >
                {formatMoney(ln.total_price, offer.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totals({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  const t = useT();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: FONT }}>
      <div style={{ fontSize: 13, color: C.inkMuted }}>{t("dashboard.clientOffer.total")}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
        {formatMoney(offer.total_client_price, offer.currency)}
      </div>
    </div>
  );
}

/**
 * W6a — "Booking terms" block. The deposit / balance-collection-method /
 * refund-policy are negotiated on the offer; approving = agreeing to them.
 * Display only — nothing here charges the deposit. Client-safe (no internal
 * split). Renders only when the offer carries commercialTerms.
 */
function BookingTerms({
  offer,
  canDecide,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
  canDecide: boolean;
}) {
  const t = useT();
  const terms = offer.commercialTerms;
  if (!terms) return null;
  const pct = normalizeDepositPct(terms.balanceMethod, terms.depositPct);
  const depositMajor =
    terms.depositAmountCents > 0
      ? terms.depositAmountCents / 100
      : (offer.total_client_price * pct) / 100;
  const balanceMajor = Math.max(0, offer.total_client_price - depositMajor);

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 8,
        }}
      >
        {t("dashboard.clientOffer.bookingTerms")}
      </div>
      <div
        style={{
          background: "rgba(11,11,13,0.02)",
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 10,
          overflow: "hidden",
          fontFamily: FONT,
        }}
      >
        <TermRow
          label={t("dashboard.clientOffer.deposit")}
          value={
            pct === 0
              ? t("dashboard.clientOffer.noneUpFront")
              : interpolate(t("dashboard.clientOffer.depositValue"), {
                  amount: formatMoney(depositMajor, offer.currency),
                  pct,
                })
          }
        />
        <TermRow
          label={t("dashboard.clientOffer.balance")}
          value={
            balanceMajor <= 0
              ? t("dashboard.clientOffer.paidInFull")
              : interpolate(t("dashboard.clientOffer.balanceVia"), {
                  amount: formatMoney(balanceMajor, offer.currency),
                  method: t(BALANCE_METHOD_LABEL_KEYS[terms.balanceMethod]),
                })
          }
          hint={t(BALANCE_METHOD_DESCRIPTION_KEYS[terms.balanceMethod])}
        />
        <TermRow
          label={t("dashboard.clientOffer.refunds")}
          value={t(REFUND_POLICY_LABEL_KEYS[terms.refundPolicy])}
          hint={t(REFUND_POLICY_DESCRIPTION_KEYS[terms.refundPolicy])}
          last
        />
      </div>
      {canDecide && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: C.inkMuted, lineHeight: 1.45 }}>
          {t("dashboard.clientOffer.termsAgreement")}
        </div>
      )}
    </div>
  );
}

function TermRow({
  label,
  value,
  hint,
  last,
}: {
  label: string;
  value: string;
  hint?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "9px 14px",
        borderBottom: last ? "none" : `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 13, color: C.inkMuted }}>{label}</span>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: C.ink,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  );
}

/**
 * D9 — "What you're paying for" breakdown.
 *
 * Shows gross composition from the client's perspective ONLY:
 *   Talent fee(s): sum of all line-item totals
 *   Service fee: total_client_price − line totals (the booking service cost)
 *   Total: total_client_price
 *
 * The agency margin and platform internals are never exposed. If line
 * items sum exactly to the total (no service fee component) or there are
 * no line items, the breakdown is omitted to avoid showing a $0 service
 * fee (which would look odd / raise questions).
 *
 * Currency-aware via formatMoney (Intl.NumberFormat).
 */
function CostBreakdown({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  const t = useT();
  if (offer.lines.length === 0) return null;

  const talentFeeTotal = offer.lines.reduce((s, ln) => s + (Number(ln.total_price) || 0), 0);
  const serviceFee = offer.total_client_price - talentFeeTotal;

  // Only show the breakdown when there is a meaningful service-fee component
  // (≥ 1 currency unit in value) so we don't surface a $0 row.
  if (serviceFee < 0.5) return null;

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 8,
        }}
      >
        {t("dashboard.clientOffer.whatYouArePayingFor")}
      </div>
      <div
        style={{
          background: "rgba(11,11,13,0.02)",
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 10,
          overflow: "hidden",
          fontFamily: FONT,
        }}
      >
        <BreakdownRow
          label={t("dashboard.clientOffer.talentFee")}
          hint={
            offer.lines.length === 1
              ? undefined
              : interpolate(t("dashboard.clientOffer.talentCount"), { count: offer.lines.length })
          }
          amount={formatMoney(talentFeeTotal, offer.currency)}
        />
        <BreakdownRow
          label={t("dashboard.clientOffer.serviceFee")}
          hint={t("dashboard.clientOffer.serviceFeeHint")}
          amount={formatMoney(serviceFee, offer.currency)}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            background: "rgba(11,11,13,0.03)",
            borderTop: `1px solid ${C.borderSoft}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{t("dashboard.clientOffer.total")}</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: C.ink,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatMoney(offer.total_client_price, offer.currency)}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: C.inkDim,
          lineHeight: 1.45,
        }}
      >
        {t("dashboard.clientOffer.exactTerms")}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  hint,
  amount,
}: {
  label: string;
  hint?: string;
  amount: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "9px 14px",
        borderBottom: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>{hint}</div>
        )}
      </div>
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: C.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {amount}
      </div>
    </div>
  );
}

function Notes({ notes }: { notes: string }) {
  const t = useT();
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        {t("dashboard.clientOffer.coordinatorNote")}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{notes}</p>
    </div>
  );
}

function RejectionSummary({
  offer,
}: {
  offer: NonNullable<ClientInquiryDetails["offer"]>;
}) {
  const t = useT();
  return (
    <div
      style={{
        padding: "10px 12px",
        background: C.crimsonSoft,
        borderRadius: 8,
        fontSize: 12.5,
        color: C.crimson,
        lineHeight: 1.5,
      }}
    >
      <strong>{t("dashboard.clientOffer.previouslyDeclined")}</strong>
      {offer.rejection_reason && (
        <span className="ml-1.5">· {humanizeReason(offer.rejection_reason, t)}</span>
      )}
      {offer.rejection_reason_text && (
        <div style={{ marginTop: 4, color: C.ink, fontWeight: 400 }}>{offer.rejection_reason_text}</div>
      )}
    </div>
  );
}

function AcceptedBanner() {
  const t = useT();
  return (
    <div
      style={{
        padding: "10px 12px",
        background: C.successSoft,
        borderRadius: 8,
        fontSize: 13,
        color: C.success,
        fontWeight: 600,
      }}
    >
      {t("dashboard.clientOffer.acceptedBanner")}
    </div>
  );
}

// ─── Decision ribbon — opens approve/decline drawers ─────────────────────────

function DecisionRibbon({
  details,
  tenantSlug,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onAfterAction?: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState<"approve" | "counter" | "decline" | null>(null);
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setConfirming("approve")}
          style={primaryBtn}
        >
          {t("dashboard.clientOffer.approveLock")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming("counter")}
          style={ghostBtn}
        >
          {t("dashboard.clientOffer.counter")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming("decline")}
          style={ghostBtn}
        >
          {t("dashboard.clientOffer.decline")}
        </button>
        <div style={{ flex: 1 }} />
        <a
          href={`/${tenantSlug}/client/messages?inquiry=${details.id}&tab=chat`}
          style={{
            ...ghostBtn,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {t("dashboard.clientOffer.askQuestion")}
        </a>
      </div>

      {confirming === "approve" && (
        <ApproveDrawer
          details={details}
          tenantSlug={tenantSlug}
          onClose={() => setConfirming(null)}
          onAfterAction={onAfterAction}
        />
      )}
      {confirming === "counter" && (
        <CounterDrawer
          details={details}
          tenantSlug={tenantSlug}
          onClose={() => setConfirming(null)}
          onAfterAction={onAfterAction}
        />
      )}
      {confirming === "decline" && (
        <DeclineDrawer
          details={details}
          tenantSlug={tenantSlug}
          onClose={() => setConfirming(null)}
          onAfterAction={onAfterAction}
        />
      )}
    </>
  );
}

// ─── Counter drawer ──────────────────────────────────────────────────────────
// A counter is a "[Counter request]" message to the coordinator — it does not
// change the offer state; the coordinator re-drafts. Lighter than Decline (no
// reason taxonomy): just the proposed change.

function CounterDrawer({
  details,
  tenantSlug,
  onClose,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onClose: () => void;
  onAfterAction?: () => void;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<InquiryOfferActionState, FormData>(
    counterOfferAction,
    { kind: "idle" },
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.kind === "countered") {
      onAfterAction?.();
      onClose();
    }
  }, [state, onClose, onAfterAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("inquiryId", details.id);
    fd.set("note", note.trim());
    startTransition(() => formAction(fd));
  };

  const canSend = note.trim().length > 0 && !pending;

  return (
    <DrawerShell
      title={t("dashboard.clientOffer.counterTitle")}
      subtitle={t("dashboard.clientOffer.counterSubtitle")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{t("dashboard.clientOffer.counterPrompt")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={t("dashboard.clientOffer.counterPlaceholder")}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80, lineHeight: 1.45 }}
          />
        </label>
        <Hint>
          {t("dashboard.clientOffer.counterHint")}
        </Hint>
        {state.kind === "error" && (
          <div style={errorBoxStyle}>{state.message}</div>
        )}
      </div>
      <DrawerFooter>
        <button type="button" style={ghostBtn} onClick={onClose}>
          {t("dashboard.clientOffer.cancel")}
        </button>
        <button
          type="button"
          style={canSend ? primaryBtn : { ...primaryBtn, opacity: 0.6, cursor: "not-allowed" }}
          onClick={submit}
          disabled={!canSend}
        >
          {pending ? t("dashboard.clientOffer.sending") : t("dashboard.clientOffer.sendCounter")}
        </button>
      </DrawerFooter>
    </DrawerShell>
  );
}

// ─── Approve drawer ──────────────────────────────────────────────────────────

function ApproveDrawer({
  details,
  tenantSlug,
  onClose,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onClose: () => void;
  onAfterAction?: () => void;
}) {
  const t = useT();
  const offer = details.offer!;
  const [state, formAction, pending] = useActionState<InquiryOfferActionState, FormData>(
    approveOfferAction,
    { kind: "idle" },
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.kind === "approved") {
      onAfterAction?.();
      onClose();
    }
  }, [state, onClose, onAfterAction]);

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("inquiryId", details.id);
    fd.set("offerId", offer.id);
    fd.set("expectedVersion", String(offer.inquiry_version));
    startTransition(() => formAction(fd));
  };

  return (
    <DrawerShell
      title={t("dashboard.clientOffer.approveLock")}
      subtitle={t("dashboard.clientOffer.approveSubtitle")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5">
        <SummaryRow label={t("dashboard.clientOffer.summaryProject")} value={details.job.title ?? t("dashboard.clientOffer.inquiryFallback")} />
        <SummaryRow
          label={t("dashboard.clientOffer.summaryTalent")}
          value={interpolate(t("dashboard.clientOffer.talentOnLineup"), { count: details.talent.selected.length })}
        />
        <SummaryRow
          label={t("dashboard.clientOffer.summarySchedule")}
          value={
            details.schedule.event_date
              ? formatDate(details.schedule.event_date)
              : statusLabel(details.schedule.date_status) ?? t("dashboard.clientOffer.tbd")
          }
        />
        <SummaryRow label={t("dashboard.clientOffer.total")} value={formatMoney(offer.total_client_price, offer.currency)} bold />
        {offer.commercialTerms && (
          <SummaryRow
            label={t("dashboard.clientOffer.deposit")}
            value={
              offer.commercialTerms.depositPct === 0
                ? t("dashboard.clientOffer.noneUpFront")
                : interpolate(t("dashboard.clientOffer.depositValue"), {
                    amount: formatMoney(
                      offer.commercialTerms.depositAmountCents > 0
                        ? offer.commercialTerms.depositAmountCents / 100
                        : (offer.total_client_price * offer.commercialTerms.depositPct) / 100,
                      offer.currency,
                    ),
                    pct: offer.commercialTerms.depositPct,
                  })
            }
          />
        )}
        {offer.commercialTerms && (
          <SummaryRow
            label={t("dashboard.clientOffer.refunds")}
            value={t(REFUND_POLICY_LABEL_KEYS[offer.commercialTerms.refundPolicy])}
          />
        )}
        <Hint>
          {t("dashboard.clientOffer.approveHint")}
        </Hint>
        {state.kind === "error" && (
          <div style={errorBoxStyle}>{state.message}</div>
        )}
      </div>
      <DrawerFooter>
        <button type="button" style={ghostBtn} onClick={onClose}>
          {t("dashboard.clientOffer.cancel")}
        </button>
        <button
          type="button"
          style={pending ? { ...primaryBtn, opacity: 0.6, cursor: "wait" } : primaryBtn}
          onClick={submit}
          disabled={pending}
        >
          {pending ? t("dashboard.clientOffer.approving") : t("dashboard.clientOffer.approveLock")}
        </button>
      </DrawerFooter>
    </DrawerShell>
  );
}

// ─── Decline drawer ──────────────────────────────────────────────────────────

// Value → i18n label-key. Labels are resolved at render via the translator so
// the dropdown follows the dashboard locale.
const REJECTION_OPTIONS = [
  { value: "too_expensive", labelKey: "dashboard.clientOffer.reasonTooExpensive" },
  { value: "wrong_talent", labelKey: "dashboard.clientOffer.reasonWrongTalent" },
  { value: "timing", labelKey: "dashboard.clientOffer.reasonTiming" },
  { value: "changed_plans", labelKey: "dashboard.clientOffer.reasonChangedPlans" },
  { value: "other", labelKey: "dashboard.clientOffer.reasonOther" },
];

function DeclineDrawer({
  details,
  tenantSlug,
  onClose,
  onAfterAction,
}: {
  details: ClientInquiryDetails;
  tenantSlug: string;
  onClose: () => void;
  onAfterAction?: () => void;
}) {
  const t = useT();
  const offer = details.offer!;
  const [reason, setReason] = useState("too_expensive");
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<InquiryOfferActionState, FormData>(
    rejectOfferAction,
    { kind: "idle" },
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.kind === "rejected") {
      onAfterAction?.();
      onClose();
    }
  }, [state, onClose, onAfterAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("inquiryId", details.id);
    fd.set("offerId", offer.id);
    fd.set("expectedVersion", String(offer.inquiry_version));
    fd.set("reason", reason);
    fd.set("reasonText", note.trim());
    startTransition(() => formAction(fd));
  };

  return (
    <DrawerShell
      title={t("dashboard.clientOffer.declineTitle")}
      subtitle={t("dashboard.clientOffer.declineSubtitle")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{t("dashboard.clientOffer.reason")}</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
          >
            {REJECTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{t("dashboard.clientOffer.whatWouldHelp")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("dashboard.clientOffer.declinePlaceholder")}
            style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.45 }}
          />
        </label>
        <Hint>
          {t("dashboard.clientOffer.declineHint")}
        </Hint>
        {state.kind === "error" && (
          <div style={errorBoxStyle}>{state.message}</div>
        )}
      </div>
      <DrawerFooter>
        <button type="button" style={ghostBtn} onClick={onClose}>
          {t("dashboard.clientOffer.cancel")}
        </button>
        <button
          type="button"
          style={pending ? { ...declineBtn, opacity: 0.6, cursor: "wait" } : declineBtn}
          onClick={submit}
          disabled={pending}
        >
          {pending ? t("dashboard.clientOffer.sending") : t("dashboard.clientOffer.declineCta")}
        </button>
      </DrawerFooter>
    </DrawerShell>
  );
}

// ─── Disclosures footer ──────────────────────────────────────────────────────

function Disclosures({ expired, status }: { expired: boolean; status: string }) {
  const t = useT();
  if (status === "accepted") return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        border: `1px dashed ${C.borderSoft}`,
        borderRadius: 8,
        fontSize: 11.5,
        color: C.inkMuted,
        lineHeight: 1.5,
      }}
    >
      {expired ? (
        <span>
          {t("dashboard.clientOffer.expiredDisclosure")}
        </span>
      ) : (
        <>
          <strong style={{ color: C.ink }}>{t("dashboard.clientOffer.paymentCancellation")}</strong>{" "}
          {t("dashboard.clientOffer.paymentCancellationBody")}
        </>
      )}
    </div>
  );
}

// ─── Drawer chrome ───────────────────────────────────────────────────────────

function DrawerShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  // Body-scroll lock.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(11,11,13,0.45)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100vw)",
          height: "100dvh",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
          fontFamily: FONT,
        }}
      >
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {t("dashboard.clientOffer.offerDecision")}
            </div>
            <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>
              {title}
            </h2>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkMuted, lineHeight: 1.45 }}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dashboard.clientOffer.close")}
            style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: "transparent", color: C.ink, fontSize: 16, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, alignItems: "baseline" }}>
      <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 500, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: C.accentSoft,
        borderRadius: 8,
        fontSize: 12,
        color: C.accent,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.borderSoft }} />;
}

const emptyCardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 14,
  padding: "20px 22px",
};

function statusBadgeInfo(
  status: string,
  expired: boolean,
  t: (key: string) => string,
): { tone: "accent" | "success" | "amber" | "crimson"; label: string } {
  if (status === "accepted") return { tone: "success", label: t("dashboard.clientStatus.offerAccepted") };
  if (status === "rejected") return { tone: "crimson", label: t("dashboard.clientStatus.offerDeclined") };
  if (status === "draft") return { tone: "amber", label: t("dashboard.clientStatus.offerBeingPrepared") };
  if (status === "sent")
    return expired
      ? { tone: "crimson", label: t("dashboard.clientStatus.offerExpired") }
      : { tone: "accent", label: t("dashboard.clientStatus.offerAwaitingDecision") };
  if (status === "withdrawn") return { tone: "crimson", label: t("dashboard.clientStatus.offerWithdrawn") };
  if (status === "superseded") return { tone: "amber", label: t("dashboard.clientStatus.offerSuperseded") };
  return { tone: "amber", label: status };
}

function statusBadgeStyle(tone: "accent" | "success" | "amber" | "crimson"): React.CSSProperties {
  const palette = {
    accent: { bg: C.accentSoft, fg: C.accent },
    success: { bg: C.successSoft, fg: C.success },
    amber: { bg: C.amberSoft, fg: C.amber },
    crimson: { bg: C.crimsonSoft, fg: C.crimson },
  }[tone];
  return {
    padding: "4px 10px",
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 13.5,
  color: C.ink,
  background: "#fff",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  height: 38,
  padding: "0 18px",
  borderRadius: 9,
  background: C.ink,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.1,
};

const ghostBtn: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 9,
  background: "#fff",
  color: C.ink,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
};

const declineBtn: React.CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: 9,
  background: C.crimson,
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
};

const errorBoxStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: C.crimsonSoft,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.crimson,
  fontWeight: 600,
  lineHeight: 1.5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() < Date.now();
  } catch {
    return false;
  }
}

function statusLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeReason(reason: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    too_expensive: t("dashboard.clientOffer.humanTooExpensive"),
    wrong_talent: t("dashboard.clientOffer.humanWrongTalent"),
    timing: t("dashboard.clientOffer.humanTiming"),
    changed_plans: t("dashboard.clientOffer.humanChangedPlans"),
    other: t("dashboard.clientOffer.humanOther"),
  };
  return map[reason] ?? reason.replace(/_/g, " ");
}
