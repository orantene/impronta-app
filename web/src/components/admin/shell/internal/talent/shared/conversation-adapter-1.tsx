"use client";

import { useMemo } from "react";
import { type TalentInquiryRow } from "../../data-bridge";
import { pinNextConversation as pinNextConversationT } from "../../messages";
import { ClientTrustChip, Icon } from "../../primitives";
import { COLORS, FONTS, INQUIRY_STAGE_META, MY_TALENT_PROFILE, useAdminShell, type ClientTrustLevel, type RichInquiry } from "../../state";
import { MOCK_CONVERSATIONS, type Conversation, type MsgStage } from "./conversations-1";
import { myStatusOn, unreadOnInquiry } from "./inquiry-bridge-1";
import { TALENT_INQUIRY_TO_CONV } from "./today-1";
import { matchesAgencyFilter, useTalentAgencyFilter } from "./use-talent-agency-filter";



// ════════════════════════════════════════════════════════════════════
// Phase 3.12.2 — Bridge adapter: DB row → Conversation
//
// `TalentInquiryRow` comes from the server-side bridge (Supabase).
// We adapt it into the prototype's rich `Conversation` shape so every
// component that previously read `MOCK_CONVERSATIONS` can instead call
// `useTalentConversations()` and get real data when the bridge is live,
// or the seed mock otherwise. Single fallback rule: if the bridge array
// is empty (no real data / mock-mode session) return MOCK_CONVERSATIONS.
// ════════════════════════════════════════════════════════════════════

type InquiryBridgeRow = TalentInquiryRow & {
  agencySlug?: string;
  agencyName?: string | null;
};

function adaptTalentInquiry(row: InquiryBridgeRow, fallbackAgencyName: string): Conversation {
  const agencyName = row.agencyName?.trim() || fallbackAgencyName;
  const clientName = row.company ?? row.contact_name;
  const brief = row.message?.trim() || (row.company ? `${row.company} inquiry` : "Direct inquiry");
  const stage: MsgStage =
    row.status === "booked" || row.status === "converted"
      ? "booked"
      : row.status === "rejected" || row.status === "expired" || row.status === "cancelled"
      ? "cancelled"
      : row.status === "approved" || row.status === "offer_pending"
      ? "hold"
      : "inquiry";
  const initials = clientName
    .split(/\s+/)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  const ageHrs = Math.floor(
    (Date.now() - new Date(row.updated_at).getTime()) / 3_600_000,
  );
  return {
    id:            row.id,
    client:        clientName,
    clientInitials: initials || clientName.slice(0, 2).toUpperCase(),
    clientTrust:   (row.trustLevel ?? "basic") as ClientTrustLevel,
    brief,
    stage,
    agency:        agencyName,
    agencySlug:    row.agencySlug,
    leader: {
      name:     agencyName,
      role:     "Coordinator",
      initials: agencyName.slice(0, 2).toUpperCase(),
    },
    location: row.event_location ?? undefined,
    date:     row.event_date ?? undefined,
    lastMessage: {
      sender:  "coordinator" as const,
      preview: stage === "booked" ? "Booking confirmed — check logistics tab." : "Awaiting your response.",
      ageHrs,
    },
    unreadCount: row.unreadCount,
    pinned: {},
  };
}


/**
 * Hook — returns bridge-adapted conversations when real data exists,
 * falls back to MOCK_CONVERSATIONS for prototype / mock-mode sessions.
 * All talent components that previously read MOCK_CONVERSATIONS directly
 * should call this instead. Exported so _messages.tsx can use it in
 * TalentJobShell without accessing the proto context via a separate hook.
 */
export function useTalentConversations(): Conversation[] {
  const { effectiveTalentInquiries, bridgeTalentSelfProfile } = useAdminShell();
  const { filter } = useTalentAgencyFilter();
  return useMemo(() => {
    // Bridge-mode: a real talent profile is in scope. Return adapted
    // bridge data — even if it's empty (a freshly-provisioned talent
    // genuinely has zero conversations and should see an empty inbox,
    // not Marta's lookbook chatter).
    if (bridgeTalentSelfProfile) {
      const fallbackAgency = bridgeTalentSelfProfile.agencyName ?? "Agency";
      const rows = effectiveTalentInquiries.filter((r) =>
        matchesAgencyFilter(filter, (r as InquiryBridgeRow).agencySlug),
      );
      return rows.map((r) => adaptTalentInquiry(r as InquiryBridgeRow, fallbackAgency));
    }
    // Standalone prototype / design-QA mode (no bridge identity at all).
    // Fall back to the demo conversation set so the prototype demo still
    // looks lively when explored without a logged-in user.
    return MOCK_CONVERSATIONS;
  }, [effectiveTalentInquiries, bridgeTalentSelfProfile, filter]);
}


