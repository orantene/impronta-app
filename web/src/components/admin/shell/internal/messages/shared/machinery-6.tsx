"use client";

import React, { useState, useTransition, useEffect, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate, type Translator } from "@/i18n/interpolate";
import { CallSheetEditorSheet } from "@/components/admin/call-sheet-editor/CallSheetEditorSheet";
import { setInquiryPayoutReceiver, loadInquiryPayoutReceiverCandidates, loadInquiryPaymentState, requestInquiryPayment, markInquiryPaymentPending, markInquiryPaymentReceived, initiateInquiryPayout, markInquiryPaymentDisputed, markInquiryPayoutSent, markInquiryPaymentFailed, cancelInquiryTransaction, createInquiryTransactionDraft, markInquiryPaidInCash, type PayoutReceiverOption, type InquiryPaymentState } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, COLORS, FONTS, type InquiryRecord } from "../../state";
import { type Conversation } from "../../talent";
import { currentTalentId } from "../messages-shared";
import { MOCK_OFFER_FOR_CONV, nextActionFor } from "./machinery-10";
import type { OfferPov } from "./machinery-10";
import { disabledBtn, ghostBtn, primaryBtn } from "./machinery-13";
import { DetailField, DetailSection, DetailsPanel } from "./machinery-7";
import type { Offer } from "./machinery-9";
// Friendly labels for booking_transactions.status — source of truth is
// status-labels.ts; the export alias keeps existing callers stable.
import { TRANSACTION_STATUS_LABELS as TRANSACTION_STATUS_LABEL, TRANSACTION_STATUS_LABEL_KEYS } from "@/lib/status-labels";
export { TRANSACTION_STATUS_LABELS as TRANSACTION_STATUS_LABEL } from "@/lib/status-labels";


export function LogisticsTab({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  const { toast } = useAdminShell();
  const t = useT();
  const isClient = pov === "client";
  // Phase A C1 — dead-chrome sweep: each "Coming soon" button now
  // toasts instead of staring back inertly at the user.
  const comingSoon = (what: string) => {
    toast(interpolate(t("dashboard.adminTabs.logistics.comingSoonToast"), { what }));
  };
  const futureBtnStyle: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 10,
    border: `1.5px dashed ${COLORS.border}`,
    background: COLORS.amberSoft, color: COLORS.amberDeep,
    fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
  };
  // B2 — real call sheet editor (admin pov only).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiry.id);
  const [callSheetOpen, setCallSheetOpen] = useState(false);
  const canEditCallSheet = !isClient && isUuid;
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title={t("dashboard.adminTabs.logistics.callSheet")}>
        <DetailField label={t("dashboard.adminTabs.logistics.date")} value={inquiry.schedule.start} />
        {inquiry.schedule.callTime && <DetailField label={t("dashboard.adminTabs.logistics.callTime")} value={inquiry.schedule.callTime} />}
        {inquiry.schedule.wrapTime && <DetailField label={t("dashboard.adminTabs.logistics.wrap")} value={inquiry.schedule.wrapTime} />}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          {canEditCallSheet ? (
            <button
              type="button"
              onClick={() => setCallSheetOpen(true)}
              style={{
                padding: "8px 14px", borderRadius: 10,
                background: COLORS.accent, color: "#fff", border: "none",
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}
            >
              {t("dashboard.adminTabs.logistics.editCallSheet")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => comingSoon(t("dashboard.adminTabs.logistics.callSheetViewer"))}
              title={t("dashboard.adminTabs.comingSoon")}
              style={futureBtnStyle}
            >
              <span aria-hidden>✦</span>
              {t("dashboard.adminTabs.logistics.viewCallSheet")}
              <span style={{ fontSize: 10.5, opacity: 0.7 }}>· {t("dashboard.adminTabs.soon")}</span>
            </button>
          )}
        </div>
      </DetailSection>
      {canEditCallSheet && (
        <CallSheetEditorSheet
          open={callSheetOpen}
          inquiryId={inquiry.id}
          initial={{
            eventDate: inquiry.schedule.start ?? null,
            eventLocation: inquiry.location.address ?? null,
            callTime: inquiry.schedule.callTime ?? null,
            wrapTime: inquiry.schedule.wrapTime ?? null,
            venueName: inquiry.location.venue ?? null,
            googleMapsUrl: inquiry.location.mapUrl ?? null,
            notes: null,
          }}
          onClose={() => setCallSheetOpen(false)}
          onSaved={() => toast(t("dashboard.adminTabs.logistics.callSheetSavedToast"))}
        />
      )}
      <DetailSection title={t("dashboard.adminTabs.logistics.location")}>
        {inquiry.location.venue && <DetailField label={t("dashboard.adminTabs.logistics.venue")} value={inquiry.location.venue} />}
        {inquiry.location.address && <DetailField label={t("dashboard.adminTabs.logistics.address")} value={inquiry.location.address} />}
        {inquiry.location.mapUrl && (
          <a
            href={inquiry.location.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...ghostBtn(), textDecoration: "none", display: "inline-block" }}
          >
            {t("dashboard.adminTabs.logistics.openMap")}
          </a>
        )}
      </DetailSection>
      <DetailSection title={t("dashboard.adminTabs.logistics.transport")}>
        <div style={{ fontSize: 12, padding: "6px 0" }} className="text-admin-ink-muted">
          {t("dashboard.adminTabs.logistics.transportHint")}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => comingSoon(t("dashboard.adminTabs.logistics.transportEditor"))}
            title={t("dashboard.adminTabs.comingSoon")}
            style={futureBtnStyle}
          >
            <span aria-hidden>✦</span>{t("dashboard.adminTabs.logistics.addTransport")}
            <span style={{ fontSize: 10.5, opacity: 0.7 }}>· {t("dashboard.adminTabs.soon")}</span>
          </button>
        </div>
      </DetailSection>
    </div>
  );
}

