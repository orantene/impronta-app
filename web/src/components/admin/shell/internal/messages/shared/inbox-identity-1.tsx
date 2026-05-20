"use client";

import React, { useState } from "react";
import { COLORS, useAdminShell, FONTS, ROSTER_AGENCY, ROSTER_FREE, TRANSITION } from "../../state";
import { Avatar, ClientTrustBadge, TrustBadgeGroup, Icon } from "../../primitives";
import { type Participant } from "../../talent";
import { archiveInquiry, isManualUnread, isPinned, toggleManualUnread, togglePin, useFlagsSubscription } from "../conversation-stash";
import { AdminBookingTab } from "./machinery-5";
import type { Offer } from "./machinery-9";

// ════════════════════════════════════════════════════════════════════
// SYSTEM USER (workspace identity) — Phase 1 of the System User direction
// ════════════════════════════════════════════════════════════════════
//
// The System User represents the workspace itself (Atelier Roma /
// Acme Models / etc.) as a participant in chats and as an outbound
// sender for automated events. Why we need it:
//   • Coordinator handoffs would otherwise leave conversations with
//     orphaned sender attribution ("Sara said X" → Sara left, who do
//     I respond to?). System User absorbs that continuity.
//   • Booking confirmations + offer-sent + reassign events should
//     read as workspace-issued, not coordinator-issued.
//   • Lets coords optionally post AS the workspace when they want to
//     speak with the agency's voice rather than their own (Phase 4).
//
// Tier behavior:
//   • Free   → System User identity = the owner-talent. Single voice,
//              no abstraction (the owner IS the workspace).
//   • Studio → Workspace brand (e.g. "Atelier Roma"). Owner + 1-2 coords
//              can post as it.
//   • Agency → Workspace brand. Owner + admin + coordinators can post
//              as it. Permissioned via WorkspaceRole.
//   • Network → One System User per agency in the federation; cross-
//              agency referrals can show both.
export type WorkspaceIdentity = {
  /** Display name shown in chat bubbles + lists. */
  name: string;
  /** 2-letter avatar fallback. */
  initials: string;
  /** Optional logo URL. When absent, the avatar uses tone:"ink" with initials. */
  logoUrl?: string;
  /** Plan tier — drives which features the workspace can use as a
   *  System User (e.g. Free can't post as workspace because the owner
   *  IS the workspace). */
  planTier: "free" | "studio" | "agency" | "network";
  /** Workspace slug — used for routing to the workspace profile page. */
  slug: string;
  /** Outbound voice signature appended to system-routed messages. */
  signature?: string;
};

/**
 * Resolve a workspace identity from an agency name.
 *
 * Production callers pass `effectiveTenant.name` (live tenant identity from
 * the bridge); the synthesizer below derives initials + URL-safe slug from
 * that string. Plan tier defaults to "agency" — workspace plan is read
 * separately via `state.plan` where it actually matters (gating).
 *
 * Previously contained a `WORKSPACE_REGISTRY` lookup with demo entries
 * (Atelier Roma, Acme Models, Praline London, Reyes Movement Studio) that
 * baked prototype names into production code. Removed 2026-05-13 (B.1).
 * The synthesized fallback below handles every tenant correctly without
 * any hardcoded names.
 */
export function getWorkspaceIdentity(agencyName: string): WorkspaceIdentity {
  return {
    name: agencyName,
    initials: agencyName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "AG",
    planTier: "agency",
    slug: agencyName.toLowerCase().replace(/\s+/g, "-"),
  };
}

