"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate, type Translator } from "@/i18n/interpolate";
import { OverflowMenu } from "@/components/chat-interactions";
import { StatusSheet, type StatusSheetData } from "@/components/messages-status-sheet/StatusSheet";
import { DetailsTabContainer } from "@/components/details-tab/DetailsTabContainer";
import { MobileShellStyles } from "@/components/messages-mobile/MobileShellStyles";
import { PitchOriginCard } from "@/components/pitch-origin/PitchOriginCard";
import { ReservationThread } from "@/components/reservation-thread";
import { markThreadRead } from "@/app/(workspace)/[tenantSlug]/admin/messages/actions";
import { useAdminShell, FONTS, COLORS, toInquiry, type RichInquiry } from "../state";
import { Avatar } from "../primitives";
import { type Conversation } from "../talent";
import { StageTransitionMenu } from "./admin-1";
import { AdminReservationView } from "./admin-3";
import { AdminMessageStream } from "./admin-4";
import { stageStyle } from "./messages-shared";
import { isFirstConvWith } from "./shared/inbox-identity-1";
import { buildInquiryTabs } from "./shared/machinery-1";
import { ReassignCoordinatorSheet } from "./shared/machinery-4";
import { EditJobSheet, EditJobButton } from "@/components/messages-edit-job-sheet/EditJobSheet";
import { ProposeTimeButton } from "@/components/reservation/ProposeTimeButton";
import { getOffer } from "./shared/machinery-10";
import { LiveLineupPanel } from "./shared/machinery-11";
import { OfferTab } from "./shared/machinery-12";
import { LiveBookingActions, resolveFileKey } from "./shared/machinery-14";
import { FilesTab } from "./shared/machinery-15";
import { AdminBookingTab } from "./shared/machinery-5";
import { LogisticsTab, PaymentTab, ShellNextActionBar } from "./shared/machinery-6";
import type { ShellAction } from "./shared/machinery-6";
import type { ThreadTabId } from "./shared/machinery-8";
import { MOCK_FILES_FOR_CONV, ThreadSearchTrigger, ThreadTabBar } from "./shared/machinery-9";
import type { Offer } from "./shared/machinery-9";
import { ShellHeader } from "./talent-1";
import type { ShellHeaderInput } from "./talent-1";
import { AdminActivityStream } from "./admin-4b";

// ── Trust chip (verified standing) ──────────────────────────────────
// Formats a talent's VERIFIED global standing (talent_profiles.rating_avg /
// rating_count, threaded onto RequirementGroup.talents by the data-bridge)
// into a compact "★ 4.9 · 12" label. Returns null when there is no meaningful
// rating — absence is neutral, so the lineup never shows "0.0" or "no reviews".
function formatTrustChip(
  ratingAvg?: number | null,
  ratingCount?: number | null,
): string | null {
  if (typeof ratingCount !== "number" || ratingCount <= 0) return null;
  if (typeof ratingAvg !== "number" || !Number.isFinite(ratingAvg) || ratingAvg <= 0) return null;
  return `★ ${ratingAvg.toFixed(1)} · ${ratingCount}`;
}

