"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { getOffer } from "./shared/machinery-10";
import { LiveLineupPanel } from "./shared/machinery-11";
import { OfferTab } from "./shared/machinery-12";
import { LiveBookingActions, resolveFileKey } from "./shared/machinery-14";
import { FilesTab } from "./shared/machinery-15";
import { AdminBookingTab } from "./shared/machinery-5";
import { LogisticsTab, ShellNextActionBar } from "./shared/machinery-6";
import type { ShellAction } from "./shared/machinery-6";
import type { ChatSubThreadId, ThreadTabId } from "./shared/machinery-8";
import { ChatSubToggleDropdown, MOCK_FILES_FOR_CONV, ThreadSearchTrigger, ThreadTabBar } from "./shared/machinery-9";
import type { Offer } from "./shared/machinery-9";
import { ShellHeader } from "./talent-1";
import type { ShellHeaderInput } from "./talent-1";

// Hero: status pill + project + brief + funnel
// Operational block: lineup status + offer state + needs-me action card
// Tab bar: Client thread · Talent group · Files · Details (admin sees ALL — no locks)
// Tab content adapts per active tab.
export function AdminInquiryDetail({ inquiry, onBack }: { inquiry: RichInquiry; onBack: () => void }) {
  const { toast, state, effectiveTenant } = useAdminShell();
  // Slice B (Messages consolidation v2): admin lands on the unified
  // Chat tab; Client is the default sub-thread (client conversation
  // is the primary sales surface for admin/coord).
  const [activeTab, setActiveTab] = useState<ThreadTabId>("chat");
  const [chatSubThread, setChatSubThread] = useState<ChatSubThreadId>("client");
  // Slice P wiring: Status sheet state — opens on header status pill tap.
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);

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
  const planTier: "free" | "studio" | "agency" | "hub-network" =
    state.plan === "network" ? "hub-network" : state.plan;

  const stageBucket: "inquiry" | "hold" | "booked" | "past" =
      inquiry.stage === "draft" || inquiry.stage === "submitted" || inquiry.stage === "coordination" ? "inquiry"
    : inquiry.stage === "offer_pending" ? "hold"
    : inquiry.stage === "approved" || inquiry.stage === "booked" ? "booked"
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
  useEffect(() => {
    if (!inquiryIsUuid) return;
    // Slice B (Messages consolidation v2): unified Chat tab — mark read
    // based on which sub-thread is active. Legacy IDs ("client" /
    // "talent") still honored for any code path that hasn't migrated.
    if (activeTab === "chat") {
      if (chatSubThread === "client") {
        void markThreadRead(effectiveTenant.slug, inquiry.id, "private");
      } else if (chatSubThread === "group") {
        void markThreadRead(effectiveTenant.slug, inquiry.id, "group");
      }
    } else if (activeTab === "client") {
      void markThreadRead(effectiveTenant.slug, inquiry.id, "private");
    } else if (activeTab === "talent") {
      void markThreadRead(effectiveTenant.slug, inquiry.id, "group");
    }
  }, [activeTab, chatSubThread, inquiry.id, inquiryIsUuid, effectiveTenant.slug]);

  // Phase A PR 2 — defer to new primitive when the flag is on. Placed
  // AFTER all hooks so React Hooks order is stable across renders.
  if (useReservationThread) {
    return <AdminReservationView inquiry={inquiry} onBack={onBack} />;
  }

  // Offer state
  const offer = inquiry.offer;
  const offerLabel = (() => {
    if (!offer) return null;
    if (offer.status === "draft") return `Draft · ${offer.total}`;
    if (offer.status === "sent") return `Sent · ${offer.total} · awaiting client`;
    if (offer.status === "accepted") return `Accepted · ${offer.total}`;
    if (offer.status === "rejected") return `Rejected · ${offer.total}`;
    return offer.total;
  })();

  // Admin next-action — derived from inquiry state. Surfaces in the
  // unified ShellNextActionBar at the bottom of the shell, not as a
  // separate hero banner. Keeps admin's action surface consistent with
  // talent + client.
  const adminAction: { primary?: ShellAction; secondary?: ShellAction; hint?: string } = (() => {
    if (inquiry.nextActionBy !== "coordinator") return {};
    if (stageBucket === "inquiry") return {
      hint: "Reply to client to keep this moving.",
      // Slice B: unified Chat tab + Client sub-thread.
      primary: { label: "Reply to client", tone: "primary", onClick: () => { setActiveTab("chat"); setChatSubThread("client"); } },
    };
    if (stageBucket === "hold") return {
      hint: "Hold open — send the revised offer.",
      primary: { label: "Open offer", tone: "primary", onClick: () => { setActiveTab("offer"); } },
    };
    if (stageBucket === "booked") return {
      hint: "Booked. Open the event details + call sheet.",
      // Slice B: Logistics rolled into Event tab.
      primary: { label: "Open event", tone: "success", onClick: () => { setActiveTab("event"); } },
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
        backLabel="Inbox"
        showCoordPill={false}
        onStatusClick={() => setStatusSheetOpen(true)}
        rightSlot={(
          <div className="flex items-center gap-2">
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
                aria-label={`${lineupTotal} talent on this inquiry — open Lineup tab`}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  display: "inline-flex", alignItems: "center", gap: 8,
                  cursor: "pointer", fontFamily: FONTS.body, fontSize: 11.5,
                  color: COLORS.inkMuted,
                }}
              >
                <span className="inline-flex">
                  {allTalents.slice(0, 5).map((t, idx) => {
                    const isAccepted = t.status === "accepted";
                    const isSuperseded = t.status === "superseded";
                    const isDeclined = isSuperseded;
                    // Derive initials from name since the talent rows
                    // on RichInquiry don't carry an initials field.
                    const initials = t.name
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((s: string) => s[0]?.toUpperCase() ?? "")
                      .join("") || "·";
                    return (
                      <span
                        key={`${t.name}-${idx}`}
                        style={{
                          marginLeft: idx === 0 ? 0 : -6,
                          border: `1.5px solid #fff`,
                          borderRadius: "50%",
                          display: "inline-flex",
                          position: "relative",
                          opacity: isDeclined ? 0.4 : 1,
                        }}
                        title={`${t.name} · ${t.status}`}
                      >
                        <Avatar size={22} tone="auto" hashSeed={t.name} initials={initials} />
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
                  {lineupTotal} talent{lineupTotal === 1 ? "" : "s"}
                </span>
                {lineupTotal > 0 && (
                  <span className="text-admin-ink-dim">
                    · {lineupAccepted}/{lineupTotal} accepted
                  </span>
                )}
              </button>
            )}

            {/* SPACER */}
            <span style={{ flex: 1 }} />

            {/* RIGHT: offer chip — tap to jump to Offer tab */}
            {offerLabel && (
              <button
                type="button"
                onClick={() => setActiveTab("offer")}
                aria-label={`Offer state: ${offerLabel} — open Offer tab`}
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
      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", // Anchor for the floating ChatSubToggleDropdown (absolute,
        // top:4 left:8 — see component).
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
            : stageBucket === "booked" ? "offer"
            : "default";
          const isOnChat = activeTab === "chat";
          const isLegacyClient = activeTab === "client"; // backward compat
          const isLegacyTalent = activeTab === "talent"; // backward compat
          const showClientStream = (isOnChat && chatSubThread === "client") || isLegacyClient;
          const showGroupStream = (isOnChat && chatSubThread === "group") || isLegacyTalent;
          const showDmStream = isOnChat && chatSubThread === "dm";
          return (
            <>
              {/* Chat sub-toggle — floating dropdown anchored to a tiny
                  pill chip in the conversation pane. Replaces the prior
                  32px-tall always-on row that ate real estate. Click
                  the chip → drops the 3 options as an absolute panel.
                  Auto-closes on selection or backdrop tap. */}
              {isOnChat && (
                <ChatSubToggleDropdown
                  current={chatSubThread}
                  onSelect={(s) => setChatSubThread(s)}
                  clientUnread={inquiry.unreadPrivate}
                  groupUnread={inquiry.unreadGroup}
                />
              )}
              {/* Slice M wiring (item #6): originating pitch context.
                  Renders only when this inquiry was generated from a
                  Pitch (inquiry.pitchId is set). Sits at the top of
                  the Chat content; clicking deep-links to the pitch
                  page. */}
              {isOnChat && inquiry.pitchId && (
                <div style={{ padding: "44px 12px 4px" }}>
                  <PitchOriginCard
                    tenantSlug={effectiveTenant.slug}
                    pitchId={inquiry.pitchId}
                    pitchTitle={inquiry.pitchTitle ?? "Pitch"}
                    compact
                  />
                </div>
              )}

              {showClientStream && (
                <AdminMessageStream
                  messages={clientMessages}
                  placeholder={`Reply to ${inquiry.clientName}…`}
                  threadKey={`admin:${inquiry.id}:client`}
                  smartReplyContext={adminSmartCtx}
                  firstTimeClientName={isFirstConvWith(inquiry.clientName) ? inquiry.clientName : undefined}
                  closed={inquiry.stage === "rejected" || inquiry.stage === "expired"}
                  closedNotice={inquiry.stage === "rejected"
                    ? "Closed · the client passed on this offer."
                    : "Closed · auto-expired (no client response in the window)."}
                  inquiryId={inquiry.id}
                  tenantSlug={effectiveTenant.slug}
                  threadType="private"
                />
              )}
              {showGroupStream && (
                <AdminMessageStream
                  messages={talentMessages}
                  placeholder="Message talent group…"
                  threadKey={`admin:${inquiry.id}:talent`}
                  smartReplyContext={adminSmartCtx}
                  closed={inquiry.stage === "rejected" || inquiry.stage === "expired"}
                  closedNotice={inquiry.stage === "rejected"
                    ? "Closed · the client passed on this project."
                    : "Closed · auto-expired."}
                  inquiryId={inquiry.id}
                  tenantSlug={effectiveTenant.slug}
                  threadType="group"
                />
              )}
              {showDmStream && (
                <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
                  DM threads land here in a later slice. Pick a participant from
                  the Lineup tab to start a 1:1 conversation.
                </div>
              )}
            </>
          );
        })()}
        {/* Slice B: new universal Lineup tab — DB-backed roster manager */}
        {activeTab === "lineup" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
            <LiveLineupPanel inquiryId={inquiry.id} />
          </div>
        )}
        {activeTab === "offer" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <OfferTab conv={{ id: inquiry.id } as Conversation} pov={{ kind: "admin" }} />
          </div>
        )}
        {/* Slice B: legacy "logistics" + "payment" route to Event tab */}
        {(activeTab === "logistics" || activeTab === "payment") && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <LogisticsTab inquiry={toInquiry(inquiry)} pov="admin" />
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
        data={deriveAdminStatusSheetData(inquiry, stageBucket, allTalents, offerLabel)}
      />
    </div>
  );
}

/** Derive the 4-family status data for the admin Status sheet. Keeps
 *  the per-pov mapping co-located with the caller; talent + client
 *  shells get their own derivers when wired. */
export function deriveAdminStatusSheetData(
  inquiry: RichInquiry,
  stageBucket: "inquiry" | "hold" | "booked" | "past",
  allTalents: Array<{ name: string; status: string }>,
  offerLabel: string | null,
): StatusSheetData {
  const stage: StatusSheetData["stage"] =
      stageBucket === "inquiry" ? "Inquiry"
    : stageBucket === "hold" ? "Offer sent"
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
          offerStatus === "No offer" ? "Draft offer when lineup is set."
        : offerStatus === "Draft" ? "Send to client."
        : offerStatus === "Sent" ? "Awaiting client response."
        : offerStatus === "Accepted" ? "Offer locked — proceed to event."
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
          paymentStatus === "Not requested" ? "Send payment request once booked."
        : paymentStatus === "Requested" ? "Awaiting client payment."
        : paymentStatus === "Paid" ? "Cleared. Payout pending."
        : undefined,
    },
    nextStep:
        stage === "Inquiry" ? "Build the shortlist and confirm talent rates."
      : stage === "Offer sent" ? "Client is reviewing the offer."
      : stage === "Booked" ? "Production planning — open the Event tab."
      : stage === "Wrapped" ? "Booking closed. Settle payouts."
      : undefined,
  };
}
