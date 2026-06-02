"use client";

import React, { useTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CoordRequestSheet } from "@/components/coord-request/CoordRequestSheet";
import { StatusSheet, type StatusSheetData } from "@/components/messages-status-sheet/StatusSheet";
import { DetailsTabContainer } from "@/components/details-tab/DetailsTabContainer";
import { MobileShellStyles } from "@/components/messages-mobile/MobileShellStyles";
import { PitchOriginCard } from "@/components/pitch-origin/PitchOriginCard";
import { ReservationThread, type ReservationStage, type PillDescriptor, type PillKind, type SheetDescriptor } from "@/components/reservation-thread";
import { acceptInquiryInvitation, declineInquiryInvitation, respondToInquiryOffer } from "@/lib/server-actions/talent-pipeline";
import { useAdminShell, FONTS, COLORS } from "../state";
import { MOCK_CONVERSATIONS, MOCK_THREAD, type Conversation } from "../talent";
import { AdminReservationView } from "./admin-3";
import { TakeHomeCard } from "./client-1";
import { consumePendingThreadTab, pinNextThreadTab } from "./conversation-stash";
import { currentTalentId } from "./messages-shared";
import { ParticipantTrustStrip, StageProgress } from "./shared/inbox-identity-1";
import { TALENT_RATE_FOR_CONV } from "./shared/inbox-layout-1";
import { buildInquiryTabs, convToInquiry } from "./shared/machinery-1";
import { MOCK_OFFER_FOR_CONV } from "./shared/machinery-10";
import { LiveLineupPanel } from "./shared/machinery-11";
import { OfferTab } from "./shared/machinery-12";
import { FilesTab, TeamStrip } from "./shared/machinery-15";
import { ConversationTab } from "./shared/machinery-16";
import { TalentBookingTab } from "./shared/machinery-2";
import { TalentLogisticsTab, TalentPaymentTab } from "./shared/machinery-5";
import { ShellNextActionBar, resolveShellAction } from "./shared/machinery-6";
import { DetailsPanel } from "./shared/machinery-7";
import { PageTopThread } from "./shared/machinery-8";
import type { ChatSubThreadId, ThreadTabId } from "./shared/machinery-8";
import { ChatSubToggleDropdown, MOCK_FILES_FOR_CONV, ThreadTabBar, isTalentCoordOnOffer, talentCoordCombinedTotal } from "./shared/machinery-9";
import type { Offer } from "./shared/machinery-9";
import { LineupTabPanel, TalentJobShellHeader } from "./talent-1";
// ── Talent JOB DETAIL — the heart of the talent shell ──
// Layout (top-down): unified header → tabs → conversation
export function TalentJobDetail({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { toast, effectiveTenant } = useAdminShell();
  const router = useRouter();
  // C4 — capture pending to no-op duplicate clicks during in-flight
  // Accept / Decline. Double-tap was firing two engine calls + producing
  // confusing "Inquiry accepted" + "version_conflict" toast pairs.
  const [invitePending, startTalentInviteTransition] = useTransition();
  const yourRate = TALENT_RATE_FOR_CONV[conv.id] ?? "—";

  /* Phase A PR 3 — talent re-skin onto the ReservationThread primitive,
   * behind the same `?rt=1` flag as admin (PR 2). Decision is computed
   * at the top with all the other hooks; conditional return happens
   * AFTER the existing hook list so Rules of Hooks stays satisfied. */
  const searchParams = useSearchParams();
  const useReservationThread = searchParams?.get("rt") === "1";

  // Talent permission model:
  //   • Booking team = native — they're invited so they see it
  //   • Client thread = visible only when Marta IS the coordinator
  //   • Files / Details = always visible
  // Source-of-truth: conv.iAmCoordinator (set in MOCK_CONVERSATIONS).
  // For c7 (Solstice fire show) and c10 (Atelier Noir bridal) Marta
  // runs her own workspace and brokers the client directly.
  const isCoordinator = conv.iAmCoordinator === true;
  // Default tab — coord-talents on inquiry/hold start on the client
  // thread (they need to see what the client just said). Booked stage
  // shifts to logistics-heavy work, so booking team is the right default.
  // Non-coord talents: always booking team (they can't see client).
  //
  // External callers (Today "Next on the calendar", booking-row clicks,
  // etc.) can override this via pinNextThreadTab — when they pin a
  // booked conversation and request the "logistics" tab, that beats
  // the stage-default. One-shot consumption so a refresh resets to the
  // stage-appropriate default.
  // Slice C (Messages consolidation v2): talent lands on the unified
  // Chat tab. Coord-talents default sub-thread is Client (the sales
  // surface they're managing); plain talent default is Group. The
  // legacy pinned-tab override still works for deep-links.
  const defaultTab: ThreadTabId = (() => {
    const pinned = consumePendingThreadTab();
    if (pinned) {
      // Map legacy IDs to v2 IDs so deep-links keep working.
      const p = pinned as string;
      if (p === "client" || p === "talent") return "chat";
      if (p === "booking" || p === "details" || p === "logistics") return "event";
      return pinned as ThreadTabId;
    }
    return "chat";
  })();
  const defaultSubThread: ChatSubThreadId = isCoordinator ? "client" : "group";
  const [activeTab, setActiveTab] = useState<ThreadTabId>(defaultTab);
  const [chatSubThread, setChatSubThread] = useState<ChatSubThreadId>(defaultSubThread);
  // Slice G (Messages consolidation v2): coordinator-request sheet
  // state. Opens when a plain talent taps the locked Client sub-toggle.
  const [coordRequestOpen, setCoordRequestOpen] = useState(false);
  // Slice P wiring: Status sheet state — opens when the user taps the
  // header status pill. Shows the 4-family status breakdown.
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  // Single shared lineup-drawer state — both the conversation team
  // strip AND the Details tab's "Who's on this job" trigger this same
  // drawer so we never have two divergent representations of the same
  // lineup data on screen.
  //
  // S0.3 RETIREMENT: lineup drawer no longer rendered. All open-triggers
  // call setActiveTab("lineup") directly so the working LiveLineupPanel
  // (DB-backed) is the single source of truth for lineup management.
  const openLineupTab = () => setActiveTab("lineup");
  const fileCount = (MOCK_FILES_FOR_CONV[conv.id] ?? []).length;
  const messages = MOCK_THREAD[conv.id] ?? [];
  const talentGroupUnread = messages.filter(m => m.kind === "text").length > 0 ? Math.min(3, conv.unreadCount) : 0;

  // Phase A PR 3 — defer to new primitive when flag is on. Placed AFTER
  // all hooks (above) so React Hooks order is stable across renders.
  if (useReservationThread) {
    return (
      <TalentReservationView
        conv={conv}
        onBack={onBack}
        isCoordinator={isCoordinator}
        yourRate={yourRate}
        fileCount={fileCount}
      />
    );
  }

  return (
    <div data-msg-shell style={{
      padding: 16, fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
      // Fill the parent's available height so the inner tab content
      // can be flex:1 and own its own scroll. Without this the whole
      // shell scrolled together — header + funnel + tabs + composer
      // disappeared as the user read down the message stream.
      height: "100%", minHeight: 0,
    }}>
      <MobileShellStyles />
      {/* Unified header — replaces PageTopThread + StageProgress +
          ParticipantTrustStrip + TakeHomeCard. One band, three pieces of
          chrome (back+title, take-home chip, status pill) and a slim
          inline funnel beneath. Trust badges move to the Details rail. */}
      <TalentJobShellHeader
        conv={conv}
        yourRate={yourRate}
        onBack={onBack}
        coordCommissionLabel={(() => {
          // Item #17 wiring: when this talent is also a coordinator on
          // the same offer they earn BOTH lanes. Surface the coord
          // share inline with the rate so the header chip reads
          // "Your line: €X · +€Y coord".
          if (!isCoordinator) return null;
          const offer = MOCK_OFFER_FOR_CONV[conv.id];
          if (!offer) return null;
          const myTalentId = currentTalentId();
          if (!isTalentCoordOnOffer(offer, myTalentId)) return null;
          const combined = talentCoordCombinedTotal(offer, myTalentId);
          const talentRow = offer.rows.find((r) => r.talentId === myTalentId);
          if (!talentRow) return null;
          const talentPayout = talentRow.units * talentRow.costRate;
          const coordShare = combined - talentPayout;
          // Format using the same currency as the talent rate.
          const currency = yourRate.match(/[€£$]/)?.[0] ?? "€";
          return `+${currency}${Math.round(coordShare).toLocaleString()} coord`;
        })()}
        onStatusClick={() => setStatusSheetOpen(true)}
        toast={toast}
      />

      {/* TAB BAR — Conversation | Offer | Files | Details (no Client thread for talent) */}
      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", // Anchor for the floating ChatSubToggleDropdown switch.
        position: "relative" }} className="rounded-admin-md">
        <ThreadTabBar
          activeId={activeTab}
          onSelect={setActiveTab}
          tabs={buildInquiryTabs({
            status: conv.stage === "booked" || conv.stage === "past" ? "booked" : "inquiry",
            pov: isCoordinator ? "talent_coord" : "talent",
            unread: { talent: talentGroupUnread, files: fileCount },
            paymentDue: conv.stage === "booked",
          })}
        />
        {/* Slice C (Messages consolidation v2): unified Chat tab with
            [Client | Group | DM] sub-toggle. Plain talent: Client is
            locked (Slice G adds the request-to-join flow); Group is
            the default. Coord-talent: all 3 unlocked. */}
        {(activeTab === "chat" || activeTab === "talent" || activeTab === "client") && (() => {
          // Resolve effective sub-thread from chat-state OR legacy tab id.
          const effSub: ChatSubThreadId =
            activeTab === "talent" ? "group"
            : activeTab === "client" ? "client"
            : chatSubThread;
          const showClient = effSub === "client";
          const showGroup = effSub === "group";
          const showDm = effSub === "dm";
          return (
            <>
              {activeTab === "chat" && (
                <ChatSubToggleDropdown
                  current={chatSubThread}
                  onSelect={(s) => setChatSubThread(s)}
                  groupUnread={talentGroupUnread}
                  lockClient={!isCoordinator}
                  onLockedClick={() => setCoordRequestOpen(true)}
                />
              )}
              {/* Item #12 wiring: pitch-origin context. Renders on the
                  talent Chat tab when this conv came from a Pitch.
                  Conversation type doesn't carry pitchId today —
                  surface stays hidden until pitchId is plumbed onto
                  conv (or a sibling field is added). */}
              {activeTab === "chat" && (conv as Conversation & { pitchId?: string }).pitchId && (
                <div style={{ padding: "44px 12px 4px" }}>
                  <PitchOriginCard
                    tenantSlug={effectiveTenant.slug}
                    pitchId={(conv as Conversation & { pitchId?: string }).pitchId as string}
                    pitchTitle={(conv as Conversation & { pitchTitle?: string }).pitchTitle ?? "Pitch"}
                    compact
                  />
                </div>
              )}
              {showGroup && (
                <ConversationTab
                  conv={conv}
                  threadKey={`${conv.id}:talent`}
                  placeholder="Message booking team…"
                  crossThreadBridge={!isCoordinator ? { who: conv.leader.name, clientName: conv.client } : undefined}
                  povCanEditLineup={isCoordinator}
                  povCanSeeOffers={isCoordinator}
                  povCanSeeCoordNote={true}
                  mode="chat"
                />
              )}
              {showClient && isCoordinator && (
                <ConversationTab
                  conv={conv}
                  threadKey={`${conv.id}:client`}
                  placeholder={`Message ${conv.client}…`}
                  povCanEditLineup={isCoordinator}
                  povCanSeeOffers={isCoordinator}
                  povCanSeeCoordNote={true}
                />
              )}
              {/* "Activity" sub-tab (repurposed from the retired fake DM):
                  the job's money/booking timeline — offer → payment → booking
                  — as read-only timestamped cards. Same underlying group thread
                  as Chat, filtered to event cards so Chat stays conversation. */}
              {showDm && (
                <ConversationTab
                  conv={conv}
                  threadKey={`${conv.id}:talent`}
                  placeholder=""
                  povCanEditLineup={isCoordinator}
                  povCanSeeOffers={isCoordinator}
                  povCanSeeCoordNote={false}
                  mode="activity"
                />
              )}
            </>
          );
        })()}
        {/* Slice C: universal Lineup tab. The original implementation
            rendered a misleading "Tap a teammate below" copy with a
            standalone "Open lineup drawer" button — the teammates
            lived in a separate modal, not "below". Now the tab auto-
            opens the lineup surface as the user lands on it, and the
            tab body is a thin fallback in case the drawer didn't open
            (e.g. legacy mock conv where the drawer effect is gated). */}
        {activeTab === "lineup" && (
          <LineupTabPanel onOpen={openLineupTab} />
        )}
        {/* Non-conversation tabs — each gets its own scrollable
            wrapper so the parent shell stays fixed (header + tab bar
            + action bar) and only the tab body scrolls. */}
        {activeTab === "offer" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <OfferTab conv={conv} pov={{ kind: "talent", talentId: currentTalentId(), isCoordinator }} />
          </div>
        )}
        {/* Logistics — admin/client only. For talent we render the
            merged "booking" tab (combines what used to be split across
            logistics + details). */}
        {activeTab === "logistics" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <TalentLogisticsTab conv={conv} inquiry={convToInquiry(conv)} />
          </div>
        )}
        {activeTab === "files" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <FilesTab conv={conv} povCanSeeTalentFiles={true} pov="talent" />
          </div>
        )}
        {activeTab === "payment" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <TalentPaymentTab conv={conv} yourRate={yourRate} />
          </div>
        )}
        {/* Details v3 (plan §10): canonical 9-section <DetailsTab> is
            the sole content surface for real-UUID inquiries on the
            talent shell. The legacy DetailsPanel was a strict subset
            of DetailsTab's sections (Job Brief + Schedule + Location
            + People). For mock convs (no DB row), fall back to the
            legacy panels. For booked stage we still render
            TalentBookingTab below — it adds a live countdown + lineup
            snapshot that DetailsTab doesn't replicate.

            JSX-regex parens are load-bearing (`{/^...` collides with
            the `{/*` comment-opener token). */}
        {(activeTab === "event" || activeTab === "details" || activeTab === "booking") && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(conv.id) ? (
              <>
                <div style={{ padding: 14 }}>
                  <DetailsTabContainer
                    inquiryId={conv.id}
                    pov={isCoordinator ? "talent_coord" : "talent"}
                  />
                </div>
                {(conv.stage === "booked" || conv.stage === "past") && (
                  <TalentBookingTab
                    conv={conv}
                    inquiry={convToInquiry(conv)}
                    isCoordinator={isCoordinator}
                    onOpenLineup={openLineupTab}
                  />
                )}
              </>
            ) : conv.stage === "booked" || conv.stage === "past" ? (
              <TalentBookingTab
                conv={conv}
                inquiry={convToInquiry(conv)}
                isCoordinator={isCoordinator}
                onOpenLineup={openLineupTab}
              />
            ) : (
              <DetailsPanel
                inquiry={convToInquiry(conv)}
                pov={isCoordinator ? "talent_coord" : "talent"}
              />
            )}
          </div>
        )}
      </div>
      {/* Action bar — single bottom surface for "what do I do next".
          Was previously suppressed when an in-thread pin showed the
          same prompt; pins are gone now (replaced by TeamStrip), so
          the bar is the canonical action surface across all tabs. */}
      <ShellNextActionBar {...(() => {
        // Wrap resolveShellAction to route the talent invite-stage Accept/
        // Decline path through real engine actions for real-UUID inquiries.
        // Mock conv ids stay disabled: there is no durable invitation row to
        // accept or decline.
        const baseAction = resolveShellAction(
          conv,
          isCoordinator ? "talent_coord" : "talent",
          toast,
          { onOpenOffer: () => setActiveTab("offer") },
        );
        const isRealUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
        const isMockConv = !!MOCK_OFFER_FOR_CONV[conv.id];
        // conv.stage === "hold" maps to inquiry status `offer_pending` (the
        // offer round is open). There the talent's action is to APPROVE THE
        // OFFER — flipping their `inquiry_approvals` row, the missing half of
        // the multi-party gate. conv.stage === "inquiry" is the pre-offer
        // roster invite (accept/decline the shortlist).
        const offerStage  = !isCoordinator && conv.stage === "hold"    && !isMockConv;
        const inviteStage = !isCoordinator && conv.stage === "inquiry" && !isMockConv;
        if (!isRealUuid || (!offerStage && !inviteStage)) return baseAction;
        if (offerStage) {
          // Audit #12 — the talent has already approved THIS offer. The
          // multi-party gate keeps the inquiry open (offer_pending/approved)
          // until every party approves, which previously left the "Approve
          // offer" button re-showing — a confusing idempotent re-click.
          // Suppress it and show an awaiting state; keep Decline so the
          // talent can still withdraw before the coordinator converts.
          if (conv.myApprovalStatus === "accepted") {
            return {
              ...baseAction,
              hint: "You approved this offer — awaiting the other parties.",
              primary: undefined,
              secondary: {
                label: "Decline",
                tone: "ghost",
                disabled: invitePending,
                onClick: () => {
                  if (invitePending) return;
                  startTalentInviteTransition(async () => {
                    const r = await respondToInquiryOffer(conv.id, "rejected");
                    if (!r.ok) toast(`Decline failed: ${r.error}`);
                    else { toast("Offer declined"); router.refresh(); }
                  });
                },
              },
            };
          }
          return {
            ...baseAction,
            hint: "You've received an offer. Approve to lock your booking, or decline.",
            primary: {
              label: "Approve offer",
              tone: "success",
              disabled: invitePending,
              onClick: () => {
                if (invitePending) return;
                startTalentInviteTransition(async () => {
                  const r = await respondToInquiryOffer(conv.id, "accepted");
                  if (!r.ok) toast(`Approve failed: ${r.error}`);
                  else { toast("Offer approved"); router.refresh(); }
                });
              },
            },
            secondary: {
              label: "Decline",
              tone: "ghost",
              disabled: invitePending,
              onClick: () => {
                if (invitePending) return;
                startTalentInviteTransition(async () => {
                  const r = await respondToInquiryOffer(conv.id, "rejected");
                  if (!r.ok) toast(`Decline failed: ${r.error}`);
                  else { toast("Offer declined"); router.refresh(); }
                });
              },
            },
          };
        }
        return {
          ...baseAction,
          primary: baseAction.primary ? {
            ...baseAction.primary,
            disabled: invitePending,
            onClick: () => {
              if (invitePending) return;
              startTalentInviteTransition(async () => {
                const r = await acceptInquiryInvitation(conv.id);
                if (!r.ok) toast(`Accept failed: ${r.error}`);
                else { toast("Inquiry accepted"); router.refresh(); }
              });
            },
          } : baseAction.primary,
          secondary: baseAction.secondary ? {
            ...baseAction.secondary,
            disabled: invitePending,
            onClick: () => {
              if (invitePending) return;
              startTalentInviteTransition(async () => {
                const r = await declineInquiryInvitation(conv.id);
                if (!r.ok) toast(`Decline failed: ${r.error}`);
                else { toast("Inquiry declined"); router.refresh(); }
              });
            },
          } : baseAction.secondary,
        };
      })()} />
      {/* LineupDrawer retired (S0.3). All open-triggers now route to
          setActiveTab("lineup") so the canonical Lineup tab
          (LiveLineupPanel) handles add/remove/swap. Drawer component
          retained as dead code until follow-up purge confirms no
          residual references. */}
      {/* Slice G (Messages consolidation v2): coordinator-request
          sheet. Opens when a plain talent taps the locked Client
          sub-toggle. Engine RPCs from Slice F do the work. */}
      {coordRequestOpen && (
        <CoordRequestSheet
          inquiryId={conv.id}
          onClose={() => setCoordRequestOpen(false)}
        />
      )}
      {/* Slice P wiring (talent): Status sheet — opens from the header
          status pill. Derives a simplified 4-family status view from
          the conversation's current state. */}
      <StatusSheet
        open={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        data={deriveTalentStatusSheetData(conv, yourRate)}
      />
    </div>
  );
}