// Tiny read-only pill consistent with the header's other chips (muted ink on a
// faint warm fill). The star is a glyph, not a gold accent — admin aesthetics
// avoid gold/rust (see feedback_admin_aesthetics.md).
function TrustChip({ label }: { label: string }) {
  return (
    <span
      aria-label={`Verified standing ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: COLORS.surfaceAlt,
        color: COLORS.inkMuted,
        border: `1px solid ${COLORS.borderSoft}`,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        fontFamily: FONTS.body,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── WhosTurnBanner (D4) ─────────────────────────────────────────────
// A slim contextual banner shown at the top of the thread content area
// that tells every viewer whose turn it is in the inquiry flow.
// Derives a human-readable phrase from nextActionBy + the current stage.
// Returns null for terminal stages (booked/past) to avoid noise.
function WhosTurnBanner({
  nextActionBy,
  stage,
  talentPending,
}: {
  nextActionBy: "client" | "coordinator" | "talent" | "ops" | null;
  stage: "inquiry" | "hold" | "approved" | "booked" | "past";
  /** Number of talents who haven't responded yet. Used to show "(N of M)". */
  talentPending?: number;
}) {
  const t = useT();
  if (!nextActionBy || stage === "booked" || stage === "past") return null;

  const { text, tone } = ((): { text: string; tone: "amber" | "blue" | "green" | "muted" } => {
    if (nextActionBy === "client") return {
      text: stage === "hold"
        ? t("dashboard.adminThread.turnClientApprove")
        : t("dashboard.adminThread.turnClientRespond"),
      tone: "amber",
    };
    if (nextActionBy === "coordinator") return {
      text: stage === "inquiry"
        ? t("dashboard.adminThread.turnCoordinatorInquiry")
        : stage === "hold"
        ? t("dashboard.adminThread.turnCoordinatorHold")
        : stage === "approved"
        ? t("dashboard.adminThread.turnCoordinatorApproved")
        : t("dashboard.adminThread.turnCoordinatorGeneric"),
      tone: "blue",
    };
    if (nextActionBy === "talent") {
      return {
        text: talentPending && talentPending > 0
          ? interpolate(t("dashboard.adminThread.turnTalentRespondPending"), { count: talentPending })
          : t("dashboard.adminThread.turnTalentRespond"),
        tone: "muted",
      };
    }
    if (nextActionBy === "ops") return {
      text: t("dashboard.adminThread.turnOps"),
      tone: "muted",
    };
    return { text: t("dashboard.adminThread.turnFallback"), tone: "muted" };
  })();

  const styles: Record<typeof tone, { bg: string; color: string; border: string }> = {
    amber: { bg: COLORS.amberSoft, color: COLORS.amberDeep, border: "rgba(82,96,109,0.20)" },
    blue:  { bg: "rgba(29,78,216,0.07)", color: "#1D4ED8", border: "rgba(29,78,216,0.18)" },
    green: { bg: "rgba(15,79,62,0.07)",  color: "#0F4F3E", border: "rgba(15,79,62,0.18)" },
    muted: { bg: "rgba(11,11,13,0.04)",  color: "rgba(11,11,13,0.60)", border: "rgba(11,11,13,0.10)" },
  };
  const s = styles[tone];

  return (
    <div style={{
      margin: "0 14px 6px",
      padding: "6px 12px",
      borderRadius: 8,
      background: s.bg,
      border: `1px solid ${s.border}`,
      display: "inline-flex", alignItems: "center", gap: 7,
      fontSize: 11.5, fontWeight: 600, color: s.color,
      fontFamily: FONTS.body,
      flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 4.5v3l1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      {text}
    </div>
  );
}

// Hero: status pill + project + brief + funnel
// Operational block: lineup status + offer state + needs-me action card
// Tab bar: Client thread · Talent group · Files · Details (admin sees ALL — no locks)
// Tab content adapts per active tab.
export function AdminInquiryDetail({ inquiry, onBack }: { inquiry: RichInquiry; onBack: () => void }) {
  const t = useT();
  const { toast, state, effectiveTenant } = useAdminShell();
  const router = useRouter();
  // Match the talent shell: admin lands on the flat Client tab (the
  // primary sales surface). Client / Group / Activity are now top-level
  // tabs, not a floating sub-toggle — the chatSubThread state is gone.
  const [activeTab, setActiveTab] = useState<ThreadTabId>("client");
  const [coordinatorSheetOpen, setCoordinatorSheetOpen] = useState(false);
  // Slice P wiring: Status sheet state — opens on header status pill tap.
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [editJobOpen, setEditJobOpen] = useState(false);

  /* Phase A PR 2 — admin re-skin onto the ReservationThread primitive,
   * behind a `?rt=1` search-param flag. Hook is called unconditionally
   * here at the top; the conditional render decision happens AFTER all
   * other hooks fire to satisfy Rules of Hooks (see end of derived-state
   * block below). Audit: web/docs/messages-consolidation-audit-2026-05-13.md */
  const searchParams = useSearchParams();
  const useReservationThread = searchParams?.get("rt") === "1";

  // Plan tier drives admin-only affordances inside the booking tab
  // (e.g. Free hides Reassign coordinator). The state plan uses
  // "network" — map to AdminBookingTab's "hub-network" key.
  // `website` has no roster, so it gets the same reduced booking-tab
  // affordances as Free; "network" maps to AdminBookingTab's "hub-network".
  const planTier: "free" | "studio" | "agency" | "hub-network" =
    state.plan === "network"
      ? "hub-network"
      : state.plan === "website"
        ? "free"
        : state.plan;

  // Finding D: a distinct "approved" bucket so an inquiry that's only approved
  // (all parties signed off, 0 agency_bookings) never reads as "Booked" on the
  // admin header/next-action — keeping admin aligned with the talent + client
  // shells (which already show a distinct Approved state).
  const stageBucket: "inquiry" | "hold" | "approved" | "booked" | "past" =
      inquiry.stage === "draft" || inquiry.stage === "submitted" || inquiry.stage === "coordination" ? "inquiry"
    : inquiry.stage === "offer_pending" ? "hold"
    : inquiry.stage === "approved" ? "approved"
    : inquiry.stage === "booked" ? "booked"
    : "past";
  const sc = stageStyle(stageBucket);

  const allTalents = inquiry.requirementGroups.flatMap(g => g.talents);
  const lineupTotal = allTalents.length;
  const lineupAccepted = allTalents.filter(t => t.status === "accepted").length;
  const lineupPending = allTalents.filter(t => t.status === "pending").length;

  // A5 — fire markThreadRead on tab open so the unread badge clears
  // immediately when the user opens a Client or Talent thread. Skipped
  // for synthetic mock inquiry ids (the demo data isn't in DB).
  const inquiryIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiry.id);
  const coordinatorFirstName = inquiry.coordinator?.name.split(" ")[0] ?? null;
  useEffect(() => {
    if (!inquiryIsUuid) return;
    // Flat tabs: mark read directly off the active tab. Client = private
    // thread, Group (legacy id "talent") = group thread. Activity is the
    // group thread in read-only mode and shares the Group read state.
    if (activeTab === "client") {
      void markThreadRead(effectiveTenant.slug, inquiry.id, "private");
    } else if (activeTab === "talent" || activeTab === "activity") {
      void markThreadRead(effectiveTenant.slug, inquiry.id, "group");
    }
  }, [activeTab, inquiry.id, inquiryIsUuid, effectiveTenant.slug]);

  // Phase A PR 2 — defer to new primitive when the flag is on. Placed
  // AFTER all hooks so React Hooks order is stable across renders.
  if (useReservationThread) {
    return <AdminReservationView inquiry={inquiry} onBack={onBack} />;
  }

  // Offer state
  const offer = inquiry.offer;
  const offerLabel = (() => {
    if (!offer) return null;
    if (offer.status === "draft") return interpolate(t("dashboard.adminThread.offerDraft"), { total: offer.total });
    if (offer.status === "sent") return interpolate(t("dashboard.adminThread.offerSent"), { total: offer.total });
    if (offer.status === "accepted") return interpolate(t("dashboard.adminThread.offerAccepted"), { total: offer.total });
    if (offer.status === "rejected") return interpolate(t("dashboard.adminThread.offerRejected"), { total: offer.total });
    return offer.total;
  })();

  // Admin next-action — derived from inquiry state. Surfaces in the
  // unified ShellNextActionBar at the bottom of the shell, not as a
  // separate hero banner. Keeps admin's action surface consistent with
  // talent + client.
  const adminAction: { primary?: ShellAction; secondary?: ShellAction; hint?: string } = (() => {
    if (inquiry.nextActionBy !== "coordinator") return {};
    if (stageBucket === "inquiry") return {
      hint: t("dashboard.adminThread.actionInquiryHint"),
      primary: { label: t("dashboard.adminThread.actionInquiryPrimary"), tone: "primary", onClick: () => { setActiveTab("client"); } },
    };
    if (stageBucket === "hold") return {
      hint: t("dashboard.adminThread.actionHoldHint"),
      primary: { label: t("dashboard.adminThread.actionHoldPrimary"), tone: "primary", onClick: () => { setActiveTab("offer"); } },
    };
    if (stageBucket === "approved") return {
      // Finding D: approved ≠ booked. Direct the admin to the convert step
      // instead of telling them it's already "Booked".
      hint: t("dashboard.adminThread.actionApprovedHint"),
      primary: { label: t("dashboard.adminThread.actionApprovedPrimary"), tone: "primary", onClick: () => { setActiveTab("offer"); } },
    };
    if (stageBucket === "booked") return {
      hint: t("dashboard.adminThread.actionBookedHint"),
      // Slice B: Logistics rolled into Event tab.
      primary: { label: t("dashboard.adminThread.actionBookedPrimary"), tone: "success", onClick: () => { setActiveTab("event"); } },
    };
    return {};
  })();

  // Split messages by thread
  const clientMessages = inquiry.messages.filter(m => m.threadType === "private");
  const talentMessages = inquiry.messages.filter(m => m.threadType === "group");
  const fileCount = (MOCK_FILES_FOR_CONV[resolveFileKey(inquiry.id)] ?? []).length;

  return (
    <div data-msg-shell style={{
      padding: 16, fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
      height: "100%", minHeight: 0,
    }}>
      <MobileShellStyles />
      {/* Unified shell header — same compact band as the talent + client
          shells. Admin variant: SLA chip on the right (urgency cue),
          adapted RichInquiry → ShellHeaderInput, no "you're coord" pill. */}
      <ShellHeader
        conv={{
          client: inquiry.clientName,
          brief: inquiry.brief,
          stage: stageBucket,
          agency: inquiry.agencyName,
          location: inquiry.location ?? undefined,
          date: inquiry.date ?? undefined,
          clientTrust: inquiry.clientTrust,
          source: inquiry.source.kind === "direct" ? { kind: "direct", label: inquiry.source.domain } :
                  inquiry.source.kind === "hub" ? { kind: "tulala-hub", label: inquiry.source.hubName } :
                  inquiry.source.kind === "manual" ? { kind: "email" } :
                  { kind: "direct" },
        }}
        onBack={onBack}
        backLabel={t("dashboard.adminThread.backLabel")}
        showCoordPill={false}
        onStatusClick={() => setStatusSheetOpen(true)}
        rightSlot={(
          <div className="flex items-center gap-2">
            {inquiryIsUuid && <EditJobButton onClick={() => setEditJobOpen(true)} />}
            {inquiryIsUuid && (
              <ProposeTimeButton tenantSlug={effectiveTenant.slug} inquiryId={inquiry.id} />
            )}
            {inquiryIsUuid && (
              <button
                type="button"
                onClick={() => setCoordinatorSheetOpen(true)}
                title={inquiry.coordinator ? interpolate(t("dashboard.adminThread.coordChipTitleAssigned"), { name: inquiry.coordinator.name }) : t("dashboard.adminThread.coordChipTitleUnassigned")}
                style={{
                  height: 32,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`,
                  background: "#fff",
                  color: COLORS.ink,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: inquiry.coordinator ? COLORS.success : COLORS.amber, display: "inline-block" }} />
                {coordinatorFirstName ? interpolate(t("dashboard.adminThread.coordChipLabelAssigned"), { name: coordinatorFirstName }) : t("dashboard.adminThread.coordChipLabelUnassigned")}
              </button>
            )}
            <StageTransitionMenu inquiryId={inquiry.id} stage={inquiry.stage} />
            <ThreadSearchTrigger
              inquiryId={inquiry.id}
              messages={inquiry.messages}
              onJumpOffer={() => setActiveTab("offer")}
              onJumpCallSheet={() => setActiveTab("event")}
              onJumpPayment={() => setActiveTab("offer")}
              onJumpApproval={() => setActiveTab("offer")}
            />
            <OverflowMenu toast={toast} size="sm" />
          </div>
        )}
        // Slice A (Messages consolidation v2): row 3 of the universal
        // header — avatar stack (left) + offer chip (right). Replaces
        // the old "N/N accepted · coord name" text + the standalone
        // LiveLineupPanel band below the header. Avatar stack is the
        // user's at-a-glance answer to "who's on this". Offer chip is
        // the at-a-glance answer to "how much money."
        // - Coord avatars carry a star overlay.
        // - Declined/removed talents dim to 40%.
        // - Tap "Manage" to scroll to Lineup tab (Slice I migrates this
        //   to a Sheet on mobile).
        metaExtras={lineupTotal > 0 || offerLabel ? (
          <>
            {/* LEFT: avatar stack + count */}
            {lineupTotal > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("lineup")}
                aria-label={interpolate(t("dashboard.adminThread.lineupOpenAria"), { count: lineupTotal })}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  display: "inline-flex", alignItems: "center", gap: 8,
                  cursor: "pointer", fontFamily: FONTS.body, fontSize: 11.5,
                  color: COLORS.inkMuted,
                }}
              >
                <span className="inline-flex">
                  {/* trust-strip: each lineup avatar's tooltip carries the
                      talent's verified standing when present (see the visible
                      per-talent chip strip rendered below the stack). Rating is
                      threaded onto RequirementGroup.talents by the data-bridge's
                      single batched loadTalentChipInfo read. Map var is `member`
                      (not `t`) so the i18n translator `t` in scope is not shadowed. */}
                  {allTalents.slice(0, 5).map((member, idx) => {
                    const isAccepted = member.status === "accepted";
                    const isSuperseded = member.status === "superseded";
                    const isDeclined = isSuperseded;
                    // Derive initials from name since the talent rows
                    // on RichInquiry don't carry an initials field.
                    const initials = member.name
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((s: string) => s[0]?.toUpperCase() ?? "")
                      .join("") || "·";
                    const trust = formatTrustChip(member.ratingAvg, member.ratingCount);
                    return (
                      <span
                        key={`${member.name}-${idx}`}
                        style={{
                          marginLeft: idx === 0 ? 0 : -6,
                          border: `1.5px solid #fff`,
                          borderRadius: "50%",
                          display: "inline-flex",
                          position: "relative",
                          opacity: isDeclined ? 0.4 : 1,
                        }}
                        title={trust
                          ? `${member.name} · ${lineItemStatusLabel(member.status, t)} · ${trust}`
                          : `${member.name} · ${lineItemStatusLabel(member.status, t)}`}
                      >
                        <Avatar size={22} tone="auto" hashSeed={member.name} initials={initials} photoUrl={member.thumb || undefined} />
                        {isAccepted && (
                          <span aria-hidden style={{
                            position: "absolute", bottom: -1, right: -1,
                            width: 7, height: 7, borderRadius: "50%",
                            background: COLORS.success, border: `1.5px solid #fff`,
                          }} />
                        )}
                      </span>
                    );
                  })}
                  {allTalents.length > 5 && (
                    <span style={{ marginLeft: -6, width: 22, height: 22, borderRadius: "50%", border: `1.5px solid #fff`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }} className="bg-admin-surface-alt text-admin-ink-muted">+{allTalents.length - 5}</span>
                  )}
                </span>
                <span style={{ fontWeight: 600 }} className="text-admin-ink">
                  {interpolate(t(lineupTotal === 1 ? "dashboard.adminThread.lineupCountOne" : "dashboard.adminThread.lineupCountMany"), { count: lineupTotal })}
                </span>
                {lineupTotal > 0 && (
                  <span className="text-admin-ink-dim">
                    {interpolate(t("dashboard.adminThread.lineupAcceptedSuffix"), { accepted: lineupAccepted, total: lineupTotal })}
                  </span>
                )}
                {/* trust-strip: read-only verified standing next to the name.
                    Single-talent lineups (the common talent-page-origin case)
                    show the chip inline here; multi-talent lineups surface each
                    talent's standing via the per-avatar tooltip above (a strip of
                    chips would overflow this single-line header). Renders nothing
                    when the talent has no published reviews (absence is neutral). */}
                {lineupTotal === 1 && (() => {
                  const trust = formatTrustChip(allTalents[0]?.ratingAvg, allTalents[0]?.ratingCount);
                  return trust ? <TrustChip label={trust} /> : null;
                })()}
              </button>
            )}

            {/* SPACER */}
            <span style={{ flex: 1 }} />

            {/* RIGHT: offer chip — tap to jump to Offer tab */}
            {offerLabel && (
              <button
                type="button"
                onClick={() => setActiveTab("offer")}
                aria-label={interpolate(t("dashboard.adminThread.offerChipAria"), { label: offerLabel })}
                title={offerLabel}
                style={{
                  background: COLORS.surfaceAlt, color: COLORS.inkMuted,
                  border: `1px solid ${COLORS.borderSoft}`,
                  padding: "3px 9px", borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  fontFamily: FONTS.body, fontVariantNumeric: "tabular-nums",
                  maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  cursor: "pointer",
                }}
              >{offerLabel}</button>
            )}
          </>
        ) : undefined}
      />

      {/* Slice A (Messages consolidation v2): the standalone
          <LiveLineupPanel /> band that sat between the header and
          tab bar is REMOVED. The avatar stack in the header's row 3
          (metaExtras above) replaces the always-visible part. Full
          add/remove/reorder still lives in LiveLineupPanel — it now
          renders only inside the Lineup tab body (see ThreadTabBar
          panes below, where the "lineup" tab content is mounted).
          This change reclaims ~140-220px of vertical space for the
          conversation pane on every inquiry. */}

      {/* TAB BAR — admin sees all 4 tabs unlocked. Lineup + Offer summaries
          live inside the Offer tab now (single source of truth). The hero
          stays slim: identity + brief + funnel only. */}
      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        position: "relative" }} className="rounded-admin-md">
        <ThreadTabBar
          activeId={activeTab}
          onSelect={setActiveTab}
          tabs={buildInquiryTabs({
            status: inquiry.stage === "booked" ? "booked" : "inquiry",
            pov: "admin",
            unread: { client: inquiry.unreadPrivate, talent: inquiry.unreadGroup, files: fileCount },
            offerNeedsAttention: getOffer(inquiry.id)?.stage === "countered",
            paymentDue: inquiry.stage === "booked",
            // Payment tab is relevant once all parties have approved and a
            // booking exists or is imminent: approved → booked → wrapped.
            // (Past/wrapped still needs the payout settle surface.)
            paymentRelevant: stageBucket === "approved" || stageBucket === "booked" || stageBucket === "past",
            planTier,
          })}
        />
        {/* Slice B (Messages consolidation v2): unified Chat tab with
            [Client | Group | DM] sub-toggle. Client = sales surface;
            Group = internal talent coordination; DM = 1:1 (future
            slice — placeholder UI for now). */}
        {(() => {
          const adminSmartCtx = stageBucket === "inquiry" ? "inquiry"
            : stageBucket === "hold" ? "hold"
            : stageBucket === "approved" ? "offer"
            : stageBucket === "booked" ? "offer"
            : "default";
          // Flat tabs — same as the talent shell. No floating sub-toggle:
          // each thread is its own top-level tab. "talent" is the legacy id
          // for the Group tab; "activity" is the read-only timeline. isOnChat
          // (client||talent||activity) still gates WhosTurnBanner + PitchOriginCard,
          // exactly matching the talent shell (talent-2.tsx) — the banner showing
          // on Activity is intended parity, not a regression.
          const isOnChat = activeTab === "client" || activeTab === "talent" || activeTab === "activity";
          const showClientStream = activeTab === "client";
          const showGroupStream = activeTab === "talent";
          const showDmStream = activeTab === "activity";
          return (
            <>
              {/* D4 — Whose-turn banner. Shows once, above the message
                  stream (not repeated in every bubble). Admin sees a
                  "your turn" nudge when nextActionBy=coordinator; other
                  values surface the waiting party so admin knows the
                  ball is in someone else's court. */}
              {isOnChat && (
                <WhosTurnBanner
                  nextActionBy={inquiry.nextActionBy}
                  stage={stageBucket}
                  talentPending={lineupPending}
                />
              )}
              {/* Slice M wiring (item #6): originating pitch context.
                  Renders only when this inquiry was generated from a
                  Pitch (inquiry.pitchId is set). Sits at the top of
                  the Chat content; clicking deep-links to the pitch
                  page. */}
              {isOnChat && inquiry.pitchId && (
                <div style={{ padding: "8px 12px 4px" }}>
                  <PitchOriginCard
                    tenantSlug={effectiveTenant.slug}
                    pitchId={inquiry.pitchId}
                    pitchTitle={inquiry.pitchTitle ?? t("dashboard.adminThread.pitchTitleFallback")}
                    compact
                  />
                </div>
              )}

              {showClientStream && (
                <AdminMessageStream
                  messages={clientMessages}
                  placeholder={interpolate(t("dashboard.adminThread.replyToClientPlaceholder"), { name: inquiry.clientName })}
                  threadKey={`admin:${inquiry.id}:client`}
                  smartReplyContext={adminSmartCtx}
                  firstTimeClientName={isFirstConvWith(inquiry.clientName) ? inquiry.clientName : undefined}
                  closed={inquiry.stage === "rejected" || inquiry.stage === "expired"}
                  closedNotice={inquiry.stage === "rejected"
                    ? t("dashboard.adminThread.closedClientPassedOffer")
                    : t("dashboard.adminThread.closedAutoExpiredClient")}
                  inquiryId={inquiry.id}
                  tenantSlug={effectiveTenant.slug}
                  threadType="private"
                />
              )}
              {showGroupStream && (
                <AdminMessageStream
                  messages={talentMessages}
                  placeholder={t("dashboard.adminThread.messageTalentGroupPlaceholder")}
                  threadKey={`admin:${inquiry.id}:talent`}
                  smartReplyContext={adminSmartCtx}
                  closed={inquiry.stage === "rejected" || inquiry.stage === "expired"}
                  closedNotice={inquiry.stage === "rejected"
                    ? t("dashboard.adminThread.closedClientPassedProject")
                    : t("dashboard.adminThread.closedAutoExpired")}
                  inquiryId={inquiry.id}
                  tenantSlug={effectiveTenant.slug}
                  threadType="group"
                />
              )}
              {/* D7 — Activity sub-thread: real DB-backed money/offer timeline.
                  Replaces the prior "DM threads coming soon" stub with the same
                  enriched activity view that the client and talent shells have.
                  Shows: offer events, payment requests, booking confirmations,
                  payout status, and any detail-update diffs stored as system cards.
                  Read-only (no composer). Admin sees the full commercial picture
                  (both talent and client sides); group thread is the right source
                  since it receives all engine-emitted cards. */}
              {showDmStream && (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                  <AdminActivityStream
                    inquiryId={inquiry.id}
                    tenantSlug={effectiveTenant.slug}
                    threadType="group"
                  />
                </div>
              )}
            </>
          );
        })()}
        {/* Slice B: new universal Lineup tab — DB-backed roster manager */}
        {activeTab === "lineup" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
            <LiveLineupPanel inquiryId={inquiry.id} defaultExpanded />
          </div>
        )}
        {activeTab === "offer" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <OfferTab conv={{ id: inquiry.id } as Conversation} pov={{ kind: "admin" }} />
          </div>
        )}
        {activeTab === "logistics" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <LogisticsTab inquiry={toInquiry(inquiry)} pov="admin" />
          </div>
        )}
        {activeTab === "payment" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <PaymentTab inquiry={toInquiry(inquiry)} pov="admin" />
          </div>
        )}
        {activeTab === "files" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <FilesTab conv={{ id: inquiry.id } as Conversation} povCanSeeTalentFiles={true} />
          </div>
        )}
        {/* Details v3 (plan §10): canonical 9-section <DetailsTab> is
            now the sole content surface. <LiveBookingActions> stays
            because it owns engine-action entry points (request payment
            / mark paid / wrap / etc.) that DetailsTab doesn't yet
            expose — separate from informational rendering. The legacy
            <AdminBookingTab> card grid was a duplicate of DetailsTab's
            Sections 2–7 and is removed. */}
        {(activeTab === "event" || activeTab === "booking" || activeTab === "details") && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
            <DetailsTabContainer inquiryId={inquiry.id} pov="admin" />
            <div style={{ height: 24 }} />
            <LiveBookingActions inquiryId={inquiry.id} inquiryStage={inquiry.stage} />
          </div>
        )}
      </div>
      <ShellNextActionBar {...adminAction} />
      {/* Slice P wiring: Status sheet — opens from the header status
          pill. Derives the 4-family status data from the inquiry's
          current state + lineup + offer + payment. Engine reads are
          best-effort with sensible fallbacks; missing data renders
          empty sections rather than broken rows. */}
      <StatusSheet
        open={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        data={deriveAdminStatusSheetData(inquiry, stageBucket, allTalents, offerLabel, t)}
        t={t}
      />
      {inquiryIsUuid && (
        <EditJobSheet
          open={editJobOpen}
          inquiryId={inquiry.id}
          tenantSlug={effectiveTenant.slug}
          onClose={() => setEditJobOpen(false)}
          onSaved={() => { toast(t("dashboard.adminThread.jobDetailsSavedToast")); router.refresh(); }}
        />
      )}
      {inquiryIsUuid && (
        <ReassignCoordinatorSheet
          open={coordinatorSheetOpen}
          onClose={() => setCoordinatorSheetOpen(false)}
          inquiryId={inquiry.id}
          currentCoordName={inquiry.coordinator?.name ?? t("dashboard.adminThread.coordUnassigned")}
          currentCoordUserId={inquiry.coordinator?.id ?? null}
          onSuccess={() => router.refresh()}
          // The coordinator chip is the primary "assign a talent / hand off"
          // control (its tooltip promises both). Open the redesigned combined
          // picker (staff teammates + roster talents + history toggle) which
          // appoints a co-coordinator with full control of this inquiry —
          // matching the admin-appoints-a-talent feature. (Pure primary-swap
          // remains available via the engine; revisit a unified sheet later.)
          mode="add_secondary"
        />
      )}
    </div>
  );
}