// ── Presence layer ──
// Live online/away/offline indicator for coordinators + workspace
// members. Production reads from a presence service (websocket
// heartbeat); the prototype derives a deterministic mock from the
// person's name so the same coord always reads the same status —
// keeps screenshots stable across refreshes.
export type Presence = "online" | "away" | "offline";
export function usePresence(name: string | null | undefined): Presence {
  // Hash the name into one of three buckets. Deterministic for the
  // demo — Marta is always "online", Sara always "away" etc.
  if (!name) return "offline";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const bucket = Math.abs(h) % 5;
  // 3/5 chance online, 1/5 away, 1/5 offline — mostly-active feel
  if (bucket < 3) return "online";
  if (bucket === 3) return "away";
  return "offline";
}
export const PRESENCE_PALETTE: Record<Presence, { color: string; label: string }> = {
  online:  { color: COLORS.success,         label: "Online" },
  away:    { color: COLORS.amber,           label: "Away" },
  offline: { color: "rgba(11,11,13,0.20)",  label: "Offline" },
};
// Small dot overlay — wraps an Avatar when used as `<div style={{position:"relative"}}><Avatar/><PresenceDot/></div>`.
export function PresenceDot({ name, size = 9 }: { name: string | null | undefined; size?: number }) {
  const p = usePresence(name);
  if (p === "offline") return null; // no need to render an offline marker
  const palette = PRESENCE_PALETTE[p];
  return (
    <span
      title={`${name} · ${palette.label}`}
      aria-label={`${name ?? "User"} is ${palette.label.toLowerCase()}`}
      style={{
        position: "absolute",
        right: -1, bottom: -1,
        width: size, height: size, borderRadius: "50%",
        background: palette.color,
        border: "1.5px solid #fff",
        boxShadow: "0 0 0 0.5px rgba(11,11,13,0.04)",
      }}
    />
  );
}

// ── Coord workload pill — admin-side signal that surfaces how busy a
// coordinator currently is (active project count). Used inline next to
// the coord name on the AdminBookingTab Coordinator card so admins can
// gauge load before assigning. Production reads from coordinator's
// workspace metrics; mock derives a stable deterministic count from
// the coord's name. ──
export function getCoordWorkload(name: string | null | undefined): number {
  if (!name) return 0;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 17 + name.charCodeAt(i)) | 0;
  return (Math.abs(h) % 12) + 1; // 1-12 active projects
}
export function CoordWorkloadPill({ name }: { name: string }) {
  const count = getCoordWorkload(name);
  const tone = count >= 10 ? "heavy" : count >= 6 ? "balanced" : "light";
  const palette = tone === "heavy"
    ? { bg: `${COLORS.coral}14`, fg: COLORS.coralDeep }
    : tone === "balanced"
    ? { bg: `${COLORS.amber}1a`, fg: COLORS.amber }
    : { bg: COLORS.successSoft, fg: COLORS.successDeep ?? COLORS.success };
  return (
    <span
      title={`${count} active project${count === 1 ? "" : "s"} on ${name}'s plate · ${tone} load`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 6px", borderRadius: 999,
        background: palette.bg, color: palette.fg,
        fontSize: 9.5, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: 0.4,
        flexShrink: 0,
      }}>
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="2.5" height="7" rx="0.5" stroke="currentColor" strokeWidth="1"/>
        <rect x="6" y="3.5" width="2.5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1"/>
      </svg>
      {count}
    </span>
  );
}