/** Derive the 4-family status data for the talent Status sheet. Simpler
 *  than the admin variant — no offer builder state, just the talent's own
 *  participation and pay. */
export function deriveTalentStatusSheetData(
  conv: Conversation,
  yourRate: string,
): StatusSheetData {
  const stage: StatusSheetData["stage"] =
      conv.stage === "inquiry" ? "Inquiry"
    : conv.stage === "hold" ? "Offer sent"
    : conv.stage === "booked" ? "Booked"
    : conv.stage === "past" ? "Wrapped"
    : "Inquiry";

  const offerStatus: StatusSheetData["offer"]["status"] =
      stage === "Inquiry" ? "No offer"
    : stage === "Offer sent" ? "Sent"
    : stage === "Booked" ? "Accepted"
    : stage === "Wrapped" ? "Accepted"
    : "No offer";

  const paymentStatus: StatusSheetData["payment"]["status"] =
      stage === "Wrapped" ? "Paid"
    : stage === "Booked" ? "Requested"
    : "Not requested";

  const hasRate = yourRate && yourRate !== "—";

  return {
    stage,
    offer: {
      status: offerStatus,
      totalLabel: hasRate ? yourRate : undefined,
      nextAction:
          offerStatus === "No offer" ? "Waiting for an offer from the coordinator."
        : offerStatus === "Sent" ? "Review the offer details in the Offer tab."
        : offerStatus === "Accepted" ? "Offer accepted — check the Event tab for details."
        : undefined,
    },
    talents: [{ name: "You", status: "Accepted" }],
    payment: {
      status: paymentStatus,
      amountLabel: hasRate ? yourRate : undefined,
      nextAction:
          paymentStatus === "Not requested" ? "Payment will be requested after booking is confirmed."
        : paymentStatus === "Requested" ? "Payment is being processed."
        : paymentStatus === "Paid" ? "Payment cleared."
        : undefined,
    },
    nextStep:
        stage === "Inquiry" ? "Wait for the coordinator to set the offer."
      : stage === "Offer sent" ? "Review the offer and accept or decline."
      : stage === "Booked" ? "Job is confirmed — check the Event tab."
      : stage === "Wrapped" ? "Job complete. Payment settled."
      : undefined,
  };
}

