"use client";

import React, { useState, useTransition, useEffect, type CSSProperties } from "react";
import { CallSheetEditorSheet } from "@/components/admin/call-sheet-editor/CallSheetEditorSheet";
import { setInquiryPayoutReceiver, loadInquiryPayoutReceiverCandidates, loadInquiryPaymentState, requestInquiryPayment, markInquiryPaymentPending, markInquiryPaymentReceived, initiateInquiryPayout, markInquiryPaymentDisputed, markInquiryPayoutSent, markInquiryPaymentFailed, cancelInquiryTransaction, createInquiryTransactionDraft, type PayoutReceiverOption, type InquiryPaymentState } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, COLORS, FONTS, type InquiryRecord } from "../../state";
import { type Conversation } from "../../talent";
import { currentTalentId } from "../messages-shared";
import { MOCK_OFFER_FOR_CONV, nextActionFor } from "./machinery-10";
import type { OfferPov } from "./machinery-10";
import { disabledBtn, ghostBtn, primaryBtn } from "./machinery-13";
import { DetailField, DetailSection, DetailsPanel } from "./machinery-7";
import type { Offer } from "./machinery-9";


export function LogisticsTab({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  const { toast } = useAdminShell();
  const isClient = pov === "client";
  // Phase A C1 — dead-chrome sweep: each "Coming soon" button now
  // toasts instead of staring back inertly at the user.
  const comingSoon = (what: string) => {
    toast(`${what} is on the next phase — Production sheet editor lands with the calendar pipeline.`);
  };
  const futureBtnStyle: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 10,
    border: `1.5px dashed ${COLORS.border}`,
    background: "rgba(214,158,46,0.06)", color: "#7C5A14",
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
      <DetailSection title="Call sheet">
        <DetailField label="Date" value={inquiry.schedule.start} />
        {inquiry.schedule.callTime && <DetailField label="Call time" value={inquiry.schedule.callTime} />}
        {inquiry.schedule.wrapTime && <DetailField label="Wrap" value={inquiry.schedule.wrapTime} />}
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
              Edit call sheet
            </button>
          ) : (
            <button
              type="button"
              onClick={() => comingSoon("Call sheet viewer")}
              title="Coming soon"
              style={futureBtnStyle}
            >
              <span aria-hidden>✦</span>
              View call sheet
              <span style={{ fontSize: 10.5, opacity: 0.7 }}>· soon</span>
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
          onSaved={() => toast("Call sheet updated — sent to client + talent.")}
        />
      )}
      <DetailSection title="Location">
        {inquiry.location.venue && <DetailField label="Venue" value={inquiry.location.venue} />}
        {inquiry.location.address && <DetailField label="Address" value={inquiry.location.address} />}
        {inquiry.location.mapUrl && (
          <a
            href={inquiry.location.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...ghostBtn(), textDecoration: "none", display: "inline-block" }}
          >
            Open map
          </a>
        )}
      </DetailSection>
      <DetailSection title="Transport">
        <div style={{ fontSize: 12, padding: "6px 0" }} className="text-admin-ink-muted">
          Add transport, parking, or accommodation as needed.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => comingSoon("Transport editor")}
            title="Coming soon"
            style={futureBtnStyle}
          >
            <span aria-hidden>✦</span>+ Add transport
            <span style={{ fontSize: 10.5, opacity: 0.7 }}>· soon</span>
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
        else toast(`Couldn't load payout candidates: ${r.error}`);
      });
  }, [inquiryId, effectiveTenant.slug]);

  const apply = () => {
    if (!selected) { toast("Choose a payout receiver."); return; }
    startTransition(async () => {
      const r = await setInquiryPayoutReceiver(effectiveTenant.slug, inquiryId, selected);
      if (!r.ok) toast(`Set receiver failed: ${r.error}`);
      else { toast("Payout receiver set"); onChanged(); }
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
      <span style={{ fontWeight: 700 }} className="text-admin-ink">Payout receiver</span>
      {currentDisplayName && (
        <span className="text-admin-ink-muted text-admin-11">currently · {currentDisplayName}</span>
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
        <option value="">— choose —</option>
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
        {pending ? "Saving…" : currentPayoutAccountId ? "Change" : "Set"}
      </button>
      {candidates != null && candidates.length === 0 && (
        <div style={{ flexBasis: "100%", fontSize: 11 }} className="text-admin-coral-deep">
          No eligible payout accounts. Configure agency or talent payout accounts first.
        </div>
      )}
    </div>
  );
}

// Friendly labels for booking_transactions.status enum
export const TRANSACTION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  payment_requested: "Payment requested",
  pending: "Pending",
  paid: "Paid",
  payout_pending: "Payout pending",
  payout_sent: "Payout sent",
  cancelled: "Cancelled",
  failed: "Failed",
  disputed: "Disputed",
  refunded: "Refunded",
};

export function formatCents(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 })
      .format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function PaymentTab({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  const { toast, effectiveTenant } = useAdminShell();
  const isClient = pov === "client";
  const isAdmin = pov === "admin";
  const fallbackTotal = inquiry.budget?.amount ?? 0;
  const fallbackCurrency = inquiry.budget?.currency ?? "EUR";

  const [state, setState] = useState<InquiryPaymentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const reload = React.useCallback(() => {
    setLoading(true);
    loadInquiryPaymentState(effectiveTenant.slug, inquiry.id)
      .then((r) => {
        if (r.ok) setState(r.data ?? null);
        else toast(`Couldn't load payment state: ${r.error}`);
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
        toast(`${label} failed: ${(r as { error?: string }).error ?? "Unknown error"}`);
      } else {
        toast(`${label} ✓`);
        reload();
      }
    });
  };

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title={isClient ? "Invoice" : "Billing"}>
        <DetailField label="Total" value={formatCents(totalCents, currency)} />
        <DetailField
          label="Status"
          value={
            loading ? "Loading…"
              : txStatus ? TRANSACTION_STATUS_LABEL[txStatus] ?? txStatus
              : state?.bookingId ? "No transaction yet"
              : "No booking yet"
          }
        />
        {txn && (
          <>
            <DetailField label="Net amount" value={formatCents(txn.netAmountCents, txn.currency)} />
            {txn.paidAt && <DetailField label="Paid at" value={new Date(txn.paidAt).toLocaleString()} />}
            {txn.failureReason && <DetailField label="Failure reason" value={txn.failureReason} />}
          </>
        )}
        {isAdmin && txn && (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(txStatus === "draft") && (
              <button type="button" disabled={pending} onClick={() => run("Request payment", () => requestInquiryPayment(effectiveTenant.slug, inquiry.id))} style={primaryBtn(COLORS.accent)}>
                Request payment
              </button>
            )}
            {(txStatus === "payment_requested") && (
              <button type="button" disabled={pending} onClick={() => run("Mark pending", () => markInquiryPaymentPending(effectiveTenant.slug, inquiry.id))} style={ghostBtn()}>
                Mark pending
              </button>
            )}
            {(txStatus === "payment_requested" || txStatus === "pending" || txStatus === "disputed") && (
              <button type="button" disabled={pending} onClick={() => run("Mark received", () => markInquiryPaymentReceived(effectiveTenant.slug, inquiry.id))} style={primaryBtn(COLORS.success)}>
                Mark received
              </button>
            )}
            {(txStatus === "paid") && (
              <>
                <button type="button" disabled={pending} onClick={() => run("Initiate payout", () => initiateInquiryPayout(effectiveTenant.slug, inquiry.id))} style={primaryBtn(COLORS.accent)}>
                  Initiate payout
                </button>
                <button type="button" disabled={pending} onClick={() => run("Mark disputed", () => markInquiryPaymentDisputed(effectiveTenant.slug, inquiry.id))} style={ghostBtn()}>
                  Mark disputed
                </button>
              </>
            )}
            {(txStatus === "payout_pending") && (
              <button type="button" disabled={pending} onClick={() => run("Mark payout sent", () => markInquiryPayoutSent(effectiveTenant.slug, inquiry.id, null))} style={primaryBtn(COLORS.success)}>
                Mark payout sent
              </button>
            )}
            {(txStatus === "payment_requested" || txStatus === "pending" || txStatus === "payout_pending") && (
              <button type="button" disabled={pending} onClick={() => run("Mark failed", () => markInquiryPaymentFailed(effectiveTenant.slug, inquiry.id, "manual_marked_failed"))} style={ghostBtn()}>
                Mark failed
              </button>
            )}
            {(txStatus === "draft" || txStatus === "payment_requested" || txStatus === "failed") && (
              <button type="button" disabled={pending} onClick={() => run("Cancel transaction", () => cancelInquiryTransaction(effectiveTenant.slug, inquiry.id))} style={ghostBtn()}>
                Cancel
              </button>
            )}
          </div>
        )}
        {isAdmin && !txn && state?.bookingId && (
          <div className="mt-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => run("Create transaction draft", () => createInquiryTransactionDraft(effectiveTenant.slug, inquiry.id))}
              style={primaryBtn(COLORS.accent)}
            >
              {pending ? "Creating…" : "Create transaction draft"}
            </button>
            <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-muted">
              Drafts the booking transaction with platform fee from the workspace plan.
            </div>
          </div>
        )}
      </DetailSection>
      {!isClient && (
        <DetailSection title="Payouts">
          <div style={{ fontSize: 12, padding: "6px 0" }} className="text-admin-ink-muted">
            {txStatus === "payout_sent"
              ? `Payout sent ${txn?.payoutCompletedAt ? `at ${new Date(txn.payoutCompletedAt).toLocaleString()}` : ""}`
              : txStatus === "payout_pending"
              ? `Payout pending ${txn?.payoutInitiatedAt ? `since ${new Date(txn.payoutInitiatedAt).toLocaleString()}` : ""}`
              : txStatus === "paid"
              ? "Funds received — pick a payout receiver below, then initiate the payout."
              : "Released to talent once invoice clears."}
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
          aria-label={`Show next action: ${primary.label}`}
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
        title="Dismiss this nudge"
        aria-label="Dismiss next-action nudge"
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
): { primary?: ShellAction; secondary?: ShellAction; hint?: string } {
  const offer = MOCK_OFFER_FOR_CONV[conv.id];
  // Slice E (Messages consolidation v2): verb table from plan §9.
  // Booked stage — role-shaped action verbs. Call sheet editor is
  // shipped (B2), so the copy points users at it concretely.
  if (conv.stage === "booked") {
    if (pov === "client")
      return {
        hint: "Booked. Open the event plan + your payment status.",
        primary: { label: "Open event", tone: "success", onClick: options.onOpenOffer ?? (() => {}) },
      };
    if (pov === "talent" || pov === "talent_coord")
      return {
        hint: "You're booked. Open the call sheet for prep + arrival.",
        primary: { label: "Open event", tone: "success", onClick: options.onOpenOffer ?? (() => {}) },
      };
    // admin
    return {
      hint: "Booked. Open the event details + call sheet.",
      primary: { label: "Open event", tone: "success", onClick: options.onOpenOffer ?? (() => {}) },
    };
  }

  // Past (wrapped) stage — payouts + receipts.
  if (conv.stage === "past") {
    if (pov === "client") return { hint: "Wrapped. Receipt + invoice available in Files." };
    if (pov === "talent" || pov === "talent_coord") return { hint: "Wrapped. Payment cleared — receipt in Files." };
    return { hint: "Wrapped. Mark payouts ready when settled." };
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
    const needsOfferTab = !!(action.cta || action.secondary);
    const offerHint = needsOfferTab
      ? `${action.label} Open the Offer tab to continue.`
      : action.label;
    return {
      hint: offerHint,
      primary: needsOfferTab && options.onOpenOffer ? {
        label: "Open offer",
        tone: action.ctaTone === "success" ? "success" : "primary",
        onClick: options.onOpenOffer,
        title: action.cta ?? action.secondary,
      } : undefined,
    };
  }

  // ── Inquiry/hold WITHOUT an offer — talent's been invited but no
  //    pricing yet. Different from the offer-driven path; this is the
  //    "say yes / no to being on the shortlist" bar. ──
  if (conv.stage === "inquiry" || conv.stage === "hold") {
    if (pov === "client") return {
      hint: "Coordinator is on it.",
      secondary: options.onOpenClientThread
        ? { label: "Open thread", tone: "ghost", onClick: options.onOpenClientThread }
        : undefined,
    };
    if (pov === "talent") {
      const verb = conv.stage === "inquiry" ? "Accept" : "Confirm";
      return {
        hint: `Coordinator invited you. ${verb}, hold, or decline?`,
        primary: { label: verb, tone: "success", disabled: true, title: "Requires a live inquiry invitation." },
        secondary: { label: "Decline", tone: "ghost", disabled: true, title: "Requires a live inquiry invitation." },
      };
    }
  }

  // Cancelled stage (no offer) — closure context
  if (conv.stage === "cancelled") {
    return { hint: "Conversation closed." };
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