// ── Inbox row hover quick-actions ──
// Reveals Pin / Mark unread / Archive buttons on the right edge of an
// inbox row when hovered (desktop) or focused. Each button uses
// stopPropagation so clicking it doesn't open the row. Mobile users
// won't see hover but the keyboard tab order still surfaces them.
//
// Mock implementation — actions resolve to a toast in the prototype.
// Production wires to a per-conv mutation store (pin to top, flip
// seen→unread, archive into a separate bucket).
export function InboxRowHoverActions({
  rowId, label,
}: {
  rowId: string;
  label: string;
}) {
  const { toast } = useAdminShell();
  // Subscribe so the Pin / Unread buttons re-render their on/off
  // state immediately when toggled.
  useFlagsSubscription();
  const pinned = isPinned(rowId);
  const manualUnread = isManualUnread(rowId);
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); };
  const btn = (
    title: string,
    active: boolean,
    glyph: React.ReactNode,
    onAct: () => void,
  ) => (
    <span
      role="button"
      tabIndex={0}
      title={title}
      aria-label={`${title} ${label}`}
      aria-pressed={active}
      onClick={(e) => { stop(e); onAct(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { stop(e); onAct(); } }}
      style={{
        width: 22, height: 22, borderRadius: 6,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: active ? COLORS.accentDeep : COLORS.inkMuted,
        cursor: "pointer", flexShrink: 0,
        background: active ? COLORS.accentSoft : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLSpanElement).style.background = "rgba(11,11,13,0.06)";
          (e.currentTarget as HTMLSpanElement).style.color = COLORS.ink;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLSpanElement).style.background = "transparent";
          (e.currentTarget as HTMLSpanElement).style.color = COLORS.inkMuted;
        }
      }}
    >
      {glyph}
    </span>
  );
  return (
    <div
      data-tulala-row-hover-actions
      style={{
        position: "absolute",
        right: 8, top: "50%", transform: "translateY(-50%)",
        // Pinned conv keeps its actions visible (so the user can
        // unpin without re-hovering); other rows reveal on hover.
        display: pinned ? "flex" : "none",
        alignItems: "center", gap: 2,
        padding: "2px 4px", borderRadius: 8,
        background: "#fff",
        boxShadow: "0 1px 4px rgba(11,11,13,0.10)",
        border: `1px solid ${COLORS.borderSoft}`,
        zIndex: 1,
      }}
    >
      {btn("Pin", pinned, (
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <path d="M9 1L13 5L9 5L9 9L11 11H3L5 9V5H1L5 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill={pinned ? "currentColor" : "none"} fillOpacity={pinned ? 0.18 : 0}/>
        </svg>
      ), () => { togglePin(rowId); toast(pinned ? `Unpinned · ${label}` : `Pinned · ${label}`); })}
      {btn("Mark unread", manualUnread, (
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" fill="currentColor"/>
        </svg>
      ), () => { toggleManualUnread(rowId); toast(manualUnread ? `Marked read · ${label}` : `Marked unread · ${label}`); })}
      {btn("Archive", false, (
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <rect x="1.5" y="3" width="11" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M2.5 5.5v6.5h9V5.5M5.5 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ), () => { archiveInquiry(rowId); toast(`Archived · ${label}`); })}
    </div>
  );
}

// CSS injected once that wires the hover-show behavior. The row
// component sets `data-tulala-inbox-row` so the rule scope is narrow.
// Pinned rows always show actions (they're rendered with display:flex
// inline by the component itself, so the rule below is for the rest).
export const HOVER_ACTIONS_CSS = `
[data-tulala-inbox-row]:hover [data-tulala-row-hover-actions],
[data-tulala-inbox-row]:focus-within [data-tulala-row-hover-actions] {
  display: flex !important;
}
`;
export function HoverActionsCss() {
  return <style dangerouslySetInnerHTML={{ __html: HOVER_ACTIONS_CSS }} />;
}