/** Localize a per-talent line-item status slug (from `LineItemStatus`) for
 *  the avatar-stack tooltip. Falls back to the raw slug on a catalog miss. */
function lineItemStatusLabel(status: string, t: Translator): string {
  const KEY: Record<string, string> = {
    pending: "dashboard.adminThread.lineItemStatus.pending",
    accepted: "dashboard.adminThread.lineItemStatus.accepted",
    declined: "dashboard.adminThread.lineItemStatus.declined",
    superseded: "dashboard.adminThread.lineItemStatus.superseded",
  };
  const key = KEY[status];
  if (!key) return status;
  const out = t(key);
  return out === key ? status : out;
}

/** Derive the 4-family status data for the admin Status sheet. Keeps
 *  the per-pov mapping co-located with the caller; talent + client
 *  shells get their own derivers when wired. */
export function deriveAdminStatusSheetData(
  inquiry: RichInquiry,
  stageBucket: "inquiry" | "hold" | "approved" | "booked" | "past",
  allTalents: Array<{ name: string; status: string }>,
  offerLabel: string | null,
  t: Translator,
): StatusSheetData {
  const stage: StatusSheetData["stage"] =
      stageBucket === "inquiry" ? "Inquiry"
    : stageBucket === "hold" ? "Offer sent"
    : stageBucket === "approved" ? "Approved"
    : stageBucket === "booked" ? "Booked"
    : stageBucket === "past" ? "Wrapped"
    : "Inquiry";

  const offerStatus: StatusSheetData["offer"]["status"] =
      !offerLabel ? "No offer"
    : offerLabel.toLowerCase().includes("draft") ? "Draft"
    : offerLabel.toLowerCase().includes("sent") || offerLabel.toLowerCase().includes("awaiting") ? "Sent"
    : offerLabel.toLowerCase().includes("accepted") || offerLabel.toLowerCase().includes("booked") ? "Accepted"
    : offerLabel.toLowerCase().includes("rejected") || offerLabel.toLowerCase().includes("declined") ? "Declined"
    : "Sent";

  const paymentStatus: StatusSheetData["payment"]["status"] =
      stageBucket === "past" ? "Paid"
    : stageBucket === "booked" ? "Requested"
    : "Not requested";

  return {
    stage,
    offer: {
      status: offerStatus,
      totalLabel: offerLabel ?? undefined,
      nextAction:
          offerStatus === "No offer" ? t("dashboard.adminThread.statusOfferNextNoOffer")
        : offerStatus === "Draft" ? t("dashboard.adminThread.statusOfferNextDraft")
        : offerStatus === "Sent" ? t("dashboard.adminThread.statusOfferNextSent")
        : offerStatus === "Accepted" ? t("dashboard.adminThread.statusOfferNextAccepted")
        : undefined,
    },
    talents: allTalents.map((t) => ({
      name: t.name,
      status: ((s: string): StatusSheetData["talents"][number]["status"] => {
        if (s === "accepted" || s === "confirmed") return "Accepted";
        if (s === "pending" || s === "invited") return "Invited";
        if (s === "declined") return "Declined";
        if (s === "removed") return "Removed";
        if (s === "hold" || s === "superseded") return "Hold";
        return "Invited";
      })(t.status),
    })),
    payment: {
      status: paymentStatus,
      amountLabel: offerLabel ?? undefined,
      nextAction:
          paymentStatus === "Not requested" ? t("dashboard.adminThread.statusPaymentNextNotRequested")
        : paymentStatus === "Requested" ? t("dashboard.adminThread.statusPaymentNextRequested")
        : paymentStatus === "Paid" ? t("dashboard.adminThread.statusPaymentNextPaid")
        : undefined,
    },
    nextStep:
        stage === "Inquiry" ? t("dashboard.adminThread.statusNextStepInquiry")
      : stage === "Offer sent" ? t("dashboard.adminThread.statusNextStepOfferSent")
      : stage === "Approved" ? t("dashboard.adminThread.statusNextStepApproved")
      : stage === "Booked" ? t("dashboard.adminThread.statusNextStepBooked")
      : stage === "Wrapped" ? t("dashboard.adminThread.statusNextStepWrapped")
      : undefined,
  };
}