function InquiryRow({ inquiry }: { inquiry: RichInquiry }) {
  const { openDrawer, setTalentPage, toast } = useAdminShell();
  const stage = INQUIRY_STAGE_META[inquiry.stage];
  const myStatus = myStatusOn(inquiry);
  const unread = unreadOnInquiry(inquiry);
  const myLine = inquiry.offer?.lineItems.find((l) => l.talentName === MY_TALENT_PROFILE.name);

  const stageBg =
    stage.tone === "amber" ? COLORS.amberSoft
    : stage.tone === "green" ? COLORS.successSoft
    : stage.tone === "red" ? "rgba(176,48,58,0.08)"
    : "rgba(11,11,13,0.05)";
  const stageFg =
    stage.tone === "amber" ? COLORS.amberDeep
    : stage.tone === "green" ? COLORS.successDeep
    : stage.tone === "red" ? "#7A2026"
    : COLORS.inkMuted;

  // T1: Stage-aware confirmed text — "You're confirmed" was ambiguous
  const myStatusLabel =
    myStatus === "pending" ? "Awaiting your answer"
    : myStatus === "accepted" && inquiry.stage === "offer_pending" ? "Waiting on client"
    : myStatus === "accepted" && inquiry.stage === "approved" ? "Client approved — booking being set up"
    : myStatus === "accepted" && inquiry.stage === "booked" ? "Booked · locked in"
    : myStatus === "accepted" ? "You're confirmed"
    : myStatus === "declined" ? "You declined"
    : null;
  const myStatusFg =
    myStatus === "pending" ? COLORS.amberDeep
    : myStatus === "accepted" && inquiry.stage === "booked" ? COLORS.successDeep
    : myStatus === "accepted" ? COLORS.successDeep
    : myStatus === "declined" ? COLORS.inkDim
    : COLORS.inkMuted;

  // T2: "Updated Xh ago" timestamp
  const activityLabel =
    inquiry.lastActivityHrs < 1 ? "Just now"
    : inquiry.lastActivityHrs < 24 ? `${inquiry.lastActivityHrs}h ago`
    : `${Math.round(inquiry.lastActivityHrs / 24)}d ago`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        position: "relative",
      }}
    >
      {/* Main clickable area — vertical stack so identity, chips and meta
          each get their own line. Easier to scan, breathes at narrow widths. */}
      <button
        onClick={() => {
          const convId = TALENT_INQUIRY_TO_CONV[inquiry.id] ?? inquiry.id;
          pinNextConversationT(convId);
          setTalentPage("messages");
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          flex: 1,
          minWidth: 0,
          fontFamily: FONTS.body,
          padding: 0,
        }}
      >
        {/* Line 1 — identity. Client name (bold) · brief (muted continuation),
            with the trust chip pinned to the right. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">
            <span className="font-semibold">{inquiry.clientName}</span>
            <span style={{ fontWeight: 400 }} className="text-admin-ink-muted"> · {inquiry.brief}</span>
          </div>
          <ClientTrustChip level={inquiry.clientTrust} compact />
        </div>

        {/* Line 2 — chip strip. Stage + repeat + unread, all in one row of
            equal-weight pills. Wraps gracefully at narrow widths. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 999,
              background: stageBg,
              color: stageFg,
              fontSize: 10.5,
              fontWeight: 600,
                            flexShrink: 0,
            }}
          >
            {stage.label}
          </span>
          {inquiry.repeatBookings > 0 && (
            <span style={{ fontSize: 10.5, background: "rgba(11,11,13,0.06)", padding: "2px 8px", borderRadius: 999, fontWeight: 500, flexShrink: 0 }} className="text-admin-ink-muted">
              Repeat · {inquiry.repeatBookings}×
            </span>
          )}
          {unread > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, background: "rgba(82,96,109,0.12)", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.3, flexShrink: 0 }} className="text-admin-amber-deep">
              {unread} new
            </span>
          )}
        </div>

        {/* Line 3 — meta. Agency, date, fee, last activity. */}
        <div style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} className="text-admin-ink-muted">
          <span>via {inquiry.agencyName}</span>
          {inquiry.date && <><span className="text-admin-ink-dim">·</span><span>{inquiry.date}</span></>}
          {inquiry.location && <><span className="text-admin-ink-dim">·</span><span>{inquiry.location}</span></>}
          {myLine && <><span className="text-admin-ink-dim">·</span><span>{myLine.fee}</span></>}
          <span className="text-admin-ink-dim">·</span>
          <span className="text-admin-ink-dim">Updated {activityLabel}</span>
        </div>

        {myStatusLabel && (
          <div style={{ fontSize: 11.5, color: myStatusFg, fontWeight: 500 }}>
            {myStatusLabel}
          </div>
        )}
      </button>

      {/* Right rail — Snooze + chevron, centered against the row's first line. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          title="Set a reminder"
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 10.5,
            fontFamily: FONTS.body,
            color: COLORS.inkDim,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.ink; e.currentTarget.style.borderColor = COLORS.border; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.inkDim; e.currentTarget.style.borderColor = COLORS.borderSoft; }}
        >
          Remind me
        </button>
        <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
      </div>
    </div>
  );
}
