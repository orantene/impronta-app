"use client";

import { useTransition, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate, type Translator } from "@/i18n/interpolate";
import { PayoutNudgeCard } from "@/components/talent-payouts/PayoutNudgeCard";
import { loadCurrentTalentPayoutSnapshot, loadMyInquiryTakeHome, type TalentPayoutSnapshot } from "@/lib/server-actions/talent-self";
import { type TalentTakeHome } from "@/lib/talent/inquiry-take-home";
import { submitMyCounterRate, submitMyRateForInquiry } from "@/lib/server-actions/talent-pipeline";
import { clientApproveCurrentOffer, clientRejectCurrentOffer } from "@/lib/server-actions/client-pipeline";
import { sendOfferAction, counterOfferAction, loadBookingCommissionSnapshotAction, loadInquiryPaymentState, reopenOfferAction, loadOfferDraft } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { loadCoordinatorInquiryOffer } from "@/app/(workspace)/[tenantSlug]/talent/inbox/[id]/coordinator-offer-loader";
import type { PersistedBookingCommissionSnapshot } from "@/lib/billing/commission";
import { useAdminShell, COLORS, FONTS } from "../../state";
import { type Conversation } from "../../talent";
import { applyRowOverrides, setRowOverride, useRowOverrideSubscription } from "../conversation-stash";
import { STAGE_LABEL, STAGE_LABEL_KEYS, fmtMoney, getOffer, nextActionFor, rowSubtotal } from "./machinery-10";
import type { OfferPov } from "./machinery-10";
import { CreateOfferButton, OfferDraftEditor } from "./machinery-11";
import { OfferTermsSummary } from "./offer-terms-ui";
import { type OfferCommercialTerms } from "@/lib/billing/commercial-terms-types";
import { DealSummaryCard, LineupRowCard, ParticipantRow, TimelineRow, dashedBtn, disabledBtn, ghostBtn, primaryBtn } from "./machinery-13";
import { SubmitRateSheet } from "./machinery-14";
import type { Offer } from "./machinery-9";

/** Human label + tone for an inquiry_offers status. The `status` value stays
 *  the raw English discriminant (it drives control flow elsewhere); only the
 *  displayed label resolves through `t`. */
function offerStatusInfo(status: string, t: Translator): { label: string; bg: string; tone: string } {
  const tx = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };
  switch (status) {
    case "draft":
      return { label: tx("dashboard.adminTabs.offer.statusDraft", "Draft"), bg: COLORS.amberSoft, tone: COLORS.amberDeep };
    case "sent":
      return { label: tx("dashboard.adminTabs.offer.statusSent", "Sent · awaiting approval"), bg: "rgba(29,78,216,0.10)", tone: "#1D4ED8" };
    case "accepted":
      return { label: tx("dashboard.adminTabs.offer.statusAccepted", "Accepted"), bg: "rgba(15,81,50,0.10)", tone: "#0F5132" };
    case "rejected":
      return { label: tx("dashboard.adminTabs.offer.statusDeclined", "Declined"), bg: "rgba(153,27,27,0.08)", tone: "#991B1B" };
    case "superseded":
      return { label: tx("dashboard.adminTabs.offer.statusSuperseded", "Superseded"), bg: COLORS.amberSoft, tone: COLORS.amberDeep };
    default:
      return { label: status, bg: COLORS.borderSoft, tone: COLORS.inkMuted };
  }
}

/**
 * The real, DB-backed offer view for the inquiry. Renders the actual deal —
 * line items, total, status — plus (admin only) the booking commission
 * breakdown sourced from `booking_commission_snapshot`, and the engine-wired
 * Send / Counter actions + the inline draft editor.
 *
 * Replaces the old developer-scaffolding banner ("Live · DB-backed", raw
 * offer UUID, "engine above"). Shows nothing for synthetic mock-only convs.
 */