// ── CoordAvatarPopover — hover/focus mini-card on coord avatars ──
// Wraps an avatar with a small popover showing the coord's name,
// role, presence, workload, and a Message CTA. Renders on hover
// (desktop) or long-press (mobile, future). Replaces the old
// "avatar is decorative" pattern with a tactile context drop-in.
export function CoordAvatarPopover({
  name, initials, role,
  size = 36, photoUrl,
  withPresence = true,
  withWorkload = false,
}: {
  name: string;
  initials: string;
  role?: string;
  size?: number;
  photoUrl?: string;
  withPresence?: boolean;
  withWorkload?: boolean;
}) {
  const { toast } = useAdminShell();
  const [open, setOpen] = useState(false);
  const presence = usePresence(name);
  const workload = getCoordWorkload(name);
  const presencePalette = PRESENCE_PALETTE[presence];
  return (
    <span
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      <Avatar size={size} tone={role === "owner" || role === "coordinator" ? "ink" : "auto"} hashSeed={name} initials={initials} photoUrl={photoUrl} />
      {withPresence && <PresenceDot name={name} />}
      {open && (
        <div role="tooltip" style={{
          position: "absolute",
          left: "50%", transform: "translateX(-50%)",
          top: `calc(100% + 6px)`,
          zIndex: 50,
          minWidth: 220, maxWidth: 260,
          padding: 12,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          boxShadow: "0 12px 32px -8px rgba(11,11,13,0.18), 0 4px 8px rgba(11,11,13,0.06)",
          fontFamily: FONTS.body, color: COLORS.ink,
          textAlign: "left",
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Avatar size={32} tone="ink" hashSeed={name} initials={initials} photoUrl={photoUrl} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
                {name}
              </div>
              <div style={{ fontSize: 10.5, textTransform: "capitalize" }} className="text-admin-ink-muted">
                {role === "owner" ? "Workspace owner" : role || "Coordinator"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: withWorkload ? 6 : 10 }} className="text-admin-ink-muted">
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: "50%",
              background: presencePalette.color,
            }} />
            <span style={{ fontWeight: 600 }} className="text-admin-ink">{presencePalette.label}</span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span>last seen {presence === "online" ? "now" : presence === "away" ? "12m ago" : "2h ago"}</span>
          </div>
          {withWorkload && (
            <div style={{ fontSize: 11, marginBottom: 10 }} className="text-admin-ink-muted">
              <strong style={{ fontWeight: 600 }} className="text-admin-ink">{workload}</strong> active project{workload === 1 ? "" : "s"}
              {" · "}
              {workload >= 10 ? "heavy load" : workload >= 6 ? "balanced load" : "light load"}
            </div>
          )}
          <button type="button"
            onClick={(e) => { e.stopPropagation(); toast(`Messaging ${name}…`); }}
            style={{
              width: "100%", padding: "6px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: "transparent",
              color: COLORS.ink, cursor: "pointer",
              fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
            }}>
            Message {name.split(" ")[0]}
          </button>
        </div>
      )}
    </span>
  );
}

// ── First-time conversation banner ──
// Shown at the top of the message stream when this is the first
// conversation the user has had with this client. Big personality
// boost + actionable context: "what's the typical brief / pay range
// / things to ask". Production reads from a CRM signal (no prior
// conversation exists between sender + recipient); the prototype
// uses a hardcoded "new clients" list keyed by client name.
export const FIRST_TIME_CLIENTS = new Set([
  "Aesop", "Lacoste", "Tequila Olmeca", "Praline London",
  "Eden Hotel", "Lyra Skincare", "Estudio Roca",
]);
export function isFirstConvWith(clientName: string | null | undefined): boolean {
  if (!clientName) return false;
  return FIRST_TIME_CLIENTS.has(clientName);
}
export function FirstConvBanner({
  clientName, audience = "talent",
}: {
  clientName: string;
  /** "talent" or "admin" framing. The hint copy adjusts. */
  audience?: "talent" | "admin" | "client";
}) {
  const hint = audience === "admin"
    ? "First inquiry from this client. Confirm scope + budget early — no priors to anchor on."
    : audience === "client"
    ? "Welcome — first project together. Let your coordinator know your usual cadence + must-haves."
    : "First time you'll work with this client. Lock the brief + usage scope early.";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px", margin: "0 14px 8px",
      background: `linear-gradient(135deg, rgba(46,125,91,0.08) 0%, ${COLORS.surfaceAlt} 100%)`,
      border: `1px solid rgba(46,125,91,0.22)`,
      borderRadius: 10,
      fontFamily: FONTS.body,
    }}>
      <span aria-hidden style={{
        flexShrink: 0,
        width: 24, height: 24, borderRadius: 6,
        background: "rgba(46,125,91,0.16)", color: COLORS.successDeep ?? COLORS.success,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginTop: 1,
      }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5l1.7 3.6 3.8.5-2.8 2.6.7 3.8L7 10.2 3.6 12l.7-3.8L1.5 5.6l3.8-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: COLORS.successDeep ?? COLORS.success,
        }}>
          First time with {clientName}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {hint}
        </div>
      </div>
    </div>
  );
}

