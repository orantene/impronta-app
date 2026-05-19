"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { OfferCard, PaymentRequestCard, CoordinatorRequestCard, TalentRateCard, CallSheetUpdateCard, SystemEventCard, SuggestedTalentCard } from "@/components/chat-cards/ChatCard";
import { adminAddSuggestedTalent } from "@/lib/server-actions/admin-suggested-talent";
import { ReservationThread, type ReservationStage, type PillDescriptor, type PillKind, type SheetDescriptor } from "@/components/reservation-thread";
import { quickPatchInquiryStatus } from "@/lib/server-actions/admin-inquiries";
import { convertInquiryToBookingAction } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, toInquiry, type RichInquiry } from "../state";
import { MOCK_THREAD, type Conversation } from "../talent";
import { NEXT_STAGES, StageTransitionMenu } from "./admin-1";
import { AdminInquiryDetail } from "./admin-2";
import { AdminMessageStream } from "./admin-4";
import { isFirstConvWith } from "./shared/inbox-identity-1";
import { LiveLineupPanel } from "./shared/machinery-11";
import { OfferTab } from "./shared/machinery-12";
import { LiveBookingActions, resolveFileKey } from "./shared/machinery-14";
import { FilesTab } from "./shared/machinery-15";
import { ConversationTab } from "./shared/machinery-16";
import { AdminBookingTab } from "./shared/machinery-5";
import { LogisticsTab } from "./shared/machinery-6";
import { MOCK_FILES_FOR_CONV } from "./shared/machinery-9";
import type { Offer } from "./shared/machinery-9";


/* ─── AdminReservationView ──────────────────────────────────────────
 * Phase A PR 2 — admin POV rendered through <ReservationThread>.
 * Behind `?rt=1` flag inside AdminInquiryDetail. The legacy detail UI
 * remains unchanged when the flag is off.
 *
 * Strategy: keep this lean. Pills carry status; sheets wrap the existing
 * tab components (OfferTab, FilesTab, LogisticsTab, AdminBookingTab,
 * LiveLineupPanel) so we don't fork rendering logic for v1. As each
 * sheet's content gets a proper redesign in follow-up PRs, we replace
 * its inner body, not the shell.
 */