/* ─── TalentReservationView ─────────────────────────────────────────
 * Phase A PR 3 — talent POV rendered through <ReservationThread>.
 * Mirrors AdminReservationView's pattern but with the talent-flavored
 * pills and the Accept / Decline action row when the talent is at
 * invite stage and hasn't responded yet. Hold isn't surfaced (engine
 * has no hold path today — talent can accept or decline only).
 */
export function TalentReservationView({
  conv, onBack, isCoordinator, yourRate, fileCount,
}: {
  conv: Conversation;
  onBack: () => void;
  isCoordinator: boolean;
  yourRate: string;
  fileCount: number;
}) {
  const { toast } = useAdminShell();
  const router = useRouter();
  // C4 — capture pending to no-op duplicate clicks on Accept/Decline.
  const [invitePending, startInviteTxn] = useTransition();
  void onBack;

  const stage: ReservationStage =
      conv.stage === "inquiry" ? "inquiry"
    : conv.stage === "hold"    ? "offer"      // hold = the offer round is open
    : conv.stage === "booked"  ? "booked"
    : conv.stage === "past"    ? "wrapped"
    : "inquiry";

  const closedReason =
      conv.stage === "cancelled" ? "This was cancelled."
    : conv.stage === "past" && conv.outcome === "talent_declined" ? "You declined this job."
    : conv.stage === "past" && conv.outcome === "client_rejected" ? "The client passed on this offer."
    : conv.stage === "past" && conv.outcome === "completed" ? undefined
    : undefined;

  const offerSnap = MOCK_OFFER_FOR_CONV[conv.id] ?? null;
  const offerStatus: { text: string; tone: PillDescriptor["tone"] } = (() => {
    if (!offerSnap) {
      return { text: yourRate === "—" ? "Pending" : `Your cut · ${yourRate}`, tone: "neutral" };
    }
    const total = conv.amountToYou ?? yourRate;
    if (offerSnap.stage === "sent")      return { text: `${total} · awaiting client`, tone: "warn" };
    if (offerSnap.stage === "accepted")  return { text: `${total} · approved`,        tone: "ok" };
    if (offerSnap.stage === "rejected")  return { text: `${total} · declined`,        tone: "alert" };
    if (offerSnap.stage === "countered") return { text: `${total} · countered`,       tone: "warn" };
    return { text: total === "—" ? "In progress" : total, tone: "neutral" };
  })();

  const eventStatus = (() => {
    const parts: string[] = [];
    if (conv.date) parts.push(conv.date);
    if (conv.location) parts.push(String(conv.location).split(",")[0]?.trim() ?? "");
    return parts.filter(Boolean).join(" · ") || "TBC";
  })();

  // Booking-team pill = lineup status (whom you're working with).
  // Conversation carries `participants` (the booking team) — talents don't
  // see acceptance state on others, just the headcount.
  const lineupTotal = (conv.participants ?? []).length;
  const lineupStatus = lineupTotal === 0 ? "Just you" : `${lineupTotal} on the team`;

  const pills: PillDescriptor[] = [
    {
      kind: "lineup",
      label: "Booking team",
      status: lineupStatus,
      tone: "neutral",
    },
    {
      kind: "offer",
      label: "Offer",
      status: offerStatus.text,
      tone: offerStatus.tone,
    },
    {
      kind: "event",
      label: "Details",
      status: eventStatus,
      tone: "neutral",
    },
    {
      kind: "files",
      label: "Files",
      status: fileCount === 0 ? "" : String(fileCount),
      tone: "neutral",
    },
  ];

  const sheets: Partial<Record<PillKind, SheetDescriptor>> = {
    lineup: {
      kind: "lineup",
      title: "Who's on this job",
      content: (
        <div style={{ margin: -14 }}>
          <TalentBookingTab
            conv={conv}
            inquiry={convToInquiry(conv)}
            isCoordinator={isCoordinator}
            onOpenLineup={() => { /* lineup drawer is rendered at parent level; sheet body handles its own */ }}
          />
        </div>
      ),
    },
    offer: {
      kind: "offer",
      title: "Your offer",
      content: (
        <div style={{ margin: -14 }}>
          <OfferTab conv={conv} pov={{ kind: "talent", talentId: currentTalentId(), isCoordinator }} />
        </div>
      ),
    },
    event: {
      kind: "event",
      title: "Event details",
      content: (
        <div style={{ margin: -14 }}>
          <TalentLogisticsTab conv={conv} inquiry={convToInquiry(conv)} />
        </div>
      ),
    },
    files: {
      kind: "files",
      title: "Files",
      content: (
        <div style={{ margin: -14 }}>
          <FilesTab conv={conv} povCanSeeTalentFiles={true} pov="talent" />
        </div>
      ),
    },
  };

  // Action row — Accept / Decline when talent is at invite stage on a
  // real DB-backed inquiry (mock convs stay disabled / no engine path).
  const isRealUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
  const inviteStage = !isCoordinator
    && (conv.stage === "inquiry" || conv.stage === "hold")
    && !offerSnap;
  const actionRow = (isRealUuid && inviteStage) ? [
    {
      id: "accept",
      label: "Accept",
      emphasis: "primary" as const,
      preamble: `Coordinator invited you. Take this job, or decline.`,
      disabled: invitePending,
      onClick: () => {
        if (invitePending) return;
        startInviteTxn(async () => {
          const r = await acceptInquiryInvitation(conv.id);
          if (!r.ok) toast(`Accept failed: ${r.error}`);
          else { toast("Inquiry accepted"); router.refresh(); }
        });
      },
    },
    {
      id: "decline",
      label: "Decline",
      emphasis: "danger" as const,
      disabled: invitePending,
      onClick: () => {
        if (invitePending) return;
        if (!confirm("Decline this invite?")) return;
        startInviteTxn(async () => {
          const r = await declineInquiryInvitation(conv.id);
          if (!r.ok) toast(`Decline failed: ${r.error}`);
          else { toast("Inquiry declined"); router.refresh(); }
        });
      },
    },
  ] : null;

  // Stream = canonical talent group thread (the booking team channel).
  // ConversationTab embeds its own composer.
  const stream = (
    <ConversationTab
      conv={conv}
      threadKey={`${conv.id}:talent`}
      placeholder="Message booking team…"
      crossThreadBridge={!isCoordinator ? { who: conv.leader.name, clientName: conv.client } : undefined}
      povCanEditLineup={isCoordinator}
      povCanSeeOffers={isCoordinator}
      povCanSeeCoordNote={true}
    />
  );

  return (
    <ReservationThread
      pov={isCoordinator ? "talent_coord" : "talent"}
      header={{
        title: conv.brief || conv.client,
        subtitle: [conv.client, eventStatus].filter(Boolean).join(" · "),
        stage,
        closedReason,
        // No move-to menu for talent — talent never drives stage transitions.
      }}
      pills={pills}
      sheets={sheets}
      stream={stream}
      composer={<div style={{ display: "none" }} />}
      actionRow={actionRow}
    />
  );
}