export function LiveOfferPanel({
  inquiryId, pov, injectedOffer, injectedBookingId,
}: {
  inquiryId: string;
  pov: OfferPov;
  /** WS4 — talent shell has no live inquiry list (effectiveMessagesInquiries
   *  is mock RICH_INQUIRIES), so a talent_coord hydrates the real DB offer via
   *  loadCoordinatorInquiryOffer and injects it here. Admin keeps reading the
   *  in-memory list. */
  injectedOffer?: NonNullable<ReturnType<typeof useAdminShell>["effectiveMessagesInquiries"][number]["offer"]> | null;
  injectedBookingId?: string | null;
}) {
  const { toast, effectiveMessagesInquiries, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const real = effectiveMessagesInquiries.find((r) => r.id === inquiryId);
  const offer = injectedOffer ?? real?.offer ?? null;
  const offerId = offer?.id;
  // WS4 — coordinator UI parity: admin OR the appointed inquiry coordinator.
  const isAdmin = pov.kind === "admin";
  const canManage = isAdmin || (pov.kind === "talent" && pov.isCoordinator);
  const directBookingId = injectedBookingId ?? real?.bookingId ?? null;

  // The admin shell's in-memory inquiry stub doesn't carry bookingId (it's set
  // null in state/context). Resolve it from the inquiry's payment state so the
  // commission snapshot can load for booked inquiries — without this the
  // admin-only commission breakdown never renders.
  const [resolvedBookingId, setResolvedBookingId] = useState<string | null>(null);
  useEffect(() => {
    if (!canManage || directBookingId) { setResolvedBookingId(null); return; }
    let cancelled = false;
    loadInquiryPaymentState(effectiveTenant.slug, inquiryId).then((r) => {
      if (cancelled) return;
      setResolvedBookingId(r.ok ? (r.data?.bookingId ?? null) : null);
    });
    return () => { cancelled = true; };
  }, [canManage, directBookingId, inquiryId, effectiveTenant.slug]);
  const bookingId = directBookingId ?? resolvedBookingId;

  // Admin-only: load the per-participant commission snapshot for the booking
  // (if one exists). One booking → N rows; we aggregate the lanes for the
  // deal-level breakdown. Never shown to client/talent.
  const [snapshots, setSnapshots] = useState<PersistedBookingCommissionSnapshot[] | null>(null);
  useEffect(() => {
    if (!canManage || !bookingId) { setSnapshots(null); return; }
    let cancelled = false;
    loadBookingCommissionSnapshotAction(effectiveTenant.slug, bookingId).then((r) => {
      if (cancelled) return;
      setSnapshots(r.ok ? (r.data ?? []) : []);
    });
    return () => { cancelled = true; };
  }, [canManage, bookingId, effectiveTenant.slug]);

  // W6a — negotiated booking terms for the read-only summary. The offer loader
  // (data-bridge) populates offer.commercialTerms once the new columns are
  // selected. For ADMIN we additionally fall back to loadOfferDraft (which
  // returns the saved/defaulted terms + total + currency) so the summary still
  // renders before the data-bridge is wired. Client/talent rely on
  // offer.commercialTerms (the staff loadOfferDraft would 403 for them).
  const [adminTerms, setAdminTerms] = useState<{
    terms: OfferCommercialTerms;
    totalUnits: number;
    currencyCode: string;
  } | null>(null);
  useEffect(() => {
    if (!canManage || !offerId || offerId.endsWith("-offer")) { setAdminTerms(null); return; }
    let cancelled = false;
    loadOfferDraft(effectiveTenant.slug, offerId).then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        setAdminTerms({
          terms: r.data.terms,
          totalUnits: r.data.totalClientPrice,
          currencyCode: r.data.currencyCode,
        });
      } else {
        setAdminTerms(null);
      }
    });
    return () => { cancelled = true; };
  }, [canManage, offerId, effectiveTenant.slug]);

  // Render nothing for synthetic mock-only inquiries — keeps demo data clean.
  if (!offer || !offerId || offerId.endsWith("-offer")) return null;

  const status = offer.status;
  const statusInfo = offerStatusInfo(status, t);

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast(interpolate(t("dashboard.adminTabs.offer.actionFailed"), { label, error: r.error ?? t("dashboard.adminTabs.offer.unknownError") }));
      } else {
        toast(interpolate(t("dashboard.adminTabs.offer.actionOk"), { label }));
        router.refresh();
      }
    });

  // Aggregate commission lanes across participant rows. Currency comes from
  // the snapshot itself — never hardcoded.
  const hasSnapshot = canManage && !!snapshots && snapshots.length > 0;
  const agg = hasSnapshot
    ? snapshots!.reduce(
        (a, s) => ({
          gross: a.gross + s.gross_cents,
          grossCharged: a.grossCharged + (s.gross_charged_cents ?? s.gross_cents),
          platformFee: a.platformFee + s.platform_fee_cents,
          workspaceFee: a.workspaceFee + s.workspace_fee_cents,
          talentNet: a.talentNet + s.talent_net_cents,
        }),
        { gross: 0, grossCharged: 0, platformFee: 0, workspaceFee: 0, talentNet: 0 },
      )
    : null;
  const snapCurrency = hasSnapshot ? (snapshots![0].currency_code || "USD") : "USD";

  // Resolve the terms to display. Prefer the loader-populated offer.commercialTerms
  // (works for every role); for admin fall back to the loadOfferDraft copy.
  const displayTerms: OfferCommercialTerms | null =
    offer.commercialTerms ?? adminTerms?.terms ?? null;
  const termsTotalUnits =
    (offer.totalCents != null ? offer.totalCents / 100 : undefined) ??
    adminTerms?.totalUnits ?? 0;
  const termsCurrency = offer.currencyCode ?? adminTerms?.currencyCode ?? snapCurrency;
  // The read-only summary is for the non-editing states. In draft, admins edit
  // the terms via the composer below (OfferDraftEditor), so we don't duplicate
  // the summary there.
  const showTermsSummary = !!displayTerms && status !== "draft";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: FONTS.body,
        boxShadow: "0 2px 8px rgba(11,11,13,0.06)",
      }}
    >
      {/* Header — status pill + total. The pill leads so the viewer
          instantly knows the offer state before reading the amount. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                padding: "3px 9px",
                borderRadius: 999,
                background: statusInfo.bg,
                color: statusInfo.tone,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {statusInfo.label}
            </span>
            {offer.sentAt && (
              <span className="text-admin-ink-muted" style={{ fontSize: 11 }}>{interpolate(t("dashboard.adminTabs.offer.sentAt"), { date: offer.sentAt })}</span>
            )}
          </div>
          {offer.total && (
            <div style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1 }} className="text-admin-ink">
              {offer.total}
            </div>
          )}
          {!offer.total && (
            <div style={{ fontSize: 13 }} className="text-admin-ink-muted">{t("dashboard.adminTabs.offer.noTotalSet")}</div>
          )}
        </div>
      </div>

      {/* Line items */}
      {offer.lineItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }} className="text-admin-ink-muted">
            {t("dashboard.adminTabs.offer.lineItems")}
          </div>
          <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
          {offer.lineItems.map((ln, i) => (
            <div
              key={`${ln.talentName}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                background: i % 2 === 1 ? "rgba(11,11,13,0.015)" : "#fff",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }} className="text-admin-ink">{ln.talentName}</div>
                {ln.role && <div className="text-admin-ink-muted" style={{ fontSize: 11 }}>{ln.role}</div>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} className="text-admin-ink">
                {ln.fee}
              </div>
            </div>
          ))}
          {offer.total && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                borderTop: `2px solid ${COLORS.borderSoft}`,
                background: "rgba(11,11,13,0.025)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }} className="text-admin-ink">{t("dashboard.adminTabs.offer.total")}</span>
              <span style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
                {offer.total}
              </span>
            </div>
          )}
          </div>
        </div>
      )}

      {/* W6a — read-only booking terms summary (client + talent + admin once
          sent). Deposit / balance method / refund policy negotiated on the
          offer. The "approving = agreeing" line shows only while the viewer can
          still act on a sent offer. Display only — nothing charges the deposit. */}
      {showTermsSummary && displayTerms && (
        <OfferTermsSummary
          terms={displayTerms}
          totalUnits={termsTotalUnits}
          currencyCode={termsCurrency}
          showApprovalLine={!isAdmin && status === "sent"}
        />
      )}

      {/* Commission breakdown (gross → talent net → platform fee → workspace
          margin). Admin + the appointed inquiry coordinator see all legs. */}
      {canManage && hasSnapshot && agg && (
        <div style={{ padding: "12px 14px", borderRadius: 10, display: "flex", flexDirection: "column", gap: 7, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }} className="text-admin-ink-muted">
            {t("dashboard.adminTabs.offer.commissionBreakdown")}
          </div>
          <CommissionRow label={t("dashboard.adminTabs.offer.clientPaysGross")} value={fmtMoney(agg.grossCharged / 100, snapCurrency)} strong />
          <CommissionRow label={t("dashboard.adminTabs.offer.platformFee")} value={`− ${fmtMoney(agg.platformFee / 100, snapCurrency)}`} />
          <CommissionRow label={t("dashboard.adminTabs.offer.talentNet")} value={fmtMoney(agg.talentNet / 100, snapCurrency)} />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "2px 0" }} />
          <CommissionRow label={t("dashboard.adminTabs.offer.yourMargin")} value={fmtMoney(agg.workspaceFee / 100, snapCurrency)} strong />
        </div>
      )}
      {canManage && bookingId && snapshots !== null && !hasSnapshot && (
        <div className="text-admin-ink-muted text-admin-11" style={{ lineHeight: 1.5 }}>
          {t("dashboard.adminTabs.offer.commissionPending")}
        </div>
      )}

      {/* Engine-wired actions — admin OR the appointed inquiry coordinator.
          sendOfferAction / reopenOfferAction / counterOfferAction are
          coordinator-authorized (WS3) and run under the coordinator session. */}
      {(canManage && (status === "draft" || status === "sent" || status === "rejected")) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {status === "draft" && (
            <button type="button" disabled={pending}
              onClick={() => run(t("dashboard.adminTabs.offer.sendOffer"), () => sendOfferAction(effectiveTenant.slug, inquiryId, offerId))}
              style={primaryBtn(COLORS.accent)}
            >{t("dashboard.adminTabs.offer.sendToClient")}</button>
          )}
          {/* A2 — Amend & re-send: when the offer is SENT but the admin needs
              to adjust terms (price error, changed scope, client feedback),
              this button calls reopenOfferAction which flips the offer back to
              draft and clears existing approvals. The OfferDraftEditor below
              then unlocks, and the coordinator edits + re-sends — reseeding
              approval requests to all parties. This flow replaces the previous
              "sent = locked with no edit path" dead-end. */}
          {status === "sent" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="text-admin-ink-muted text-admin-11">{t("dashboard.adminTabs.offer.awaitingApproval")}</span>
              <button
                type="button"
                disabled={pending}
                title={t("dashboard.adminTabs.offer.amendTitle")}
                onClick={() => run(t("dashboard.adminTabs.offer.amendOffer"), () => reopenOfferAction(effectiveTenant.slug, inquiryId, offerId))}
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent", color: COLORS.ink, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                  opacity: pending ? 0.5 : 1,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M8 2l2 2-6 6H2v-2l6-6zM7 3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t("dashboard.adminTabs.offer.amendResend")}
              </button>
            </div>
          )}
          {status === "rejected" && (
            <button type="button" disabled={pending}
              onClick={() => run(t("dashboard.adminTabs.offer.counterOffer"), () => counterOfferAction(effectiveTenant.slug, inquiryId, offerId))}
              style={primaryBtn(COLORS.accent)}
            >{t("dashboard.adminTabs.offer.counterOffer")}</button>
          )}
        </div>
      )}

      {/* Inline draft editor — only when the offer is editable. */}
      {status === "draft" && (
        <div style={{ marginTop: 4 }}>
          <OfferDraftEditor inquiryId={inquiryId} offerId={offerId} canEdit={canManage} />
        </div>
      )}
    </div>
  );
}

/** Small labeled money row for the commission breakdown. */
function CommissionRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span className="text-admin-ink-muted" style={{ fontSize: 12.5 }}>{label}</span>
      <span
        style={{ fontSize: 12.5, fontWeight: strong ? 700 : 600, fontVariantNumeric: "tabular-nums" }}
        className="text-admin-ink"
      >
        {value}
      </span>
    </div>
  );
}

export function OfferTab({ conv, pov }: { conv: Conversation; pov: OfferPov }) {
  const { toast, effectiveMessagesInquiries, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const t = useT();
  // B7 — talent counter-rate handler. Sends a tagged [Counter request]
  // message via the engine. Coordinator-side picks it up from the
  // conversation thread and re-drafts the offer.
  const [, startCounterTransition] = useTransition();
  const realInquiryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id) ? conv.id : null;
  const onCounterRateForOwnRow = (pov.kind === "talent" && realInquiryId) ? () => {
    const raw = window.prompt("Proposed counter rate (what you'd want instead):");
    if (raw == null) return;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(num) || num < 0) { toast("Invalid rate"); return; }
    const note = window.prompt("Optional note for the coordinator:") ?? "";
    startCounterTransition(async () => {
      const r = await submitMyCounterRate(realInquiryId, num, note.trim() || null);
      if (!r.ok) toast(`Counter failed: ${r.error}`);
      else { toast("Counter sent to coordinator"); router.refresh(); }
    });
  } : undefined;
  // Item #7 wiring: live talent payout snapshot drives PayoutNudgeCard
  // visibility. Loads on mount for talent / talent-coord povs; admin /
  // client viewers don't need it. Snapshot.hasProfile=false hides the
  // nudge entirely (the viewer isn't a talent).
  const [talentPayout, setTalentPayout] = useState<TalentPayoutSnapshot | null>(null);
  useEffect(() => {
    if (pov.kind !== "talent") return;
    let cancelled = false;
    loadCurrentTalentPayoutSnapshot().then((s) => {
      if (!cancelled) setTalentPayout(s);
    });
    return () => { cancelled = true; };
  }, [pov.kind]);
  // Audit #7 tail: load THIS talent's own take-home on the inquiry's current
  // offer so the Offer tab can show their actual cut inline.
  const [takeHome, setTakeHome] = useState<TalentTakeHome>(null);
  useEffect(() => {
    if (pov.kind !== "talent") return;
    let cancelled = false;
    loadMyInquiryTakeHome(conv.id).then((t) => {
      if (!cancelled) setTakeHome(t);
    });
    return () => { cancelled = true; };
  }, [pov.kind, conv.id]);
  const [, startClientOfferTransition] = useTransition();
  const baseOffer = getOffer(conv.id);
  const liveInquiry = effectiveMessagesInquiries.find((r) => r.id === conv.id);
  const liveOffer = liveInquiry?.offer ?? null;
  const isClient = pov.kind === "client";
  const isAdmin = pov.kind === "admin";
  const isTalent = pov.kind === "talent";
  const canSeeFullCommerce = isAdmin || (isTalent && pov.isCoordinator);
  // WS4 — the talent shell has no live inquiry list, so a talent COORDINATOR
  // hydrates the real DB offer + bookingId for THIS inquiry and injects them
  // into LiveOfferPanel. Admin keeps reading effectiveMessagesInquiries.
  const [coordOffer, setCoordOffer] = useState<typeof liveOffer>(null);
  const [coordBookingId, setCoordBookingId] = useState<string | null>(null);
  const isCoordPov = pov.kind === "talent" && pov.isCoordinator;
  useEffect(() => {
    if (!isCoordPov || !realInquiryId) { setCoordOffer(null); setCoordBookingId(null); return; }
    let cancelled = false;
    loadCoordinatorInquiryOffer(realInquiryId).then((r) => {
      if (cancelled) return;
      if (r.ok) { setCoordOffer(r.offer); setCoordBookingId(r.bookingId); }
      else { setCoordOffer(null); setCoordBookingId(null); }
    });
    return () => { cancelled = true; };
  }, [isCoordPov, realInquiryId]);
  // Submit-rate sheet state — opens from any of:
  //   • the empty-state CTA (no offer at all yet)
  //   • the sticky-bar "Submit my rate" CTA when stage = awaiting_talent
  //   • the per-row "Submit my rate" / "Edit rate" button on the talent's lineup card
  const [rateSheetOpen, setRateSheetOpen] = useState(false);
  const [rateSheetMode, setRateSheetMode] = useState<"submit" | "edit">("submit");
  // Subscribe to module-level row-override changes so this tab
  // re-renders when the talent submits a rate from anywhere else
  // (and so the offer tab itself reflects new overrides immediately).
  useRowOverrideSubscription();
  // Effective offer = seed offer with module-level row-overrides
  // merged on top. After a talent submits their rate, their row reads
  // as submitted with the entered numbers — and that survives tab
  // switches, conv switches (until cleared), refresh kills it.
  const offer = baseOffer ? applyRowOverrides(conv.id, baseOffer) : undefined;

  if (!offer) {
    // WS4 — a talent COORDINATOR with no seed offer manages like admin: skip
    // the rate stub and fall through to the shared admin-style render below
    // (LiveOfferPanel + create CTA), which hydrates the real DB offer via
    // injectedOffer in the talent shell. Plain talents still get the stub.
    if (isTalent && !pov.isCoordinator) {
      // Audit #7 tail: derive the talent's offer state from data the TALENT
      // actually has — conv.stage / conv.myApprovalStatus. `liveOffer` reads the
      // admin `effectiveMessagesInquiries` list, which is EMPTY in the talent
      // shell, so the old `hasSentOffer` was always false and the talent saw the
      // dead "Submit your rate" stub even with a live offer (and post-booking).
      // Show their REAL take-home (loadMyInquiryTakeHome) inline so they can see
      // their cut on the offer they're approving — the Money dashboard only
      // renders EUR today, so this is the talent's only window into their number.
      const isBooked = conv.stage === "booked";
      const isApproved = conv.myApprovalStatus === "accepted";
      const hasOffer =
        isBooked || isApproved || conv.stage === "hold" ||
        !!(liveOffer && liveOffer.status === "sent");
      const heading = isBooked
        ? "You're booked"
        : isApproved
        ? "You approved this offer"
        : hasOffer
        ? "You've received an offer"
        : "Submit your rate";
      const blurb = isBooked
        ? "This job is booked and confirmed. Your take-home below is on its way to your connected payout account."
        : isApproved
        ? "You've approved this offer. We're just waiting on the other parties before it converts to a booking."
        : hasOffer
        ? "The coordinator has sent you an offer for this job. Review your take-home below, then use Approve or Decline in the action bar."
        : "The coordinator is waiting on your number. You'll see the agency fee + platform fee deducted before take-home, so quote what you actually need to walk out with, plus a small margin for usage.";
      return (
        <div style={{ padding: 18, fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 12 }}>
          {talentPayout && talentPayout.hasProfile && (
            <PayoutNudgeCard
              tenantSlug={effectiveTenant?.slug ?? "impronta"}
              status={talentPayout.status}
              pendingPayouts={talentPayout.pendingPayouts}
            />
          )}
          <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, padding: 16, display: "flex", flexDirection: "column", gap: 10 }} className="rounded-admin-md">
            <div className="text-admin-ink text-admin-13h font-bold">{heading}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">{blurb}</div>
            {/* Take-home line — show on every offer state EXCEPT booked, where
                it's folded into the dedicated payout line below so the figure
                always sits next to the payout status. */}
            {takeHome && hasOffer && !isBooked && (
              <div className="text-admin-ink-muted text-admin-13h">
                Your take-home:{" "}
                <strong className="text-admin-ink">{fmtMoney(takeHome.takeHomeCents / 100, takeHome.currency)}</strong>{" "}
                <span className="text-admin-11">(after the agency + platform fee)</span>
              </div>
            )}
            {isBooked ? (
              <div className="text-admin-ink-muted text-admin-13h">
                Your take-home:{" "}
                {takeHome ? (
                  <strong className="text-admin-ink">{fmtMoney(takeHome.takeHomeCents / 100, takeHome.currency)}</strong>
                ) : (
                  <strong className="text-admin-ink">{talentPayout ? "—" : "loading…"}</strong>
                )}{" "}
                <span className="text-admin-11">· {talentPayoutLabel(talentPayout)}</span>
              </div>
            ) : isApproved ? (
              <div className="text-admin-ink-muted text-admin-11">
                Status <strong className="text-admin-ink">awaiting the other parties</strong>
              </div>
            ) : hasOffer ? (
              <div className="text-admin-ink-muted text-admin-11">
                Status <strong className="text-admin-ink">awaiting your approval</strong>
              </div>
            ) : (
              <div className="text-admin-ink-muted text-admin-11">
                No offer yet. Your coordinator will send one when it&apos;s ready.
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding: 18, fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* WS4 — admin reads liveOffer (in-memory); the talent COORDINATOR has
            no live list, so coordOffer (loadCoordinatorInquiryOffer) drives the
            panel. Either present → render LiveOfferPanel, else the create CTA. */}
        {(liveOffer || coordOffer) ? (
          <LiveOfferPanel inquiryId={conv.id} pov={pov} injectedOffer={coordOffer} injectedBookingId={coordBookingId} />
        ) : (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13 }} className="text-admin-ink-dim">
            {t("dashboard.adminTabs.offer.noOfferYet")}
            {(isAdmin || (isTalent && pov.isCoordinator)) && <CreateOfferButton inquiryId={conv.id} />}
          </div>
        )}
      </div>
    );
  }

  // Privacy: non-coordinator talent sees ONLY their own row.
  const visibleRows = isTalent && !pov.isCoordinator
    ? offer.rows.filter(r => r.talentId === pov.talentId)
    : offer.rows;

  const totalCost = offer.rows.reduce((s, r) => s + rowSubtotal(r, "cost"), 0);
  const totalRevenue = offer.rows.reduce((s, r) => s + rowSubtotal(r, "client"), 0) + offer.agencyFee;
  const totalMargin = totalRevenue - totalCost;
  const stage = STAGE_LABEL[offer.stage];
  const stageKeys = STAGE_LABEL_KEYS[offer.stage];
  // Render the localized stage label via this consumer's own translator.
  // Switching still keys off the raw `offer.stage` union above.
  const stageLabel = isClient && stageKeys.clientLabelKey
    ? t(stageKeys.clientLabelKey)
    : t(stageKeys.labelKey);
  const next = nextActionFor(offer, pov);
  // Localized strings from the stable keys the resolver returned. The raw
  // `next.cta` / `next.secondary` union values are kept ONLY for the logic
  // switches below; the button text renders these localized versions.
  const nextLabel = interpolate(t(next.labelKey), next.labelParams ?? {});
  const nextCtaLabel = next.ctaKey ? t(next.ctaKey) : next.cta;
  const nextSecondaryLabel = next.secondaryKey ? t(next.secondaryKey) : next.secondary;
  const currency = offer.clientBudget?.currency ?? "USD";
  const isRealUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
  const canRunStickyPrimary = !!next.cta && (
    (isTalent && (next.cta === "Submit my rate" || next.cta === "Review counter"))
    || (isClient && isRealUuid && (next.cta === "Approve" || next.cta === "Reject" || next.cta === "Decline"))
  );
  const stickyPrimaryTitle = canRunStickyPrimary
    ? undefined
    : nextCtaLabel
      ? interpolate(t("dashboard.adminTabs.offer.needsLiveWorkflow"), { label: nextCtaLabel })
      : undefined;

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <LiveOfferPanel inquiryId={conv.id} pov={pov} injectedOffer={coordOffer} injectedBookingId={coordBookingId} />
      {/* ── Sticky action bar — "what do I do now" ──────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 4,
        margin: "-14px -14px 0", padding: "10px 14px",
        background: "#fff", borderBottom: `1px solid ${COLORS.borderSoft}`,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700,           padding: "3px 9px", borderRadius: 999, background: stage.bg, color: stage.tone, flexShrink: 0,
        }}>{stageLabel}</span>
        {offer.expiresInHours !== undefined && offer.stage !== "accepted" && offer.stage !== "rejected" && offer.stage !== "expired" && (
          <span className="text-admin-coral text-admin-11 font-semibold">
            ⏱ {offer.expiresInHours}h
          </span>
        )}
        <span style={{ fontSize: 12, color: next.subtle ? COLORS.inkMuted : COLORS.ink, flex: 1, minWidth: 140 }}>
          {nextLabel}
        </span>
        {next.secondary && (
          <button
            type="button"
            disabled
            title={interpolate(t("dashboard.adminTabs.offer.needsLiveWorkflow"), { label: nextSecondaryLabel ?? "" })}
            style={disabledBtn(ghostBtn())}
          >
            {nextSecondaryLabel}
          </button>
        )}
        {next.cta && (
          <button
            type="button"
            disabled={!canRunStickyPrimary}
            title={stickyPrimaryTitle}
            onClick={() => {
              // Talent rate-related CTAs open the real sheet instead
              // of toasting. Unsupported CTAs are disabled in the UI.
              if (isTalent && (next.cta === "Submit my rate" || next.cta === "Review counter")) {
                setRateSheetMode(next.cta === "Review counter" ? "edit" : "submit");
                setRateSheetOpen(true);
                return;
              }
              // Client-side: route Approve / Reject / Decline through the
              // engine for real-UUID inquiries. Mock conv ids are disabled.
              if (isClient && isRealUuid && next.cta === "Approve") {
                startClientOfferTransition(async () => {
                  const r = await clientApproveCurrentOffer(conv.id);
                  if (!r.ok) toast(`Approve failed: ${r.error}`);
                  else { toast("Offer approved"); router.refresh(); }
                });
                return;
              }
              if (isClient && isRealUuid && (next.cta === "Reject" || next.cta === "Decline")) {
                startClientOfferTransition(async () => {
                  const r = await clientRejectCurrentOffer(conv.id);
                  if (!r.ok) toast(`Reject failed: ${r.error}`);
                  else { toast("Offer declined"); router.refresh(); }
                });
                return;
              }
            }}
            style={canRunStickyPrimary
              ? primaryBtn(next.ctaTone === "success" ? COLORS.success : COLORS.accent)
              : disabledBtn(primaryBtn(next.ctaTone === "success" ? COLORS.success : COLORS.accent))}
          >
            {nextCtaLabel}
          </button>
        )}
      </div>

      {/* ── A. Deal summary — single hero card per POV ───────────
            Was three disconnected tiles ("Client budget · Offer total ·
            Your take-home") with no clear narrative. Replaced with one
            hero card that leads with the number that matters most for
            the viewer (take-home for talent, total for admin/client),
            then a labeled-row context strip beneath that fills in the
            other numbers. Single card, single story per role. */}
      <DealSummaryCard
        offer={offer}
        pov={pov}
        totalCost={totalCost}
        totalRevenue={totalRevenue}
        totalMargin={totalMargin}
        currency={currency}
      />

      {/* ── B. Participants ──────────────────────────────────── */}
      <SectionHeader title={t("dashboard.adminTabs.offer.whosRunning")} subtitle={isClient ? t("dashboard.adminTabs.offer.yourContact") : interpolate(t("dashboard.adminTabs.offer.coordTalentCount"), { coordinators: offer.coordinators.length, talent: offer.rows.length })} />
      <div className="flex flex-col gap-2">
        {offer.coordinators.map(c => (
          <ParticipantRow
            key={c.id}
            initials={c.initials}
            name={c.name}
            role={t("dashboard.adminTabs.offer.coordinatorRole")}
            tone="royal"
            note={c.alsoTalentId ? t("dashboard.adminTabs.offer.alsoBookedTalent") : undefined}
          />
        ))}
        {isAdmin && offer.coordinators.length < 2 && (
          <button
            type="button"
            disabled
            title={t("dashboard.adminTabs.offer.addCoordDisabled")}
            style={disabledBtn(dashedBtn("add-coordinator"))}
          >
            {t("dashboard.adminTabs.offer.addCoordinator")}
          </button>
        )}
      </div>

      {/* ── C. Lineup & rates — privacy-aware ─────────────────── */}
      <SectionHeader
        title={t("dashboard.adminTabs.offer.lineupRates")}
        subtitle={
          isClient
            ? t("dashboard.adminTabs.offer.lineupSubClient")
            : isTalent && !pov.isCoordinator
              ? t("dashboard.adminTabs.offer.lineupSubTalent")
              : t("dashboard.adminTabs.offer.lineupSubAdmin")
        }
      />
      <div className="flex flex-col gap-2.5">
        {visibleRows.map(r => (
          <LineupRowCard
            key={r.id} row={r} offer={offer} pov={pov}
            showCost={canSeeFullCommerce}
            showRevenue={canSeeFullCommerce || isClient}
            showMargin={isAdmin}
            onOpenRateSheet={(mode) => {
              setRateSheetMode(mode);
              setRateSheetOpen(true);
            }}
            onCounterRate={
              pov.kind === "talent" && pov.talentId === r.talentId
                ? onCounterRateForOwnRow
                : undefined
            }
          />
        ))}
        {isAdmin && (
          <button
            type="button"
            disabled
            title={t("dashboard.adminTabs.offer.inviteTalentDisabled")}
            style={disabledBtn(dashedBtn("invite-talent"))}
          >
            {t("dashboard.adminTabs.offer.inviteTalent")}
          </button>
        )}
      </div>

      {/* ── Agency fee — admin/coordinator only ──────────────── */}
      {canSeeFullCommerce && (
        <div style={{ padding: "12px 14px", borderRadius: 10, fontSize: 12.5 }} className="bg-admin-surface-alt">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="text-admin-ink-muted">{t("dashboard.adminTabs.offer.agencyFee")}</span>
            <span style={{ fontWeight: 600 }} className="text-admin-ink">{fmtMoney(offer.agencyFee, currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="text-admin-ink-muted">{interpolate(t("dashboard.adminTabs.offer.coordinatorShare"), { pct: offer.coordinatorPct })}</span>
            <span style={{ fontWeight: 600 }} className="text-admin-ink">{fmtMoney(offer.agencyFee * offer.coordinatorPct / 100, currency)}</span>
          </div>
        </div>
      )}

      {/* #20 — Pricing transparency for client. Premium feel: when an
          offer is on the table, client sees a clean breakdown of what
          they're paying for. Talent rates collapse to a single line
          (privacy intact) but the rest is itemized. Builds trust. */}
      {isClient && offer.stage !== "no_offer" && offer.stage !== "client_budget" && (
        <>
          <SectionHeader title="What you're paying for" subtitle="Transparent breakdown, no surprises." />
          <div style={{
            background: "#fff", borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            padding: "14px 16px", fontFamily: FONTS.body, fontSize: 13,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="text-admin-ink-muted">Talent fees ({offer.rows.length} {offer.rows.length === 1 ? "talent" : "talent"})</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
                {fmtMoney(offer.rows.reduce((s, r) => s + rowSubtotal(r, "client"), 0), currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="text-admin-ink-muted">Agency service fee</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
                {fmtMoney(offer.agencyFee, currency)}
              </span>
            </div>
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }} className="text-admin-ink">Total</span>
              <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="text-admin-accent">
                {fmtMoney(totalRevenue, currency)}
              </span>
            </div>
            <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }} className="text-admin-ink-dim">
              Includes coordination, scheduling, contract handling, and post-shoot support. Tax/VAT shown on final invoice.
            </div>
          </div>
        </>
      )}

      {/* ── D. Activity timeline ─────────────────────────────── */}
      <SectionHeader title={t("dashboard.adminTabs.offer.activity")} subtitle={t("dashboard.adminTabs.offer.activitySub")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {offer.timeline.map((e, i) => (
          <TimelineRow key={e.id} event={e} last={i === offer.timeline.length - 1} />
        ))}
      </div>

      {/* Privacy footer for non-coordinator talent */}
      {isTalent && !pov.isCoordinator && (
        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }} className="bg-admin-indigo-soft text-admin-indigo-deep">
          <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </span>
          You only see your own offer. Other talents&apos; rates and the agency&apos;s commercial breakdown are private.
        </div>
      )}

      {/* Submit-rate sheet — bottom-up sheet on mobile, centered modal
          on desktop. Pre-fills from the client's budget unit + amount,
          shows live take-home calculation, submits → writes into the
          local row-override store so the row immediately reads as
          "Submitted" in the lineup + the sticky bar copy advances
          from "Submit my rate" to "Rate received · finalizing". */}
      {isTalent && (
        <SubmitRateSheet
          open={rateSheetOpen}
          onClose={() => setRateSheetOpen(false)}
          conv={conv}
          offer={offer}
          mode={rateSheetMode}
          onSubmit={(data) => {
            // Write to the module-level override store so the rate
            // shows up everywhere — header pill, inbox row, Today
            // tile, and the offer tab itself. Survives tab switches
            // and acts as optimistic UI while the DB write resolves.
            const myRow = offer.rows.find(r => r.talentId === pov.talentId);
            if (myRow) {
              setRowOverride(conv.id, myRow.id, {
                costRate: data.amount,
                units: data.units,
                unitType: data.unitType,
                notes: data.notes || myRow.notes,
                status: "submitted",
              });
            }
            // F-pass — when the conv id is a real inquiry UUID, also
            // hit the DB. submitMyRateForInquiry resolves the offer +
            // line item internally, so the local-only mock UI doesn't
            // need to know either id.
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id)) {
              void submitMyRateForInquiry(conv.id, data.amount).then((r) => {
                if (!r.ok) toast(`Rate not saved: ${r.error}`);
              });
            }
          }}
        />
      )}
    </div>
  );
}

/** Human payout-status phrase for the talent's booked take-home line. */
function talentPayoutLabel(snap: TalentPayoutSnapshot | null): string {
  if (!snap || !snap.hasProfile) return "set up your payout account to get paid";
  switch (snap.status) {
    case "enabled":
      return "on its way to your connected payout account";
    case "pending":
      return "payout account verification pending";
    case "restricted":
      return "payout account needs attention";
    case "disabled":
      return "payout account disabled, contact support";
    default:
      return "connect a payout account to get paid";
  }
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mt-1">
      <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 14.5, fontWeight: 700, color: COLORS.ink }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      {subtitle && (
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