export function AdminReservationView({ inquiry, onBack }: { inquiry: RichInquiry; onBack: () => void }) {
  const { effectiveTenant } = useAdminShell();
  const planTier = usePlanTierFromShell();
  void effectiveTenant; // reserved for future server-action calls inside sheets

  const allTalents = inquiry.requirementGroups.flatMap(g => g.talents);
  const lineupTotal = allTalents.length;
  const lineupAccepted = allTalents.filter(t => t.status === "accepted").length;
  const lineupPending = allTalents.filter(t => t.status === "pending").length;
  const fileCount = (MOCK_FILES_FOR_CONV[resolveFileKey(inquiry.id)] ?? []).length;
  const inquiryR = toInquiry(inquiry);

  // Pipeline stage mapping (admin uses the same 5-step strip as client/talent).
  const stage: ReservationStage =
    inquiry.stage === "draft" || inquiry.stage === "submitted" ? "inquiry"
    : inquiry.stage === "coordination" ? "review"
    : inquiry.stage === "offer_pending" ? "offer"
    : inquiry.stage === "approved" || inquiry.stage === "booked" ? "booked"
    : inquiry.stage === "rejected" || inquiry.stage === "expired" ? "wrapped"
    : "inquiry";

  const closedReason =
    inquiry.stage === "rejected" ? "This inquiry was declined."
    : inquiry.stage === "expired" ? "This inquiry expired."
    : undefined;

  // Offer summary for pill status.
  const offerStatus: { text: string; tone: PillDescriptor["tone"] } = (() => {
    if (!inquiry.offer) return { text: "Not started", tone: "neutral" };
    const o = inquiry.offer;
    if (o.status === "draft")     return { text: `Draft · ${o.total}`,            tone: "neutral" };
    if (o.status === "sent")      return { text: `${o.total} · awaiting client`,  tone: "warn" };
    if (o.status === "accepted")  return { text: `${o.total} · approved`,         tone: "ok" };
    if (o.status === "rejected")  return { text: `${o.total} · declined`,         tone: "alert" };
    return { text: o.total, tone: "neutral" };
  })();

  const eventStatus = (() => {
    const parts: string[] = [];
    if (inquiry.date) parts.push(inquiry.date);
    if (inquiry.location) parts.push(String(inquiry.location).split(",")[0]?.trim() ?? "");
    return parts.filter(Boolean).join(" · ") || "TBC";
  })();

  const lineupStatus = lineupTotal === 0
    ? "Empty"
    : `${lineupAccepted}/${lineupTotal} accepted${lineupPending > 0 ? ` · ${lineupPending} pending` : ""}`;

  const pills: PillDescriptor[] = [
    {
      kind: "lineup",
      label: "Lineup",
      status: lineupStatus,
      tone: lineupTotal === 0 ? "neutral" : lineupAccepted === lineupTotal ? "ok" : "warn",
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
    {
      kind: "team",
      label: "Team",
      status: inquiry.coordinator?.name ?? "Unassigned",
      tone: inquiry.coordinator ? "neutral" : "warn",
    },
  ];

  const sheets: Partial<Record<PillKind, SheetDescriptor>> = {
    lineup: {
      kind: "lineup",
      title: "Lineup",
      content: <LiveLineupPanel inquiryId={inquiry.id} />,
    },
    offer: {
      kind: "offer",
      title: "Offer",
      content: (
        <div style={{ margin: -14 }}>
          <OfferTab conv={{ id: inquiry.id } as Conversation} pov={{ kind: "admin" }} />
        </div>
      ),
    },
    event: {
      kind: "event",
      title: "Event details",
      content: (
        <div style={{ margin: -14 }}>
          <LogisticsTab inquiry={inquiryR} pov="admin" />
        </div>
      ),
    },
    files: {
      kind: "files",
      title: "Files",
      content: (
        <div style={{ margin: -14 }}>
          <FilesTab conv={{ id: inquiry.id } as Conversation} povCanSeeTalentFiles={true} />
        </div>
      ),
    },
    team: {
      kind: "team",
      title: "Team & coordination",
      content: (
        <div style={{ margin: -14 }}>
          <AdminBookingTab inquiry={inquiryR} planTier={planTier} />
          <LiveBookingActions inquiryId={inquiry.id} inquiryStage={inquiry.stage} />
        </div>
      ),
    },
  };

  // Stage transition menu — keep the existing dropdown component
  // by wrapping its handler into the new header's `moveToMenu`.
  // For v1 we just link out to the legacy menu instance via a
  // hidden span anchor.
  const moveToMenu = useStageTransitionMenuForReservation(inquiry.id, inquiry.stage);

  // Stream = client thread for v1. Talent group goes inside the Team
  // sheet in a future PR; for now the existing AdminBookingTab handles
  // most of that affordance.
  const clientMessages = inquiry.messages.filter(m => m.threadType === "private");
  const stageBucket: "inquiry" | "hold" | "booked" | "past" =
      inquiry.stage === "draft" || inquiry.stage === "submitted" || inquiry.stage === "coordination" ? "inquiry"
    : inquiry.stage === "offer_pending" ? "hold"
    : inquiry.stage === "approved" || inquiry.stage === "booked" ? "booked"
    : "past";
  const smartCtx = stageBucket === "inquiry" ? "inquiry"
    : stageBucket === "hold" ? "hold"
    : stageBucket === "booked" ? "offer"
    : "default";

  const stream = (
    <AdminMessageStream
      messages={clientMessages}
      placeholder={`Reply to ${inquiry.clientName}…`}
      threadKey={`admin:${inquiry.id}:client`}
      smartReplyContext={smartCtx}
      firstTimeClientName={isFirstConvWith(inquiry.clientName) ? inquiry.clientName : undefined}
      closed={inquiry.stage === "rejected" || inquiry.stage === "expired"}
      closedNotice={inquiry.stage === "rejected"
        ? "Closed · the client passed on this offer."
        : "Closed · auto-expired (no client response in the window)."}
      inquiryId={inquiry.id}
      tenantSlug={effectiveTenant.slug}
      threadType="private"
    />
  );

  // AdminMessageStream embeds its own composer; the primitive's
  // composer slot stays empty.
  return (
    <ReservationThread
      pov="admin"
      header={{
        title: inquiry.brief || inquiry.clientName,
        subtitle: [inquiry.clientName, eventStatus].filter(Boolean).join(" · "),
        stage,
        closedReason,
        moveToMenu,
      }}
      pills={pills}
      sheets={sheets}
      stream={stream}
      composer={
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to inbox"
          style={{
            display: "none",
          }}
        >
          Back
        </button>
      }
    />
  );
}

/** Tiny helper hook that re-exposes the admin shell plan tier in the
 *  form AdminBookingTab expects. Named `use*` per Rules of Hooks since
 *  it calls another hook (useAdminShell). Inline to keep AdminReservationView
 *  self-contained — when the re-skin lands fully we'll fold this. */
export function usePlanTierFromShell(): "free" | "studio" | "agency" | "hub-network" {
  const { state } = useAdminShell();
  return state.plan === "network" ? "hub-network" : state.plan;
}

/** Maps the legacy StageTransitionMenu's options into the new header's
 *  moveToMenu shape. Returns undefined when no transitions are legal
 *  (closed inquiries) — header hides the ⋯ button in that case.
 *  Defers to the same engine pipeline the legacy menu uses
 *  (quickPatchInquiryStatus / convertInquiryToBookingAction) so engine
 *  guards (version, RLS, audit log) fire identically. */
export function useStageTransitionMenuForReservation(
  inquiryId: string,
  stage: RichInquiry["stage"],
): Array<{ id: string; label: string; onClick: () => void; danger?: boolean }> | undefined {
  const router = useRouter();
  const { effectiveTenant, toast } = useAdminShell();
  const transitions = NEXT_STAGES[stage as string] ?? [];
  if (transitions.length === 0) return undefined;
  return transitions.map((t) => ({
    id: t.value,
    label: t.label,
    danger: t.value === "rejected" || t.value === "expired" || t.value === "closed_lost",
    onClick: () => {
      void (async () => {
        try {
          if (t.value === "booked") {
            const r = await convertInquiryToBookingAction(effectiveTenant.slug, inquiryId);
            if (!r.ok) { toast(`Convert failed: ${r.error}`); return; }
            toast("Inquiry booked");
            router.refresh();
            return;
          }
          const fd = new FormData();
          fd.set("inquiry_id", inquiryId);
          fd.set("status", t.value);
          const r = await quickPatchInquiryStatus(fd);
          if (r && "error" in r && r.error) {
            toast(`Stage update failed: ${r.error}`);
            return;
          }
          toast(`Moved to ${t.label.replace(/^Move to /, "").replace(/^Close /, "")}`);
          router.refresh();
        } catch (err) {
          toast(`Stage change failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    },
  }));
}

// Stream renderer for admin. Reads from RichInquiry.messages directly
// (different shape from MOCK_THREAD that ConversationTab consumes), but
// matches ConversationTab's design language: per-bubble sender avatar +
// role tag, day separators, mine/theirs alignment, double-check ts,
// closure-aware footer that swaps the composer for a closed-conv notice
// when the inquiry is past / cancelled / rejected / expired.

/**
 * Item #4 helper: render a typed ChatCard for messages with non-text
 * `message_kind`. Returns null when the kind is unknown — caller falls
 * back to the plain bubble render.
 */
export function renderChatCardForMessage(
  kind: string,
  payload: Record<string, unknown>,
  toast: (s: string) => void,
  ctx?: { inquiryId?: string; messageId?: string },
): React.ReactNode {
  const get = <T,>(k: string, fallback: T): T => (payload[k] as T) ?? fallback;
  switch (kind) {
    case "offer_event": {
      const status = get<"draft" | "sent" | "accepted" | "declined" | "countered">("status", "sent");
      return (
        <OfferCard
          status={status}
          totalLabel={get<string>("total_label", "—")}
          hint={get<string>("hint", "")}
          onOpen={() => toast("Open offer — wire to setActiveTab('offer')")}
        />
      );
    }
    case "payment_request":
      return (
        <PaymentRequestCard
          amountLabel={get<string>("amount_label", "—")}
          status="requested"
          hint={get<string>("hint", "")}
          onPayNow={() => toast("Open Pay-Now sheet — wire on client adapter")}
        />
      );
    case "payment_paid":
      return <PaymentRequestCard amountLabel={get<string>("amount_label", "—")} status="paid" />;
    case "coordinator_request":
      return (
        <CoordinatorRequestCard
          requesterName={get<string>("requester_name", "Someone")}
          pitch={get<string>("pitch", "")}
        />
      );
    case "talent_rate":
      return (
        <TalentRateCard
          talentName={get<string>("talent_name", "Talent")}
          rateLabel={get<string>("rate_label", "—")}
          state={get<"submitted" | "accepted" | "countered" | "pending">("state", "submitted")}
        />
      );
    case "call_sheet_update":
      return (
        <CallSheetUpdateCard
          changedField={get<string>("changed_field", "")}
          byName={get<string>("by_name", "")}
          onOpen={() => toast("Open Details tab — wire to setActiveTab('event')")}
        />
      );
    case "booking_status":
    case "system_event":
      return <SystemEventCard text={get<string>("text", "Status updated")} />;
    case "admin_suggested_talent": {
      // Inquiry-funnel sprint Step 7.
      // TODO (composer-side, follow-up): the picker that lets admin
      // attach a talent + rate to a new message is not yet built —
      // this is the render + click side only.
      const inquiryId = ctx?.inquiryId ?? "";
      const messageId = ctx?.messageId ?? "";
      const talentProfileId = get<string>("talent_profile_id", "");
      const requirementGroupId = get<string>("requirement_group_id", "");
      const status = get<"pending" | "added" | "dismissed">("status", "pending");
      return (
        <SuggestedTalentCard
          talentName={get<string>("talent_name", "Talent")}
          rateLabel={get<string>("rate_label", "")}
          status={status}
          onAddToLineup={
            status === "pending" && inquiryId && talentProfileId
              ? () => {
                  void adminAddSuggestedTalent({
                    inquiryId,
                    talentProfileId,
                    requirementGroupId: requirementGroupId || null,
                    messageId: messageId || null,
                  }).then((r) => {
                    if (r.ok) {
                      toast("Talent added to lineup.");
                    } else {
                      toast(r.error || "Could not add talent.");
                    }
                  });
                }
              : undefined
          }
        />
      );
    }
    default:
      return null;
  }
}