// ── CoordRoleBadge — small inline pill that surfaces when the
// coordinator on a project is ALSO the workspace owner / admin (not a
// regular team coordinator). Visible to talent + clients on the
// coordinator card so they know they're talking to the person who
// owns the workspace, not just any coord.
//
// Why an explicit signal?
//   • Trust: bigger jobs / sensitive asks land more confidently with
//     "the buck stops here" coords than with handoff-prone middle layers.
//   • Authority: talent who escalate know they don't need to ask for
//     a manager — they're already on the line.
//   • Workspace-side counterpart to ClientTrustBadge (which surfaces
//     trust on the OTHER party). Together they give both sides a quick
//     read on who they're dealing with.
//
// Currently keyed off `role === "owner"`. Future: extend to "admin"
// (non-owner with admin permissions) using a different label/color, and
// to a "Founder" tier on solo workspaces.
export function CoordRoleBadge({
  role, compact = false,
}: {
  role?: string;
  /** When true, hides the text label and just renders the star icon
   *  — useful inside dense rows / message bubble headers. */
  compact?: boolean;
}) {
  if (role !== "owner") return null;
  return (
    <span
      title="Workspace owner — runs this workspace"
      aria-label="Workspace owner"
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: compact ? "1px 4px" : "1px 6px",
        borderRadius: 999,
        background: COLORS.indigoSoft,
        color: COLORS.indigoDeep,
        fontSize: 9.5, fontWeight: 700,
        letterSpacing: 0.4, textTransform: "uppercase",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
      {!compact && "Owner"}
    </span>
  );
}

// SLA freshness — fresh=green / aging=amber / overdue=red.
// Thresholds tuned for prototype demo: <4h fresh, <24h aging, else overdue
// — but ONLY when nextActionBy is on this side. Otherwise no dot (we're
// not waiting on ourselves).
export function freshnessTone(hrs: number, isWaitingOnUs: boolean): { color: string; label: string } | null {
  if (!isWaitingOnUs) return null;
  if (hrs < 4)   return { color: COLORS.success, label: "fresh" };
  if (hrs < 24)  return { color: COLORS.amber,   label: "aging" };
  return                 { color: COLORS.coral,   label: "overdue" };
}

export const initialsOf = (name: string) =>
  name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

// MessagesPageHeader removed — was a redundant outer "My jobs · count"
// row above each shell. The shell's own list-pane header already carries
// the title + count, so the outer row was duplicate chrome on every
// viewport. Deleted along with all three call sites (talent / client /
// admin) and the data-tulala-messages-header-pad CSS scope.

// ── Stage progress dots (●─●─○─○) — used by client + talent shells ──

export const FUNNEL_STAGES: Array<{ id: string; label: string }> = [
  { id: "inquiry",  label: "Inquiry" },
  { id: "offered",  label: "Offer" },
  { id: "booked",   label: "Booked" },
  { id: "wrapped",  label: "Wrapped" },
];

/**
 * Participant trust strip for chat / inquiry headers. Shows compact
 * trust badges for the other side(s) so the user knows who they're
 * talking to without leaving the conversation.
 *
 *   pov="admin"  → both client + talent badges (coordinator workspace)
 *   pov="client" → talent badges only
 *   pov="talent" → client trust state only
 */
export function ParticipantTrustStrip({
  pov,
  talentName,
  clientName,
}: {
  pov: "admin" | "client" | "talent";
  talentName?: string;
  clientName?: string;
}) {
  const { getTrustSummary, effectiveTenant } = useAdminShell();
  // Resolve names → roster ids for talent (best-effort, lookup by name)
  const allRoster = [...ROSTER_AGENCY, ...ROSTER_FREE];
  const talentId = talentName ? allRoster.find(r => r.name === talentName)?.id : undefined;
  const talentTrust = talentId ? getTrustSummary("talent_profile", talentId) : null;
  // Client trust — for the prototype, treat any client with name "Vogue Italia"
  // as our seeded business-verified client (c1). Others get a basic active state.
  const clientId = clientName ? (clientName === "Vogue Italia" ? "c1" : `c-${clientName.toLowerCase().replace(/\s+/g, "-")}`) : undefined;
  const clientTrust = clientId ? getTrustSummary("client_profile", clientId) : null;

  const showTalent = (pov === "admin" || pov === "client") && talentTrust;
  const showClient = (pov === "admin" || pov === "talent") && clientTrust;

  if (!showTalent && !showClient) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", background: "#fff", border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 11, flexWrap: "wrap" }} className="rounded-admin-md">
      {showTalent && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">Talent</span>
          <span style={{ fontSize: 12, fontWeight: 600 }} className="text-admin-ink">{talentName}</span>
          <TrustBadgeGroup trust={talentTrust!} surface="chat_header" size="sm" max={3} />
        </div>
      )}
      {showTalent && showClient && (
        <span aria-hidden style={{ width: 1, height: 16, background: COLORS.borderSoft }} />
      )}
      {showClient && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">Client</span>
          <span style={{ fontSize: 12, fontWeight: 600 }} className="text-admin-ink">{clientName}</span>
          <TrustBadgeGroup trust={clientTrust!} surface="chat_header" size="sm" max={3} />
        </div>
      )}
    </div>
  );
}