/**
 * PayoutReceiverPicker — surfaces eligible payout accounts for the
 * booking and lets the admin select / change one. Wraps
 * `setInquiryPayoutReceiver` (which writes to the active transaction).
 */
export function PayoutReceiverPicker({
  inquiryId,
  currentPayoutAccountId,
  currentDisplayName,
  onChanged,
}: {
  inquiryId: string;
  currentPayoutAccountId: string | null;
  currentDisplayName: string | null;
  onChanged: () => void;
}) {
  const { toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const [candidates, setCandidates] = useState<PayoutReceiverOption[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(currentPayoutAccountId ?? "");

  useEffect(() => {
    setSelected(currentPayoutAccountId ?? "");
  }, [currentPayoutAccountId]);

  useEffect(() => {
    loadInquiryPayoutReceiverCandidates(effectiveTenant.slug, inquiryId)
      .then((r) => {
        if (r.ok) setCandidates(r.data ?? []);
        else toast(interpolate(t("dashboard.adminTabs.payout.loadCandidatesFailed"), { error: r.error ?? "" }));
      });
  }, [inquiryId, effectiveTenant.slug]);

  const apply = () => {
    if (!selected) { toast(t("dashboard.adminTabs.payout.chooseReceiverPrompt")); return; }
    startTransition(async () => {
      const r = await setInquiryPayoutReceiver(effectiveTenant.slug, inquiryId, selected);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.payout.setReceiverFailed"), { error: r.error ?? "" }));
      else { toast(t("dashboard.adminTabs.payout.receiverSetToast")); onChanged(); }
    });
  };

  return (
    <div style={{
      marginTop: 8, padding: "8px 10px",
      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 8,
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      fontFamily: FONTS.body, fontSize: 12,
    }}>
      <span style={{ fontWeight: 700 }} className="text-admin-ink">{t("dashboard.adminTabs.payout.receiverLabel")}</span>
      {currentDisplayName && (
        <span className="text-admin-ink-muted text-admin-11">{interpolate(t("dashboard.adminTabs.payout.currently"), { name: currentDisplayName })}</span>
      )}
      <span style={{ flex: 1 }} />
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending || candidates == null}
        style={{
          padding: "5px 8px", fontSize: 12, fontFamily: FONTS.body,
          border: `1px solid ${COLORS.border}`, borderRadius: 6,
          minWidth: 180,
        }}
      >
        <option value="">{t("dashboard.adminTabs.payout.chooseOption")}</option>
        {(candidates ?? []).map((c) => (
          <option key={c.payoutAccountId} value={c.payoutAccountId}>
            {c.displayName} ({c.receiverKind})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !selected || selected === currentPayoutAccountId}
        onClick={apply}
        style={primaryBtn(COLORS.accent)}
      >
        {pending ? t("dashboard.adminTabs.saving") : currentPayoutAccountId ? t("dashboard.adminTabs.payout.change") : t("dashboard.adminTabs.payout.set")}
      </button>
      {candidates != null && candidates.length === 0 && (
        <div style={{ flexBasis: "100%", fontSize: 11 }} className="text-admin-coral-deep">
          {t("dashboard.adminTabs.payout.noAccounts")}
        </div>
      )}
    </div>
  );
}

export function formatCents(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 })
      .format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Localize a booking-transaction status via the additive KEYS map, falling
 *  back to the English label map on a catalog miss. */
function txStatusLabel(status: string, t: ReturnType<typeof useT>): string {
  const key = TRANSACTION_STATUS_LABEL_KEYS[status];
  if (key) {
    const out = t(key);
    if (out !== key) return out;
  }
  return TRANSACTION_STATUS_LABEL[status] ?? status;
}

export function PaymentTab({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  const { toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const isClient = pov === "client";
  // WS4 — the appointed inquiry coordinator (talent_coord) manages payment +
  // payout for THIS booking with admin-equivalent rights. Every money action
  // runs through the WS3-widened pipeline actions under the coordinator's own
  // session. No Pay CTA added (client checkout stays client-only). Regression-
  // safe: existing call sites pass pov 'client' or 'admin', never 'talent_coord'.
  const isAdmin = pov === "admin" || pov === "talent_coord";
  const fallbackTotal = inquiry.budget?.amount ?? 0;
  const fallbackCurrency = inquiry.budget?.currency ?? "USD";

  const [state, setState] = useState<InquiryPaymentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  // Latest-t ref: useT() returns a fresh closure each render, so putting t in
  // reload's deps would rebuild reload every render and make the
  // `useEffect(reload)` below refetch on every render (infinite loop). Read the
  // translator off a ref (only used in the error branch) so reload stays stable.
  const tRef = React.useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const reload = React.useCallback(() => {
    setLoading(true);
    loadInquiryPaymentState(effectiveTenant.slug, inquiry.id)
      .then((r) => {
        if (r.ok) setState(r.data ?? null);
        else toast(interpolate(tRef.current("dashboard.adminTabs.payment.loadStateFailed"), { error: r.error ?? "" }));
      })
      .finally(() => setLoading(false));
  }, [inquiry.id, effectiveTenant.slug, toast]);

  useEffect(() => { reload(); }, [reload]);

  const txn = state?.transaction;
  const txStatus = txn?.status ?? null;
  const totalCents = state?.totalRevenueCents ?? (fallbackTotal ? fallbackTotal * 100 : null);
  const currency = state?.currency ?? fallbackCurrency;

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string } | undefined | void>) => {
    startTransition(async () => {
      const r = await fn();
      if (r && "ok" in r && !r.ok) {
        toast(interpolate(t("dashboard.adminTabs.payment.actionFailed"), { label, error: (r as { error?: string }).error ?? t("dashboard.adminTabs.payment.unknownError") }));
      } else {
        toast(interpolate(t("dashboard.adminTabs.payment.actionOk"), { label }));
        reload();
      }
    });
  };

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title={isClient ? t("dashboard.adminTabs.payment.invoice") : t("dashboard.adminTabs.payment.billing")}>
        <DetailField label={t("dashboard.adminTabs.payment.total")} value={formatCents(totalCents, currency)} />
        <DetailField
          label={t("dashboard.adminTabs.payment.status")}
          value={
            loading ? t("dashboard.adminTabs.loading")
              : txStatus ? txStatusLabel(txStatus, t)
              : state?.bookingId ? t("dashboard.adminTabs.payment.noTransactionYet")
              : t("dashboard.adminTabs.payment.noBookingYet")
          }
        />
        {txn && (
          <>
            <DetailField label={t("dashboard.adminTabs.payment.netAmount")} value={formatCents(txn.netAmountCents, txn.currency)} />
            {txn.paidAt && <DetailField label={t("dashboard.adminTabs.payment.paidAt")} value={new Date(txn.paidAt).toLocaleString()} />}
            {txn.failureReason && <DetailField label={t("dashboard.adminTabs.payment.failureReason")} value={txn.failureReason} />}
          </>
        )}
        {isAdmin && txn && (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(txStatus === "draft") && (
              <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.requestPayment"), () => requestInquiryPayment(effectiveTenant.slug, inquiry.id))} style={primaryBtn(COLORS.accent)}>
                {t("dashboard.adminTabs.payment.requestPayment")}
              </button>
            )}
            {(txStatus === "payment_requested") && (
              <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.markPending"), () => markInquiryPaymentPending(effectiveTenant.slug, inquiry.id))} style={ghostBtn()}>
                {t("dashboard.adminTabs.payment.markPending")}
              </button>
            )}
            {(txStatus === "payment_requested" || txStatus === "pending" || txStatus === "disputed") && (
              <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.markReceived"), () => markInquiryPaymentReceived(effectiveTenant.slug, inquiry.id))} style={primaryBtn(COLORS.success)}>
                {t("dashboard.adminTabs.payment.markReceived")}
              </button>
            )}
            {(txStatus === "paid") && (
              <>
                <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.initiatePayout"), () => initiateInquiryPayout(effectiveTenant.slug, inquiry.id))} style={primaryBtn(COLORS.accent)}>
                  {t("dashboard.adminTabs.payment.initiatePayout")}
                </button>
                <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.markDisputed"), () => markInquiryPaymentDisputed(effectiveTenant.slug, inquiry.id))} style={ghostBtn()}>
                  {t("dashboard.adminTabs.payment.markDisputed")}
                </button>
              </>
            )}
            {(txStatus === "payout_pending") && (
              <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.markPayoutSent"), () => markInquiryPayoutSent(effectiveTenant.slug, inquiry.id, null))} style={primaryBtn(COLORS.success)}>
                {t("dashboard.adminTabs.payment.markPayoutSent")}
              </button>
            )}
            {(txStatus === "payment_requested" || txStatus === "pending" || txStatus === "payout_pending") && (
              <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.markFailed"), () => markInquiryPaymentFailed(effectiveTenant.slug, inquiry.id, "manual_marked_failed"))} style={ghostBtn()}>
                {t("dashboard.adminTabs.payment.markFailed")}
              </button>
            )}
            {(txStatus === "draft" || txStatus === "payment_requested" || txStatus === "failed") && (
              <button type="button" disabled={pending} onClick={() => run(t("dashboard.adminTabs.payment.cancelTransaction"), () => cancelInquiryTransaction(effectiveTenant.slug, inquiry.id))} style={ghostBtn()}>
                {t("dashboard.adminTabs.payment.cancel")}
              </button>
            )}
          </div>
        )}
        {isAdmin && !txn && state?.bookingId && (
          <div className="mt-2.5">
            {state.depositPaid ? (
              // 6.3: deposit already collected — only the balance remains.
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(t("dashboard.adminTabs.payment.requestBalance"), () => createInquiryTransactionDraft(effectiveTenant.slug, inquiry.id, "balance"))}
                  style={primaryBtn(COLORS.accent)}
                >
                  {pending ? t("dashboard.adminTabs.creating") : t("dashboard.adminTabs.payment.requestBalance")}
                </button>
                <div className="text-[11px] mt-1 text-admin-ink-muted">
                  {t("dashboard.adminTabs.payment.depositCollectedHint")}
                </div>
              </>
            ) : state.depositAmountCents > 0 ? (
              // 6.3: a deposit is configured — offer deposit-first OR full payment.
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(t("dashboard.adminTabs.payment.requestDeposit"), () => createInquiryTransactionDraft(effectiveTenant.slug, inquiry.id, "deposit"))}
                    style={primaryBtn(COLORS.accent)}
                  >
                    {pending ? t("dashboard.adminTabs.creating") : interpolate(t("dashboard.adminTabs.payment.requestDepositAmount"), { amount: (state.depositAmountCents / 100).toFixed(2), currency: state.currency ?? "USD" })}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(t("dashboard.adminTabs.payment.createDraft"), () => createInquiryTransactionDraft(effectiveTenant.slug, inquiry.id, "full"))}
                    style={ghostBtn()}
                  >
                    {t("dashboard.adminTabs.payment.requestFullPayment")}
                  </button>
                </div>
                <div className="text-[11px] mt-1 text-admin-ink-muted">
                  {t("dashboard.adminTabs.payment.depositHoldsHint")}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(t("dashboard.adminTabs.payment.createDraft"), () => createInquiryTransactionDraft(effectiveTenant.slug, inquiry.id, "full"))}
                  style={primaryBtn(COLORS.accent)}
                >
                  {pending ? t("dashboard.adminTabs.creating") : t("dashboard.adminTabs.payment.createDraft")}
                </button>
                <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">
                  {t("dashboard.adminTabs.payment.draftsTransactionHint")}
                </div>
              </>
            )}
          </div>
        )}
        {/* Off-platform: record the whole booking as paid in CASH / EFECTIVO in
            one click. No Stripe, no payout receiver — the platform fee accrues to
            the workspace off-platform balance. Shown until the booking settles. */}
        {isAdmin && state?.bookingId && txStatus !== "paid" && txStatus !== "payout_pending" && txStatus !== "payout_sent" && (
          <div className="mt-2 border-t border-admin-border pt-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(t("dashboard.adminTabs.payment.markPaidCash"), () => markInquiryPaidInCash(effectiveTenant.slug, inquiry.id))}
              style={ghostBtn()}
            >
              {pending ? t("dashboard.adminTabs.saving") : t("dashboard.adminTabs.payment.markPaidCash")}
            </button>
            <div className="text-[11px] mt-1 text-admin-ink-muted">
              {t("dashboard.adminTabs.payment.markPaidCashHint")}
            </div>
          </div>
        )}
      </DetailSection>
      {!isClient && (
        <DetailSection title={t("dashboard.adminTabs.payment.payouts")}>
          <div style={{ fontSize: 12, padding: "6px 0" }} className="text-admin-ink-muted">
            {txStatus === "payout_sent"
              ? (txn?.payoutCompletedAt
                  ? interpolate(t("dashboard.adminTabs.payment.payoutSentAt"), { date: new Date(txn.payoutCompletedAt).toLocaleString() })
                  : t("dashboard.adminTabs.payment.payoutSent"))
              : txStatus === "payout_pending"
              ? (txn?.payoutInitiatedAt
                  ? interpolate(t("dashboard.adminTabs.payment.payoutPendingSince"), { date: new Date(txn.payoutInitiatedAt).toLocaleString() })
                  : t("dashboard.adminTabs.payment.payoutPending"))
              : txStatus === "paid"
              ? t("dashboard.adminTabs.payment.fundsReceivedHint")
              : t("dashboard.adminTabs.payment.releasedHint")}
          </div>
          {isAdmin && txn && (txStatus === "paid" || txStatus === "payout_pending") && (
            <PayoutReceiverPicker
              inquiryId={inquiry.id}
              currentPayoutAccountId={txn.payoutReceiverId}
              currentDisplayName={txn.payoutReceiverDisplayName}
              onChanged={reload}
            />
          )}
        </DetailSection>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Timeline ↔ chat continuity
//
// Inquiry timeline events that are flagged `surfaceInChat` get rendered
// as centered system bubbles in the matching thread (client / talent /
// internal). Same data, two views — keeps Activity and Messages from
// drifting per the spec §13.
// ════════════════════════════════════════════════════════════════════

/**
 * Shell-level next-action bar. Sticks to the bottom of the inquiry shell
 * when a thread is open. Context-aware:
 *   - resolves the single most useful next action for this pov + status
 *   - never a generic "always on" bar — only renders when there's a real
 *     ask of the user
 *
 * Keeps role tone tight:
 *   client    → approve / counter / view file
 *   talent    → submit rate / accept / counter
 *   coord/admin → send to client / assign / build call sheet
 */
export type ShellAction = {
  label: string;
  tone: "primary" | "success" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

export function ShellNextActionBar({
  primary, secondary, hint,
}: {
  primary?: ShellAction;
  secondary?: ShellAction;
  hint?: string;
}) {
  const t = useT();
  // No-op when nothing is asked of the user — the bar should never feel
  // generic. Returning null keeps the shell quiet.
  // Slice 2 (Messages consolidation): the sticky action bar was always
  // on, even after the user had clearly noted the suggestion. It now
  // auto-collapses once dismissed for that state-key and re-expands the
  // moment the underlying nudge changes (different hint+label means new
  // state). Re-shows on remount (per inquiry switch).
  const stateKey = `${hint ?? ""}|${primary?.label ?? ""}|${secondary?.label ?? ""}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // Reset dismissal when the underlying state changes (new key).
  useEffect(() => { setDismissedKey(null); }, [stateKey]);

  if (!primary && !secondary && !hint) return null;
  const secondaryDisabled = !!secondary && (secondary.disabled || !secondary.onClick);
  const primaryDisabled = !!primary && (primary.disabled || !primary.onClick);
  const isDismissed = dismissedKey === stateKey;

  // Dismissed → tiny ephemeral chip in the corner instead of a full bar.
  // Click to expand back. Disappears entirely on next state change.
  if (isDismissed && primary) {
    return (
      <div style={{
        position: "sticky", bottom: 0, zIndex: 6,
        padding: "6px 10px",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6,
        fontFamily: FONTS.body,
      }}>
        <button
          type="button"
          onClick={() => setDismissedKey(null)}
          title={hint ?? primary.label}
          aria-label={interpolate(t("dashboard.adminTabs.nextAction.showAria"), { label: primary.label })}
          style={{
            padding: "3px 9px", borderRadius: 999,
            background: COLORS.surfaceAlt, color: COLORS.inkMuted,
            border: `1px solid ${COLORS.borderSoft}`,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            fontFamily: FONTS.body,
          }}
        >
          ↑ {primary.label}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      position: "sticky", bottom: 0, zIndex: 6,
      padding: "8px 14px",
      background: "rgba(255,255,255,0.96)", backdropFilter: "blur(6px)",
      borderTop: `1px solid ${COLORS.borderSoft}`,
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: FONTS.body,
    }}>
      {hint && (
        <span style={{ flex: 1, minWidth: 0, fontSize: 12 }} className="text-admin-ink-muted">
          {hint}
        </span>
      )}
      {!hint && <span style={{ flex: 1 }} />}
      {secondary && (
        <button
          type="button"
          disabled={secondaryDisabled}
          onClick={secondary.onClick}
          title={secondary.title}
          style={secondaryDisabled ? disabledBtn(ghostBtn()) : ghostBtn()}
        >
          {secondary.label}
        </button>
      )}
      {primary && (
        <button
          type="button"
          disabled={primaryDisabled}
          onClick={() => {
            primary.onClick?.();
            // After the user takes the action, auto-collapse the bar.
            // The action navigates to the target tab; the persistent
            // banner is no longer needed. State change will re-expand
            // on next inquiry-state delta.
            setDismissedKey(stateKey);
          }}
          title={primary.title}
          style={primaryDisabled
            ? disabledBtn(primaryBtn(primary.tone === "success" ? COLORS.success : COLORS.accent))
            : primaryBtn(primary.tone === "success" ? COLORS.success : COLORS.accent)}
        >
          {primary.label}
        </button>
      )}
      {/* Manual dismiss — small unobtrusive × on the right. Keeps the
          bar collapsible without forcing the user to click through to
          take action they already plan to take via another route. */}
      <button
        type="button"
        onClick={() => setDismissedKey(stateKey)}
        title={t("dashboard.adminTabs.nextAction.dismissTitle")}
        aria-label={t("dashboard.adminTabs.nextAction.dismissAria")}
        style={{
          width: 22, height: 22, padding: 0,
          borderRadius: "50%",
          background: "transparent", border: "none",
          color: COLORS.inkDim, cursor: "pointer",
          fontSize: 14, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >×</button>
    </div>
  );
}

/** Resolve the single best next action for a given pov + Conversation. */
export type ShellActionResolverOptions = {
  onOpenOffer?: () => void;
  onOpenClientThread?: () => void;
};
export function resolveShellAction(
  conv: Conversation, pov: "client" | "talent" | "talent_coord" | "admin",
  _toast: (s: string) => void,
  options: ShellActionResolverOptions = {},
  t?: Translator,
): { primary?: ShellAction; secondary?: ShellAction; hint?: string } {
  // Localize when a translator is supplied; fall back to English so
  // unlocalized callers keep the current copy.
  const tx = (key: string, fallback: string): string => {
    if (!t) return fallback;
    const out = t(key);
    return out === key ? fallback : out;
  };
  const offer = MOCK_OFFER_FOR_CONV[conv.id];
  // Slice E (Messages consolidation v2): verb table from plan §9.
  // Booked stage — role-shaped action verbs. Call sheet editor is
  // shipped (B2), so the copy points users at it concretely.
  if (conv.stage === "booked") {
    if (pov === "client")
      return {
        hint: tx("dashboard.adminTabs.shellAction.clientBookedHint", "Booked. Open the event plan + your payment status."),
        primary: { label: tx("dashboard.adminTabs.shellAction.openEvent", "Open event"), tone: "success", onClick: options.onOpenOffer ?? (() => {}) },
      };
    if (pov === "talent" || pov === "talent_coord")
      return {
        hint: tx("dashboard.adminTabs.shellAction.talentBookedHint", "You're booked. Open the call sheet for prep + arrival."),
        primary: { label: tx("dashboard.adminTabs.shellAction.openEvent", "Open event"), tone: "success", onClick: options.onOpenOffer ?? (() => {}) },
      };
    // admin
    return {
      hint: tx("dashboard.adminTabs.shellAction.adminBookedHint", "Booked. Open the event details + call sheet."),
      primary: { label: tx("dashboard.adminTabs.shellAction.openEvent", "Open event"), tone: "success", onClick: options.onOpenOffer ?? (() => {}) },
    };
  }

  // Past (wrapped) stage — payouts + receipts.
  if (conv.stage === "past") {
    if (pov === "client") return { hint: tx("dashboard.adminTabs.shellAction.clientWrappedHint", "Wrapped. Receipt + invoice available in Files.") };
    if (pov === "talent" || pov === "talent_coord") return { hint: tx("dashboard.adminTabs.shellAction.talentWrappedHint", "Wrapped. Payment cleared, receipt in Files.") };
    return { hint: tx("dashboard.adminTabs.shellAction.adminWrappedHint", "Wrapped. Mark payouts ready when settled.") };
  }

  // ── Offer-driven actions: defer to nextActionFor as the single
  //    source of truth so the shell bar at the bottom and the offer
  //    tab's sticky bar at the top never disagree. Was previously a
  //    parallel decision tree that diverged in copy + edge cases
  //    (e.g. coordinator_review showed talent "Accept/Decline" because
  //    the local fallback didn't recognize that stage). ──
  if (offer) {
    const povObj: OfferPov = pov === "client" ? { kind: "client" }
      : pov === "admin" ? { kind: "admin" }
      : { kind: "talent", talentId: currentTalentId(), isCoordinator: pov === "talent_coord" };
    const action = nextActionFor(offer, povObj);
    // nextActionFor now returns stable keys + params (wave 26). Render the
    // localized label via this consumer's translator. When t is absent
    // (unlocalized caller) `t(key)` returns the key, so fall back to the
    // English catalog default via en.json's per-key fallback at render.
    const actionLabel = t
      ? interpolate(t(action.labelKey), action.labelParams ?? {})
      : action.labelKey;
    const needsOfferTab = !!(action.cta || action.secondary);
    const offerHint = needsOfferTab
      ? interpolate(tx("dashboard.adminTabs.shellAction.offerHintSuffix", "{label} Open the Offer tab to continue."), { label: actionLabel })
      : actionLabel;
    return {
      hint: offerHint,
      primary: needsOfferTab && options.onOpenOffer ? {
        label: tx("dashboard.adminTabs.shellAction.openOffer", "Open offer"),
        tone: action.ctaTone === "success" ? "success" : "primary",
        onClick: options.onOpenOffer,
        // Raw union kept as the button title/discriminant (never rendered
        // as primary copy). Localized via ctaKey/secondaryKey when present.
        title: (action.ctaKey && t ? t(action.ctaKey) : action.cta) ?? (action.secondaryKey && t ? t(action.secondaryKey) : action.secondary),
      } : undefined,
    };
  }

  // ── Inquiry/hold WITHOUT an offer — talent's been invited but no
  //    pricing yet. Different from the offer-driven path; this is the
  //    "say yes / no to being on the shortlist" bar. ──
  if (conv.stage === "inquiry" || conv.stage === "hold") {
    if (pov === "client") return {
      hint: tx("dashboard.adminTabs.shellAction.clientCoordOnIt", "Coordinator is on it."),
      secondary: options.onOpenClientThread
        ? { label: tx("dashboard.adminTabs.shellAction.openThread", "Open thread"), tone: "ghost", onClick: options.onOpenClientThread }
        : undefined,
    };
    if (pov === "talent") {
      const verb = conv.stage === "inquiry"
        ? tx("dashboard.adminTabs.shellAction.verbAccept", "Accept")
        : tx("dashboard.adminTabs.shellAction.verbConfirm", "Confirm");
      return {
        hint: interpolate(tx("dashboard.adminTabs.shellAction.talentInvitedHint", "Coordinator invited you. {verb}, hold, or decline?"), { verb }),
        primary: { label: verb, tone: "success", disabled: true, title: tx("dashboard.adminTabs.shellAction.requiresLiveInvite", "Requires a live inquiry invitation.") },
        secondary: { label: tx("dashboard.adminTabs.shellAction.decline", "Decline"), tone: "ghost", disabled: true, title: tx("dashboard.adminTabs.shellAction.requiresLiveInvite", "Requires a live inquiry invitation.") },
      };
    }
  }

  // Cancelled stage (no offer) — closure context
  if (conv.stage === "cancelled") {
    return { hint: tx("dashboard.adminTabs.shellAction.conversationClosed", "Conversation closed.") };
  }

  return {};
}

/**
 * A pinned coordinator-to-talent note that lives at the top of the talent
 * thread. Different visual register from generic system events: warmer
 * colour, attributed to a person, gently emphasized. Keeps the talent's
 * coordinator voice in the same surface as their conversation.
 */
export function CoordinatorNoteBubble({ who, note }: { who: string; note: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "center", padding: "4px 0 8px",
      fontFamily: FONTS.body,
    }}>
      <div style={{ maxWidth: "92%", padding: "10px 14px", borderRadius: 12, border: `1px solid rgba(95,75,139,0.18)` }} className="bg-admin-royal-soft text-admin-ink">
        <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }} className="text-admin-royal-deep">
          <span aria-hidden style={{ display: "inline-flex" }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 2h6l2 2v6H2V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M4 5h4M4 7h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </span>
          Note from {who}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }} className="text-admin-ink">
          “{note}”
        </div>
      </div>
    </div>
  );
}

export function SystemEventBubble({ body, ts }: { body: string; ts: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "center", padding: "6px 0",
      fontFamily: FONTS.body,
    }}>
      <div style={{ maxWidth: "78%", padding: "6px 12px", borderRadius: 999, background: "rgba(11,11,13,0.04)", border: `1px solid ${COLORS.borderSoft}`, fontSize: 11, textAlign: "center" }} className="text-admin-ink-muted">
        <span style={{ fontWeight: 500 }} className="text-admin-ink-dim">● </span>
        {body}
        <span style={{ marginLeft: 6 }} className="text-admin-ink-dim">· {ts}</span>
      </div>
    </div>
  );
}

/**
 * Helper: pull the chat-surface system events for a given inquiry/thread.
 * The chat tab calls this and interleaves bubbles with normal messages.
 */
export function chatSystemEventsFor(
  inquiry: InquiryRecord,
  thread: "client" | "talent" | "internal",
): { id: string; body: string; ts: string }[] {
  return inquiry.timeline
    .filter(e => e.surfaceInChat && (e.surfaceThread ?? "client") === thread)
    .map(e => ({ id: e.id, body: e.body, ts: e.ts }));
}

// ════════════════════════════════════════════════════════════════════
// DetailsPanel — single source-of-truth details view, derived from the
// canonical Inquiry record. Replaces three hand-rolled per-pov panes.
// Pov drives which sections are visible and which are read-only.
// ════════════════════════════════════════════════════════════════════

export type DetailsPov = "admin" | "client" | "talent_coord" | "talent";