export function StageProgress({ currentStage }: { currentStage: string }) {
  // Map both data shapes to the 4-stage funnel
  const funnelIdx = (() => {
    const s = currentStage;
    if (s === "submitted" || s === "coordination" || s === "draft" || s === "inquiry") return 0;
    if (s === "offer_pending" || s === "hold" || s === "offered") return 1;
    if (s === "approved" || s === "booked") return 2;
    if (s === "completed" || s === "past" || s === "rejected" || s === "expired" || s === "wrapped") return 3;
    return 0;
  })();

  return (
    <div data-tulala-funnel-progress role="progressbar" aria-valuemin={0} aria-valuemax={FUNNEL_STAGES.length} aria-valuenow={funnelIdx + 1}
      style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONTS.body }}>
      {/* On very narrow viewports the per-stage labels collapse — only the
          dots remain. The active stage label is announced separately
          (see aria-label below) so the meaning is preserved. */}
      <style>{`
        @media (max-width: 380px) {
          [data-tulala-funnel-progress] .tulala-funnel-label { display: none; }
          [data-tulala-funnel-progress] .tulala-funnel-rail { flex-basis: 18px !important; margin-bottom: 0 !important; }
        }
      `}</style>
      {FUNNEL_STAGES.map((s, i) => {
        const past = i < funnelIdx;
        const here = i === funnelIdx;
        const bg = past ? COLORS.success : here ? COLORS.accent : "rgba(11,11,13,0.10)";
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} aria-label={here ? `Current stage: ${s.label}` : undefined}>
              <span aria-hidden style={{
                width: here ? 11 : 8, height: here ? 11 : 8, borderRadius: "50%",
                background: bg, transition: TRANSITION.sm,
              }} />
              <span className="tulala-funnel-label" style={{
                fontSize: 11, color: past || here ? COLORS.ink : COLORS.inkDim,
                fontWeight: here ? 600 : 500, letterSpacing: -0.05,
              }}>
                {s.label}
              </span>
            </div>
            {i < FUNNEL_STAGES.length - 1 && (
              <span aria-hidden className="tulala-funnel-rail" style={{
                flex: "0 0 28px", height: 1.5,
                background: i < funnelIdx ? COLORS.success : "rgba(11,11,13,0.10)",
                marginBottom: 14,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Common pill input (search) — same pattern across all 3 shells ──

export function SearchPill({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape" && value) onChange(""); }}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "8px 32px 8px 32px", borderRadius: 999,
          border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.04)",
          fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
        }}
      />
      <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}>
        <Icon name="search" size={13} color={COLORS.inkDim} />
      </div>
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          title="Clear (Esc)"
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            width: 22, height: 22, borderRadius: "50%",
            border: "none", background: "rgba(11,11,13,0.08)",
            color: COLORS.inkMuted, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      ) : (
        <kbd aria-hidden style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          fontFamily: FONTS.body, fontSize: 9.5, fontWeight: 600,
          padding: "2px 5px", borderRadius: 4,
          background: "#fff", border: `1px solid ${COLORS.border}`,
          color: COLORS.inkDim, letterSpacing: 0.3,
        }}>⌘K</kbd>
      )}
    </div>
  );
}
