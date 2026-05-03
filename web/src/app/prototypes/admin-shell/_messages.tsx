/**
 * MessagesShell — three distinct product shells on one shared engine.
 *
 * The data model is one chain (request → inquiry → offer → booking)
 * but each role gets a deliberately different product:
 *
 *   pov="admin"   → AdminOperationsShell  (operations console)
 *                   • thread hierarchy: Client thread is PRIMARY,
 *                     Talent group + Internal notes are SECONDARY
 *                   • right rail: Lineup · Offer builder · Coordinator ·
 *                     Activity · Files
 *                   • feel: "I am running this deal"
 *
 *   pov="talent"  → TalentJobShell       (assignment-centric)
 *                   • detail = job card, NOT chat-first
 *                   • hero: status, dates, location, your-take-home
 *                   • big actions: Accept · Decline · Hold · Request change
 *                   • conversation is secondary at the bottom
 *                   • feel: "What is this job and what do I do?"
 *
 *   pov="client"  → ClientProjectShell   (project status)
 *                   • detail = project status page, NOT chat-first
 *                   • hero: stage progress · single primary "Next action" CTA
 *                   • agency card · talent lineup · schedule · timeline
 *                   • conversation is at the bottom (single thread)
 *                   • feel: "Calm, premium, guided. Where does this stand?"
 *
 * The shells SHARE the design system (avatars, trust badges, primitives)
 * but the layouts, hierarchies, list rows, filter chips, and detail
 * structures are deliberately different per role. A single inquiry will
 * look like three different products depending on who's looking.
 *
 * Data:
 *   admin uses RICH_INQUIRIES (workspace data)
 *   talent + client use MOCK_CONVERSATIONS (talent-side data)
 *
 * Companion spec: ./docs/canonical-flow.json + MESSAGING_FLOW.md
 */

"use client";

import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  COLORS, FONTS, RADIUS, TRANSITION,
  MY_TALENT_PROFILE,
  RICH_INQUIRIES, type RichInquiry, type ClientTrustLevel,
  type InquiryUnitType, type InquiryRecord, toInquiry,
  useProto,
  ROSTER_AGENCY, ROSTER_FREE,
  meetsRole,
  TENANT,
} from "./_state";

/**
 * Derive the current talent's stable id from their profile. The offer
 * mocks key talent rows by `t-<firstname>` — the talent shell needs to
 * match against the same id rather than hard-coding "t-marta", so swapping
 * `MY_TALENT_PROFILE` in the mocks would still produce the right pov.
 */
const currentTalentId = () =>
  `t-${MY_TALENT_PROFILE.name.split(" ")[0]?.toLowerCase()}`;
import {
  Avatar, ClientTrustBadge, ClientTrustChip, Icon,
  TrustBadgeGroup,
} from "./_primitives";
import {
  type Conversation, type Participant,
  MOCK_CONVERSATIONS, MOCK_THREAD,
  CLIENT_MOCK_CONVERSATIONS_BY_PROFILE,
} from "./_talent";
// WorkspaceBody import removed — admin now uses AdminInquiryDetail
// (defined below) which mirrors the talent/client shell pattern.

export type MessagesPov = "admin" | "talent" | "client";

// ════════════════════════════════════════════════════════════════════
// SHARED — adapters + common helpers
// ════════════════════════════════════════════════════════════════════

const stageStyle = (stage: string): { bg: string; fg: string } => {
  switch (stage) {
    case "inquiry":  return { bg: `${COLORS.coral}18`,   fg: COLORS.coral };
    case "hold":
    case "offered": return { bg: `${COLORS.amber}18`,   fg: COLORS.amber };
    case "booked":   return { bg: COLORS.successSoft,    fg: COLORS.success };
    default:         return { bg: "rgba(11,11,13,0.06)", fg: COLORS.inkMuted };
  }
};

export const ageLabel = (hrs: number) =>
  hrs < 1 ? "now" : hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;

// Active-row scroll-into-view. Pass the active flag; returns a ref to
// attach to the row's outer button. When active flips true, the row
// scrolls itself into the visible area of its scroll container with a
// gentle "nearest" alignment (no jarring center-snap).
function useScrollIntoViewWhenActive(active: boolean) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    // requestAnimationFrame so layout has settled — otherwise the
    // newly-mounted row hasn't been positioned yet on conv switch.
    const r = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(r);
  }, [active]);
  return ref;
}

// Bucket a row into a temporal group ("Today" / "Yesterday" / "This
// week" / "Older"). Used to render group headers in the inbox so the
// eye can scan the chronology without doing math on every age label.
function dateGroupKey(hrs: number): "today" | "yesterday" | "week" | "older" {
  if (hrs < 24) return "today";
  if (hrs < 48) return "yesterday";
  if (hrs < 24 * 7) return "week";
  return "older";
}
const DATE_GROUP_LABEL: Record<ReturnType<typeof dateGroupKey>, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  older: "Older",
};

// Render group headers above clusters of rows that share a date bucket.
// Pass an array, a getter that returns ageHrs for each item, and a row
// renderer; returns an interleaved list of headers + rows. Eats no
// height when an item's bucket matches the previous one.
function renderWithDateGroups<T>(
  items: T[],
  getAgeHrs: (item: T) => number,
  renderRow: (item: T) => React.ReactNode,
): React.ReactNode {
  const out: React.ReactNode[] = [];
  let lastBucket: ReturnType<typeof dateGroupKey> | null = null;
  // Track how many times each bucket has appeared so duplicate
  // headers (e.g. when a custom sort puts a "today" item below a
  // "yesterday" one) get unique keys instead of collapsing.
  const bucketSeen: Record<string, number> = {};
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const b = dateGroupKey(getAgeHrs(item));
    if (b !== lastBucket) {
      bucketSeen[b] = (bucketSeen[b] ?? 0) + 1;
      const headerKey = bucketSeen[b] === 1 ? `hdr-${b}` : `hdr-${b}-${i}`;
      out.push(
        <div key={headerKey} data-tulala-inbox-group-header style={{
          padding: "10px 14px 4px",
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: COLORS.inkMuted,
          background: "#fff",
          position: "sticky", top: 0, zIndex: 1,
          borderBottom: `1px solid ${COLORS.borderSoft}`,
        }}>
          {DATE_GROUP_LABEL[b]}
        </div>,
      );
      lastBucket = b;
    }
    out.push(renderRow(item));
  }
  return out;
}

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

// Demo workspaces — production reads from `state.workspaceName` +
// `state.plan` + a workspace-settings record we don't ship yet. The
// WORKSPACE_REGISTRY is keyed by the agency name we already use in
// Conversation.agency so it's a 1:1 lookup from existing data.
const WORKSPACE_REGISTRY: Record<string, WorkspaceIdentity> = {
  "Atelier Roma": {
    name: "Atelier Roma", initials: "AR", planTier: "agency",
    slug: "atelier-roma", signature: "Sent on behalf of Atelier Roma",
  },
  "Acme Models": {
    name: "Acme Models", initials: "AM", planTier: "agency",
    slug: "acme-models", signature: "Sent on behalf of Acme Models",
  },
  "Praline London": {
    name: "Praline London", initials: "PL", planTier: "studio",
    slug: "praline-london", signature: "Sent by Praline London",
  },
  "Reyes Movement Studio": {
    name: "Reyes Movement Studio", initials: "RM", planTier: "studio",
    slug: "reyes-movement", signature: "Sent by Reyes Movement Studio",
  },
};

/**
 * Resolve a workspace identity from an agency name. Falls back to a
 * synthesized identity built from the name when there's no entry — keeps
 * the chat bubble renderable for any agency the demo introduces without
 * us having to register them all up front.
 */
export function getWorkspaceIdentity(agencyName: string): WorkspaceIdentity {
  const hit = WORKSPACE_REGISTRY[agencyName];
  if (hit) return hit;
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
const PRESENCE_PALETTE: Record<Presence, { color: string; label: string }> = {
  online:  { color: COLORS.success,         label: "Online" },
  away:    { color: COLORS.amber,           label: "Away" },
  offline: { color: "rgba(11,11,13,0.20)",  label: "Offline" },
};
// Small dot overlay — wraps an Avatar when used as `<div style={{position:"relative"}}><Avatar/><PresenceDot/></div>`.
function PresenceDot({ name, size = 9 }: { name: string | null | undefined; size?: number }) {
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
function getCoordWorkload(name: string | null | undefined): number {
  if (!name) return 0;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 17 + name.charCodeAt(i)) | 0;
  return (Math.abs(h) % 12) + 1; // 1-12 active projects
}
function CoordWorkloadPill({ name }: { name: string }) {
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
function InboxRowHoverActions({
  rowId, label,
}: {
  rowId: string;
  label: string;
}) {
  const { toast } = useProto();
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
      ), () => toast(`Archived · ${label}`))}
    </div>
  );
}

// CSS injected once that wires the hover-show behavior. The row
// component sets `data-tulala-inbox-row` so the rule scope is narrow.
// Pinned rows always show actions (they're rendered with display:flex
// inline by the component itself, so the rule below is for the rest).
const HOVER_ACTIONS_CSS = `
[data-tulala-inbox-row]:hover [data-tulala-row-hover-actions],
[data-tulala-inbox-row]:focus-within [data-tulala-row-hover-actions] {
  display: flex !important;
}
`;
function HoverActionsCss() {
  return <style dangerouslySetInnerHTML={{ __html: HOVER_ACTIONS_CSS }} />;
}

// ── CoordAvatarPopover — hover/focus mini-card on coord avatars ──
// Wraps an avatar with a small popover showing the coord's name,
// role, presence, workload, and a Message CTA. Renders on hover
// (desktop) or long-press (mobile, future). Replaces the old
// "avatar is decorative" pattern with a tactile context drop-in.
function CoordAvatarPopover({
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
  const { toast } = useProto();
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Avatar size={32} tone="ink" hashSeed={name} initials={initials} photoUrl={photoUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
              </div>
              <div style={{ fontSize: 10.5, color: COLORS.inkMuted, textTransform: "capitalize" }}>
                {role === "owner" ? "Workspace owner" : role || "Coordinator"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: COLORS.inkMuted, marginBottom: withWorkload ? 6 : 10 }}>
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: "50%",
              background: presencePalette.color,
            }} />
            <span style={{ fontWeight: 600, color: COLORS.ink }}>{presencePalette.label}</span>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span>last seen {presence === "online" ? "now" : presence === "away" ? "12m ago" : "2h ago"}</span>
          </div>
          {withWorkload && (
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 10 }}>
              <strong style={{ color: COLORS.ink, fontWeight: 600 }}>{workload}</strong> active project{workload === 1 ? "" : "s"}
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
const FIRST_TIME_CLIENTS = new Set([
  "Aesop", "Lacoste", "Tequila Olmeca", "Praline London",
  "Eden Hotel", "Lyra Skincare", "Estudio Roca",
]);
function isFirstConvWith(clientName: string | null | undefined): boolean {
  if (!clientName) return false;
  return FIRST_TIME_CLIENTS.has(clientName);
}
function FirstConvBanner({
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: COLORS.successDeep ?? COLORS.success,
        }}>
          First time with {clientName}
        </div>
        <div style={{
          fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.5,
        }}>
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
function CoordRoleBadge({
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
function freshnessTone(hrs: number, isWaitingOnUs: boolean): { color: string; label: string } | null {
  if (!isWaitingOnUs) return null;
  if (hrs < 4)   return { color: COLORS.success, label: "fresh" };
  if (hrs < 24)  return { color: COLORS.amber,   label: "aging" };
  return                 { color: COLORS.coral,   label: "overdue" };
}

const initialsOf = (name: string) =>
  name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

// MessagesPageHeader removed — was a redundant outer "My jobs · count"
// row above each shell. The shell's own list-pane header already carries
// the title + count, so the outer row was duplicate chrome on every
// viewport. Deleted along with all three call sites (talent / client /
// admin) and the data-tulala-messages-header-pad CSS scope.

// ── Stage progress dots (●─●─○─○) — used by client + talent shells ──

const FUNNEL_STAGES: Array<{ id: string; label: string }> = [
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
function ParticipantTrustStrip({
  pov,
  talentName,
  clientName,
}: {
  pov: "admin" | "client" | "talent";
  talentName?: string;
  clientName?: string;
}) {
  const { getTrustSummary } = useProto();
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
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "8px 12px",
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md,
      fontFamily: FONTS.body, fontSize: 11,
      flexWrap: "wrap",
    }}>
      {showTalent && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
            color: COLORS.inkMuted, textTransform: "uppercase",
          }}>Talent</span>
          <span style={{ fontSize: 12, color: COLORS.ink, fontWeight: 600 }}>{talentName}</span>
          <TrustBadgeGroup trust={talentTrust!} surface="chat_header" size="sm" max={3} />
        </div>
      )}
      {showTalent && showClient && (
        <span aria-hidden style={{ width: 1, height: 16, background: COLORS.borderSoft }} />
      )}
      {showClient && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
            color: COLORS.inkMuted, textTransform: "uppercase",
          }}>Client</span>
          <span style={{ fontSize: 12, color: COLORS.ink, fontWeight: 600 }}>{clientName}</span>
          <TrustBadgeGroup trust={clientTrust!} surface="chat_header" size="sm" max={3} />
        </div>
      )}
    </div>
  );
}

function StageProgress({ currentStage }: { currentStage: string }) {
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

function SearchPill({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative" }}>
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

function FilterChip<T extends string>({
  id, label, active, onClick, count, icon,
}: {
  id: T;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Optional badge — useful for "Coordinating · 2". */
  count?: number;
  /** Optional leading mark — used to flag the coord-mode chip so it
   *  reads visually distinct from stage filters. */
  icon?: React.ReactNode;
}) {
  return (
    <button
      key={id}
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 11px", borderRadius: 999,
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        background: active ? COLORS.fill : "transparent",
        color: active ? "#fff" : COLORS.inkMuted,
        fontFamily: FONTS.body, fontSize: 11.5, fontWeight: active ? 600 : 500,
        cursor: "pointer", textTransform: "capitalize",
      }}
    >
      {icon && <span aria-hidden style={{ display: "inline-flex" }}>{icon}</span>}
      {label}
      {typeof count === "number" && count > 0 && (
        <span style={{
          minWidth: 16, height: 16, padding: "0 5px",
          borderRadius: 999,
          background: active ? "rgba(255,255,255,0.22)" : "rgba(11,11,13,0.06)",
          color: active ? "#fff" : COLORS.inkMuted,
          fontSize: 10, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{count}</span>
      )}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// ROUTER — picks the right shell per pov
// ════════════════════════════════════════════════════════════════════

/**
 * Pending conversation id, set by callers (e.g. the Today bookings row)
 * just before they navigate to the messages page. The shell consumes it
 * on mount and clears it. Module-level so it survives the lazy-import
 * boundary; one-shot so a refresh doesn't keep re-pinning the same row.
 */
let __pendingActiveConversationId: string | null = null;
export function pinNextConversation(id: string) { __pendingActiveConversationId = id; }
export function consumePendingConversation(): string | null {
  const v = __pendingActiveConversationId;
  __pendingActiveConversationId = null;
  return v;
}

// ── Local row-override store ──
// Submit-rate / Withdraw flows write into this module-level map keyed
// by `${convId}:${rowId}`. Any consumer reading an offer for a conv
// merges the matching overrides on top before rendering, so a rate the
// talent just submitted shows up in:
//   • the offer-tab lineup row (status flips to "submitted")
//   • the conversation header take-home pill (re-derived via the rate Proxy)
//   • the inbox row's right-side rate
//   • Today's calendar tile + earnings "in flight" strip
//   • the historical-offer card on the booking tab
// Without this lift, the override died the moment the user clicked
// away from the offer tab — a demo killer.
const __rowOverrides: Record<string, Partial<LineupRow>> = {};
const __rowOverrideSubscribers = new Set<() => void>();
export function setRowOverride(convId: string, rowId: string, patch: Partial<LineupRow>) {
  const key = `${convId}:${rowId}`;
  __rowOverrides[key] = { ...__rowOverrides[key], ...patch };
  __rowOverrideSubscribers.forEach(fn => fn());
  // Notify offer-stash subscribers too so any consumer of
  // getEffectiveOffer re-renders when row overrides change.
  __offerSubscribers.forEach(fn => fn());
}
export function clearRowOverrides(convId: string) {
  for (const key of Object.keys(__rowOverrides)) {
    if (key.startsWith(`${convId}:`)) delete __rowOverrides[key];
  }
  __rowOverrideSubscribers.forEach(fn => fn());
}
export function getRowOverride(convId: string, rowId: string): Partial<LineupRow> | undefined {
  return __rowOverrides[`${convId}:${rowId}`];
}
export function applyRowOverrides(convId: string, offer: Offer): Offer {
  const hasAny = offer.rows.some(r => __rowOverrides[`${convId}:${r.id}`]);
  if (!hasAny) return offer;
  return {
    ...offer,
    rows: offer.rows.map(r => {
      const o = __rowOverrides[`${convId}:${r.id}`];
      return o ? ({ ...r, ...o } as LineupRow) : r;
    }),
  };
}
function useRowOverrideSubscription() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __rowOverrideSubscribers.add(fn);
    return () => { __rowOverrideSubscribers.delete(fn); };
  }, []);
}

// ── Module-level offer-override store ──
// Talent-side rate submissions, client-side approvals, admin-side
// stage transitions all write into this single store, keyed by conv
// id. Every shell reads through `getEffectiveOffer(convId)` instead
// of `MOCK_OFFER_FOR_CONV` directly, so a mutation made by talent
// is visible to client + admin in real time (within a session).
type OfferOverride = {
  /** Local stage override — wins over the seed offer.stage. */
  stage?: Offer["stage"];
  /** Per-row patches keyed by row.id. */
  rows?: Record<string, Partial<LineupRow>>;
  /** Extra timeline events appended after the seed timeline. */
  appendedTimeline?: TimelineEvent[];
};
const __offerOverrides: Record<string, OfferOverride> = {};
const __offerSubscribers = new Set<() => void>();
export function getEffectiveOffer(convId: string): Offer | undefined {
  const seed = MOCK_OFFER_FOR_CONV[convId] ?? MOCK_OFFER_FOR_CONV[RICH_OFFER_ALIAS[convId] ?? ""];
  if (!seed) return undefined;
  const ov = __offerOverrides[convId];
  // Layer 1 — apply offer-level overrides (stage + new timeline events).
  const withOfferOv: Offer = ov ? {
    ...seed,
    stage: ov.stage ?? seed.stage,
    rows: ov.rows
      ? seed.rows.map(r => ov.rows?.[r.id] ? { ...r, ...ov.rows[r.id] } as LineupRow : r)
      : seed.rows,
    timeline: ov.appendedTimeline
      ? [...seed.timeline, ...ov.appendedTimeline]
      : seed.timeline,
  } : seed;
  // Layer 2 — apply per-row overrides (the older talent-shell store).
  // Both stores can be writing to the same conv, e.g. talent submits a
  // rate (→ __rowOverrides) and client approves (→ __offerOverrides).
  return applyRowOverrides(convId, withOfferOv);
}
export function applyOfferOverride(convId: string, patch: OfferOverride): void {
  const prev = __offerOverrides[convId] ?? {};
  __offerOverrides[convId] = {
    stage: patch.stage ?? prev.stage,
    rows: patch.rows ? { ...(prev.rows ?? {}), ...patch.rows } : prev.rows,
    appendedTimeline: patch.appendedTimeline
      ? [...(prev.appendedTimeline ?? []), ...patch.appendedTimeline]
      : prev.appendedTimeline,
  };
  __offerSubscribers.forEach(fn => fn());
}
function useOfferStashSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __offerSubscribers.add(fn);
    return () => { __offerSubscribers.delete(fn); };
  }, []);
}

// ── Per-conv "My notes" store ──
// TalentBookingTab + ClientProjectViewTab both render a notes
// textarea. Without per-conv keying the same draft showed on every
// conversation. Now keyed by conv.id so each project has its own.
const __notesStash: Record<string, string> = {};
const __notesSubscribers = new Set<() => void>();
export function readConvNote(convId: string): string {
  return __notesStash[convId] ?? "";
}
export function writeConvNote(convId: string, text: string): void {
  __notesStash[convId] = text;
  __notesSubscribers.forEach(fn => fn());
}
function useNotesSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __notesSubscribers.add(fn);
    return () => { __notesSubscribers.delete(fn); };
  }, []);
}

// ── Local message stash ──
// Module-level appendable store of "messages I just sent" keyed by
// thread id (e.g. "c1:talent" / "c7:client" / bare "c1"). Composer
// sends push into this store; thread renderers concat seed +
// stashed when reading. Survives unmount/remount within a session;
// resets on full reload. Lets the demo "send → see your bubble"
// without a backend.
// Sender on a stashed message — supports both "you" (default — sent
// as the individual user) and "workspace" (Phase 4 of System User
// direction — sent on behalf of the workspace, e.g. "Atelier Roma:
// Booking confirmed").
type StashedMsg = { id: string; body: string; ts: string; sender: "you" | "workspace" };
const __localMsgStash: Record<string, StashedMsg[]> = {};
const __msgSubscribers = new Set<() => void>();
export function appendLocalMessage(threadKey: string, body: string, sender: "you" | "workspace" = "you") {
  const trimmed = body.trim();
  if (!trimmed) return;
  const arr = __localMsgStash[threadKey] ?? [];
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  arr.push({ id: `local-${threadKey}-${arr.length + 1}`, body: trimmed, ts: `Just now · ${stamp}`, sender });
  __localMsgStash[threadKey] = arr;
  __msgSubscribers.forEach(fn => fn());
}
export function readLocalMessages(threadKey: string): StashedMsg[] {
  return __localMsgStash[threadKey] ?? [];
}
function useMessageStashSubscription() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __msgSubscribers.add(fn);
    return () => { __msgSubscribers.delete(fn); };
  }, []);
}

// ── Conv flags store (pinned + manual-unread) ──
// User-curated row state that persists across reloads. Pinning floats
// a conv to the top of the inbox; manual-unread flips the row's seen
// state back to unseen so the user can come back to it later. Both
// signals live in one store keyed by conv id, persisted to
// localStorage so they survive refresh.
type ConvFlags = { pinned?: boolean; manualUnread?: boolean };
const __FLAGS_STORAGE_KEY = "tulala.proto.convFlags.v1";
const __convFlags: Record<string, ConvFlags> = (() => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(__FLAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, ConvFlags>;
  } catch { return {}; }
})();
function __persistFlags() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(__FLAGS_STORAGE_KEY, JSON.stringify(__convFlags)); } catch { /* ignore */ }
}
const __flagsSubscribers = new Set<() => void>();
export function isPinned(id: string): boolean {
  return !!__convFlags[id]?.pinned;
}
export function isManualUnread(id: string): boolean {
  return !!__convFlags[id]?.manualUnread;
}
export function togglePin(id: string) {
  const cur = __convFlags[id] ?? {};
  __convFlags[id] = { ...cur, pinned: !cur.pinned };
  __persistFlags();
  __flagsSubscribers.forEach(fn => fn());
}
export function toggleManualUnread(id: string) {
  const cur = __convFlags[id] ?? {};
  __convFlags[id] = { ...cur, manualUnread: !cur.manualUnread };
  // When marking manual-unread, also remove from the locally-seen
  // set so the NEW pill / coral wash returns. When clearing, leave
  // locally-seen alone (the user already saw it once).
  if (__convFlags[id]?.manualUnread) {
    __locallySeenConvs.delete(id);
    __persistSeen();
    __seenSubscribers.forEach(fn => fn());
  }
  __persistFlags();
  __flagsSubscribers.forEach(fn => fn());
}
function useFlagsSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __flagsSubscribers.add(fn);
    return () => { __flagsSubscribers.delete(fn); };
  }, []);
}
// Sort items so pinned ones float to the top while preserving the
// caller's existing order otherwise. Stable across rerenders.
function sortPinnedFirst<T extends { id: string }>(items: T[]): T[] {
  // Use a partition to avoid in-place sort allocating; keeps original
  // order within each bucket which matters because filters sort the
  // input by recency / SLA before this point.
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const i of items) {
    if (isPinned(i.id)) pinned.push(i); else rest.push(i);
  }
  return pinned.length === 0 ? items : [...pinned, ...rest];
}

// ── Handoff queue store ──
// Module-level log of coordinator reassignments. When a Reassign
// happens, we push an entry here so the receiving coord sees an
// "Incoming handoff" badge on the affected inbox row + can filter to
// just their incoming queue. Clears when the receiving coord opens
// the row (clearHandoff).
type HandoffEntry = {
  inquiryId: string;
  fromCoordName: string;
  toCoordName: string;
  note: string;
  ts: number;
};
const __handoffStash: HandoffEntry[] = [];
const __handoffSubscribers = new Set<() => void>();
export function recordHandoff(entry: Omit<HandoffEntry, "ts">) {
  __handoffStash.push({ ...entry, ts: Date.now() });
  __handoffSubscribers.forEach(fn => fn());
}
export function clearHandoff(inquiryId: string, toCoordName: string) {
  const before = __handoffStash.length;
  for (let i = __handoffStash.length - 1; i >= 0; i--) {
    const h = __handoffStash[i]!;
    if (h.inquiryId === inquiryId && h.toCoordName === toCoordName) {
      __handoffStash.splice(i, 1);
    }
  }
  if (__handoffStash.length !== before) __handoffSubscribers.forEach(fn => fn());
}
export function getIncomingHandoffs(coordName: string): HandoffEntry[] {
  return __handoffStash.filter(h => h.toCoordName === coordName);
}
function useHandoffSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __handoffSubscribers.add(fn);
    return () => { __handoffSubscribers.delete(fn); };
  }, []);
}

// ── Seen-state store ──
// Tracks which "brand-new" conversations the user has opened. Started
// as a session-only Set; now persisted to localStorage so the demo
// doesn't re-pill every fresh session (a row that's been opened stays
// opened). Falls back to in-memory only when localStorage isn't
// available (SSR, private browsing, sandboxed previews).
const __SEEN_STORAGE_KEY = "tulala.proto.seenConvs.v1";
const __locallySeenConvs: Set<string> = (() => {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(__SEEN_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : new Set<string>();
  } catch {
    return new Set<string>();
  }
})();
function __persistSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(__SEEN_STORAGE_KEY, JSON.stringify(Array.from(__locallySeenConvs)));
  } catch { /* quota / private mode — keep in-memory copy */ }
}
const __seenSubscribers = new Set<() => void>();
export function markConvSeen(id: string) {
  if (__locallySeenConvs.has(id)) return;
  __locallySeenConvs.add(id);
  __persistSeen();
  __seenSubscribers.forEach(fn => fn());
}
export function isLocallySeen(id: string): boolean {
  return __locallySeenConvs.has(id);
}
function useSeenSubscription() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __seenSubscribers.add(fn);
    return () => { __seenSubscribers.delete(fn); };
  }, []);
}

/**
 * Pending thread-tab id, paired with pinNextConversation. Lets a caller
 * deep-link not just to the right thread but to the right tab inside
 * it — e.g. Today's "Next on the calendar" pins a booked conversation
 * AND opens the Logistics tab so the talent lands on the call sheet,
 * not the chat. One-shot like the conversation pin.
 */
let __pendingThreadTab: string | null = null;
export function pinNextThreadTab(tabId: string) { __pendingThreadTab = tabId; }
export function consumePendingThreadTab(): string | null {
  const v = __pendingThreadTab;
  __pendingThreadTab = null;
  return v;
}

/**
 * Inquiry RI-* → talent/client conversation cN. Centralized so every
 * caller routing into the message shell (Today rows, calendar marks,
 * workspace inbox, talent inbox, etc.) maps consistently. Wrapped/
 * past inquiries still resolve — the shell renders read-only stages.
 */
export const INQUIRY_TO_CONV_GLOBAL: Record<string, string> = {
  "RI-201": "c1",  // Mango spring lookbook
  "RI-202": "c3",  // Vogue Italia
  "RI-203": "c2",  // Bvlgari jewelry
  "RI-204": "c1",  // Estudio Roca
  "RI-205": "c2",  // Valentino SS26
  "RI-207": "c5",  // H&M past
};

/**
 * One-call helper: pin the matching conversation and return the page
 * setter the caller should pair with. Use like:
 *   const route = useInquiryRoute();
 *   route(inquiryId, "talent")  // or "client" or "admin"
 * The drawer-based legacy `openDrawer("inquiry-workspace", ...)` is
 * deprecated; this is the single replacement.
 */
export function routeToInquiry(
  inquiryId: string,
  pov: "talent" | "client" | "admin",
  setPageFns: { setTalentPage?: (p: string) => void; setClientPage?: (p: string) => void; setPage?: (p: string) => void },
) {
  // Resolve to a conv id when possible — talent + client shells are
  // keyed by cN, the admin shell handles RI-* directly via reverse map.
  const convId = INQUIRY_TO_CONV_GLOBAL[inquiryId] ?? inquiryId;
  pinNextConversation(convId);
  if (pov === "talent") setPageFns.setTalentPage?.("messages");
  else if (pov === "client") setPageFns.setClientPage?.("messages");
  else setPageFns.setPage?.("messages");
}

export function MessagesShell({ pov }: { pov: MessagesPov }) {
  if (pov === "admin")  return <AdminOperationsShell />;
  if (pov === "talent") return <TalentJobShell />;
  return <ClientProjectShell />;
}

// ════════════════════════════════════════════════════════════════════
// 1) ADMIN OPERATIONS SHELL — workspace admin / coordinator
// ════════════════════════════════════════════════════════════════════
//
// This shell feels like an operations console:
//   • inbox left (with admin-flavored rows: stage + needs-me + lineup)
//   • thread + composer center (uses existing pov-aware WorkspaceBody)
//   • operational right rail handled inside WorkspaceBody (Lineup, Offer
//     builder, Coordinator, Activity, Files)
//
// The right rail in WorkspaceBody already gives admin everything they
// need. The admin's job: flip between Client thread / Talent group /
// Files (the existing tabs) and use the rail to drive the deal forward.

type AdminFilter = "all" | "needs-me" | "unread" | "coordinating" | "handoffs" | "inquiry" | "hold" | "booked" | "past";

function AdminOperationsShell() {
  const inquiries = RICH_INQUIRIES;
  // Re-render on seen-state changes so the inbox re-sorts the moment
  // a row gets clicked (NEW pill drops, unseen tier loses that row).
  useSeenSubscription();
  // Pin-aware initial state — same pattern as the other shells. The pin
  // can carry either a conv id (cN) OR an inquiry id (RI-XXX); we map
  // through INQUIRY_TO_CONV reverse if needed.
  const { initialId, fromPin } = (() => {
    const pending = consumePendingConversation();
    if (!pending) return { initialId: inquiries[0]?.id ?? "", fromPin: false };
    if (inquiries.some(i => i.id === pending)) return { initialId: pending, fromPin: true };
    const reverseFromConv: Record<string, string> = { c1: "RI-201", c2: "RI-202", c3: "RI-203" };
    const ri = reverseFromConv[pending];
    if (ri && inquiries.some(i => i.id === ri)) return { initialId: ri, fromPin: true };
    return { initialId: inquiries[0]?.id ?? "", fromPin: false };
  })();
  const [activeId, setActiveId] = useState<string>(initialId);
  // Initial conv counts as seen on mount so the user never sees a NEW
  // pill on the conv they're currently viewing.
  useEffect(() => {
    if (initialId) markConvSeen(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminFilter>("needs-me");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(fromPin ? "thread" : "list");

  const stageBucket = (s: string): "inquiry" | "hold" | "booked" | "past" => {
    if (s === "draft" || s === "submitted" || s === "coordination") return "inquiry";
    if (s === "offer_pending") return "hold";
    if (s === "approved" || s === "booked") return "booked";
    return "past";
  };

  // talent_coord lens — inquiries where the current user (Marta) is
  // the coordinator on the lineup. Surfaces the dedicated "I'm
  // running this" view for talent who manage their own studios.
  const isCoordOnInquiry = (i: RichInquiry) =>
    i.coordinator?.name === "Marta Reyes"
    || i.requirementGroups.some(g => g.talents.some(t => t.name === "Marta Reyes"));

  // Pre-compute incoming handoff inquiry-id set so the row filter can
  // do a quick membership check without re-querying the store per row.
  const handoffIds = new Set(getIncomingHandoffs("Marta Reyes").map(h => h.inquiryId));
  const filtered = inquiries.filter(i => {
    const bucket = stageBucket(i.stage);
    if (filter === "needs-me" && i.nextActionBy !== "coordinator") return false;
    if (filter === "unread" && i.unreadGroup === 0 && i.unreadPrivate === 0) return false;
    if (filter === "coordinating" && !isCoordOnInquiry(i)) return false;
    if (filter === "handoffs" && !handoffIds.has(i.id)) return false;
    if (filter !== "all" && filter !== "needs-me" && filter !== "unread" && filter !== "coordinating" && filter !== "handoffs" && bucket !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      // Search across all the things an admin would scan for: client
      // name, brief, agency, coordinator name, location/city, and the
      // brief inquiry source label. Used to be client+brief only —
      // searching for "Sara" or "Lisbon" returned nothing.
      const haystack = [
        i.clientName,
        i.brief,
        i.agencyName,
        i.coordinator?.name,
        i.location,
        i.source.kind === "hub" ? i.source.hubName : "",
        i.source.kind === "direct" ? i.source.domain : "",
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Same chronological model as the talent + client inboxes:
    //   Tier 1 — unseen / brand-new inquiries first (most urgent)
    //   Tier 2 — needs-me first (admin owes a reply)
    //   Tier 3 — recency (lower ageHrs = more recent → top)
    const aNew = (a.seen === false && !isLocallySeen(a.id)) ? 1 : 0;
    const bNew = (b.seen === false && !isLocallySeen(b.id)) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aMine = a.nextActionBy === "coordinator" ? 1 : 0;
    const bMine = b.nextActionBy === "coordinator" ? 1 : 0;
    if (aMine !== bMine) return bMine - aMine;
    return a.lastActivityHrs - b.lastActivityHrs;
  });

  const active = inquiries.find(i => i.id === activeId) ?? filtered[0] ?? inquiries[0];
  const totalUnread = inquiries.reduce((s, i) => s + i.unreadGroup + i.unreadPrivate, 0);
  const needsMe = inquiries.filter(i => i.nextActionBy === "coordinator").length;

  return (
    <>
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          ["--tulala-shell-cols" as never]: "340px 1fr",
          gridTemplateColumns: "var(--tulala-shell-cols)",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
          height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 200px), 820px)",
          minHeight: 560,
          minWidth: 0,
          maxWidth: "100%",
          fontFamily: FONTS.body,
        }}
      >
        {/* Same fixed-position mobile pattern as the talent + client
            shells. Shell pins to viewport between identity bar (top)
            and bottom nav, panes stack via grid + slide between via
            translateX (CSS lives in page.tsx). */}
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){"
          + "[data-tulala-messages-shell]{"
          + "position:fixed!important;"
          + "left:0!important;right:0!important;"
          + "width:100vw!important;max-width:100vw!important;"
          + "grid-template-columns:1fr!important;"
          + "top:calc(var(--proto-cbar, 50px) + 56px)!important;"
          + "bottom:80px!important;"
          + "height:calc(100dvh - var(--proto-cbar, 50px) - 56px - 80px)!important;"
          + "min-height:0!important;max-height:none!important;"
          + "border-radius:0!important;border-left:0!important;border-right:0!important;"
          + "z-index:10!important;"
          + "}"
          + "[data-tulala-messages-shell] > *{min-width:0!important;max-width:100%!important}"
          + "}"
        }} />
        <AdminInboxList
          inquiries={filtered}
          activeId={active?.id ?? ""}
          onSelect={(id) => { setActiveId(id); setMobilePane("thread"); markConvSeen(id); }}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          totalUnread={totalUnread}
          needsMe={needsMe}
        />
        <div data-tulala-thread-pane style={{ display: "flex", flexDirection: "column", minHeight: 0, background: COLORS.surfaceAlt, overflow: "hidden" }}>
          {active ? <AdminInquiryDetail inquiry={active} onBack={() => setMobilePane("list")} /> : <EmptyDetail label="No inquiry selected" />}
        </div>
      </div>
      {mobilePane === "thread" && (
        <MobileInboxTab
          unreadCount={totalUnread}
          onOpen={() => setMobilePane("list")}
        />
      )}
    </>
  );
}

// ── Admin: dense operations row ──
// Information-rich for triage. Inline signals: stage · budget (when
// known) · shoot date · who-owns-it (coordinator initials) · lineup
// progress dots. The "⚡ needs you" chip only appears when the chip
// would tell you something the filter doesn't already (i.e. NOT shown
// when the active filter is itself "needs-me").
// AdminInquiryRow uses the SAME 4-row template as ClientProjectRow so
// the inbox reads with one design language across all three roles. The
// only differences are admin-specific signals folded into the same
// slots:
//   • Row 1 title is the brief (the project), not the client name
//   • Row 2 leads with the client + lineup count "0/1" (admin
//     operational data) instead of the client's "via Agency"
//   • Row 3 status line speaks admin's voice ("Awaiting your reply",
//     "3 talents pending") rather than the client's ("Coordinator
//     preparing your shortlist")
//   • Row 4 right slot is the coordinator-owner avatar+name (same
//     as client's, just sourced differently)
//   • Avatar carries the ClientTrustBadge — admin-only signal
function AdminInquiryRow({
  inquiry, active, onClick, hideNeedsYouChip,
}: { inquiry: RichInquiry; active: boolean; onClick: () => void; hideNeedsYouChip: boolean }) {
  const totalUnread = inquiry.unreadGroup + inquiry.unreadPrivate;
  const allTalents = inquiry.requirementGroups.flatMap(g => g.talents);
  const lineupTotal = allTalents.length;
  const lineupAccepted = allTalents.filter(t => t.status === "accepted").length;
  const stageBucket: "inquiry" | "hold" | "booked" | "past" =
      inquiry.stage === "draft" || inquiry.stage === "submitted" || inquiry.stage === "coordination" ? "inquiry"
    : inquiry.stage === "offer_pending" ? "hold"
    : inquiry.stage === "approved" || inquiry.stage === "booked" ? "booked"
    : "past";
  const sc = stageStyle(stageBucket);
  const needsMe = inquiry.nextActionBy === "coordinator";
  // hideNeedsYouChip is set when the user is already filtering by
  // needs-me — we drop the redundant cue from the row in that case.
  const surfaceNeedsMe = needsMe && !hideNeedsYouChip;
  // Coordinator owner — admin needs to know "who owns this" at a glance
  const coord = inquiry.coordinator;

  // Map to client-row's 4-row vocabulary. "Title" = the project brief.
  // "Subtitle" = client + date + city, comma-joined, ellipsised.
  const cityLabel = inquiry.location?.split(" · ")[0] ?? null;
  const briefMentionsCity = cityLabel && inquiry.brief.toLowerCase().includes(cityLabel.toLowerCase());
  const subtitleParts = [
    inquiry.clientName,
    inquiry.date ? withWeekday(inquiry.date) : null,
    !briefMentionsCity ? cityLabel : null,
  ].filter(Boolean);

  // Status line — admin's voice. Action-needed cases pull a coral
  // bullet (same affordance as ClientProjectRow's `isActionNeeded`).
  const lastMsg = inquiry.messages[inquiry.messages.length - 1];
  const statusLine = (() => {
    if (surfaceNeedsMe && lastMsg && !lastMsg.isYou) return `${(lastMsg.body || "").slice(0, 64)}`;
    if (inquiry.stage === "draft")          return "Draft · not yet sent to talent";
    if (inquiry.stage === "submitted")      return "Inviting talent to the shortlist";
    if (inquiry.stage === "coordination")   return lineupAccepted < lineupTotal ? `Coordinating · ${lineupAccepted}/${lineupTotal} confirmed` : "All talent confirmed · drafting offer";
    if (inquiry.stage === "offer_pending")  return inquiry.offer?.total ? `Offer ${inquiry.offer.total} · awaiting client` : "Offer with client · awaiting approval";
    if (inquiry.stage === "approved")       return "Client approved · prep production";
    if (inquiry.stage === "booked")         return inquiry.offer?.total ? `Booked · ${inquiry.offer.total}` : "Booked · schedule confirmed";
    if (inquiry.stage === "rejected")       return "Rejected by client";
    if (inquiry.stage === "expired")        return "Expired · client never replied";
    if (lastMsg) return (lastMsg.isYou ? "You: " : "") + (lastMsg.body || "").slice(0, 64);
    return "No messages yet";
  })();
  const isActionNeeded = surfaceNeedsMe;

  // Stage word — uppercase pipeline label that lives next to the funnel
  // dots in row 4. Mirrors ClientProjectRow's stageWord pattern.
  const stageWord = inquiry.stage === "offer_pending" ? "Offer"
    : inquiry.stage === "approved"     ? "Approved"
    : inquiry.stage === "coordination" ? "Coordinating"
    : inquiry.stage === "submitted"    ? "Inquiry"
    : inquiry.stage === "draft"        ? "Draft"
    : inquiry.stage === "rejected"     ? "Rejected"
    : inquiry.stage === "expired"      ? "Expired"
    : inquiry.stage.charAt(0).toUpperCase() + inquiry.stage.slice(1);

  // Same seen + tint logic as the talent + client inboxes so the
  // row pattern reads identically across all three roles.
  // Manual-unread (user toggled "Mark unread" in hover actions)
  // overrides the locally-seen state so the row reads as unseen
  // even if it was opened before.
  const isUnseen = isManualUnread(inquiry.id) || (inquiry.seen === false && !isLocallySeen(inquiry.id));
  const stageBg: string =
    active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,48,58,0.05)"
    : isActionNeeded ? "rgba(176,48,58,0.04)"
    : stageBucket === "booked" ? "rgba(46,125,91,0.045)"
    : "transparent";

  const rowRef = useScrollIntoViewWhenActive(active);

  // Build a "source"-shaped chip from inquiry.source so we can reuse
  // sourceChipMeta. RichInquiry.source.kind uses the canonical schema
  // names ("hub" / "direct" / "manual" / "marketplace" / "talent-page");
  // sourceChipMeta speaks the conversation-side shape ("tulala-hub" /
  // "direct" / "agency-referral" / "instagram-dm" / "email"). Map
  // here so the same chip component renders for both surfaces.
  const sourceMeta = (() => {
    const src = inquiry.source;
    if (!src) return null;
    if (src.kind === "hub")          return sourceChipMeta({ kind: "tulala-hub", label: src.hubName });
    if (src.kind === "direct")       return sourceChipMeta({ kind: "direct", label: src.domain });
    if (src.kind === "manual")       return sourceChipMeta({ kind: src.channel === "email" ? "email" : "direct" });
    if (src.kind === "marketplace")  return sourceChipMeta({ kind: "tulala-hub", label: src.platform });
    if (src.kind === "talent-page")  return sourceChipMeta({ kind: "direct", label: src.customDomain ?? src.talentSlug });
    return null;
  })();

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      data-tulala-inbox-row
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        width: "100%", padding: "12px 14px",
        background: stageBg,
        borderLeft: active ? `3px solid ${COLORS.accent}`
          : isUnseen ? `3px solid ${COLORS.coral}`
          : isActionNeeded ? `3px solid ${COLORS.coral}88`
          : "3px solid transparent",
        // Longhand to silence React's shorthand-vs-longhand warning.
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
        position: "relative",
      }}
    >
      <InboxRowHoverActions rowId={inquiry.id} label={inquiry.clientName} />
      {/* Project avatar — initial of the brief (matches client row's
          choice to lead with the project, not the client). Trust badge
          stays as an avatar overlay because it's an admin-only signal
          we don't want to surface elsewhere. */}
      <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
        <Avatar
          size={36}
          tone="auto"
          hashSeed={inquiry.brief + inquiry.clientName}
          initials={initialsOf(inquiry.brief.split(" ").slice(0, 2).join(" "))}
        />
        <ClientTrustBadge level={inquiry.clientTrust} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — project (brief) + NEW pill + age */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span title={inquiry.brief} style={{
            fontSize: 14, fontWeight: 700, color: COLORS.ink,
            flex: 1, minWidth: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            lineHeight: 1.25, letterSpacing: -0.1,
          }}>
            {inquiry.brief}
          </span>
          {isUnseen && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              padding: "2px 6px", borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              textTransform: "uppercase",
              boxShadow: `0 0 0 2px ${COLORS.coral}1f`,
            }}>NEW</span>
          )}
          <span style={{ flexShrink: 0, fontSize: 10.5, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>
            {ageLabel(inquiry.lastActivityHrs)}
          </span>
        </div>

        {/* Row 2 — client + date + city + tiny lineup count + source chip.
            Lineup count is admin-specific operational signal that lives
            INLINE in this row (rather than the old separate ops-meta
            row) so the row is no taller than the client's. */}
        {(subtitleParts.length > 0 || sourceMeta || lineupTotal > 0) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4,
            minWidth: 0,
          }}>
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1,
            }}>
              {subtitleParts.join(" · ")}
            </span>
            {lineupTotal > 0 && (() => {
              // Tone ladder: red at 0/N (nobody on yet — needs urgent
              // outreach), amber while partially accepted (still chasing),
              // green at full (locked in). Drives quick scanning of the
              // pipeline health column without reading numbers.
              const tone = lineupAccepted === 0 ? "red"
                : lineupAccepted < lineupTotal ? "amber"
                : "green";
              const palette = tone === "red"
                ? { bg: `${COLORS.coral}15`, fg: COLORS.coralDeep }
                : tone === "amber"
                ? { bg: `${COLORS.amber}1c`, fg: COLORS.amber }
                : { bg: COLORS.successSoft, fg: COLORS.successDeep };
              return (
                <span aria-label={`${lineupAccepted} of ${lineupTotal} talent accepted`} style={{
                  flexShrink: 0,
                  fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  padding: "1px 6px", borderRadius: 999,
                  background: palette.bg, color: palette.fg,
                }}>{lineupAccepted}/{lineupTotal}</span>
              );
            })()}
            {sourceMeta && (
              <span title={sourceMeta.tooltip} style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 6px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                textTransform: "uppercase",
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
            )}
          </div>
        )}

        {/* Row 3 — status line (admin voice) + unread badge. Coral
            bullet appears when the row needs admin action, mirroring
            the client row's action-needed treatment. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {isActionNeeded && (
            <span aria-hidden style={{
              flexShrink: 0,
              width: 6, height: 6, borderRadius: "50%",
              background: COLORS.coral,
            }} />
          )}
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 11.5,
            color: isActionNeeded ? COLORS.coralDeep : totalUnread > 0 ? COLORS.ink : COLORS.inkMuted,
            fontWeight: isActionNeeded ? 600 : totalUnread > 0 ? 500 : 400,
            lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {statusLine}
          </span>
          {totalUnread > 0 && (
            <span style={{
              flexShrink: 0,
              minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, boxSizing: "border-box",
              background: COLORS.accent, color: "#fff",
              fontSize: 9.5, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>{totalUnread}</span>
          )}
        </div>

        {/* Row 4 — funnel dots + stage word + coordinator owner chip. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ flex: "0 0 auto", maxWidth: 130 }}>
            <JobStageFunnel currentStage={inquiry.stage} compact={true} />
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: sc.fg, letterSpacing: 0.3, textTransform: "uppercase",
            flexShrink: 0,
          }}>
            {stageWord}
          </span>
          <span style={{ flex: 1 }} />
          {coord && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              flexShrink: 0,
              fontSize: 10.5, color: COLORS.inkMuted,
            }} title={coord.name}>
              <Avatar size={14} tone="ink" hashSeed={coord.name} initials={coord.initials} />
              {coord.name.split(" ")[0]}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function AdminInboxList({
  inquiries, activeId, onSelect, search, onSearchChange, filter, onFilterChange, totalUnread, needsMe,
}: {
  inquiries: RichInquiry[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string; onSearchChange: (s: string) => void;
  filter: AdminFilter; onFilterChange: (f: AdminFilter) => void;
  totalUnread: number; needsMe: number;
}) {
  // "Coordinating" surfaces the talent_coord lens — inquiries where
  // the user is the coordinator on the lineup (their own studio's
  // bookings). Pinned with a small star so it reads as a saved view.
  const coordCount = inquiries.filter(i =>
    i.coordinator?.name === "Marta Reyes"
    || i.requirementGroups.some(g => g.talents.some(t => t.name === "Marta Reyes")),
  ).length;
  // Subscribe to handoff store + count the user's incoming handoffs.
  // The "Handoffs" chip only renders when the queue is non-empty so
  // the inbox doesn't carry dead chrome in steady state.
  useHandoffSubscription();
  // Subscribe to pin/manual-unread flags so the inbox re-orders +
  // re-tints when those toggle from a row's hover actions.
  useFlagsSubscription();
  const incomingHandoffs = getIncomingHandoffs("Marta Reyes");
  const handoffCount = incomingHandoffs.length;
  // Saved views — "Coordinating" + "Handoffs" are the canonical
  // saved views in the prototype; production would let users build
  // and pin their own (filter + search + sort). They appear at the
  // start of the chip row with a star pin so they read as
  // first-class user-curated entry points, not just filters.
  const chips: { id: AdminFilter; label: string; count?: number; pin?: boolean }[] = [
    { id: "all", label: "All" },
    { id: "needs-me", label: `Needs me${needsMe > 0 ? ` (${needsMe})` : ""}` },
    { id: "unread", label: `Unread${totalUnread > 0 ? ` (${totalUnread})` : ""}` },
    ...(handoffCount > 0 ? [{ id: "handoffs" as const, label: "Handoffs", count: handoffCount, pin: true }] : []),
    ...(coordCount > 0 ? [{ id: "coordinating" as const, label: "Coordinating", count: coordCount, pin: true }] : []),
    { id: "inquiry", label: "Inquiry" },
    { id: "hold", label: "Offer pending" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
  ];

  // Bulk-select state — flipping into bulk mode reveals row checkboxes
  // + a floating action bar at the bottom of the inbox. Single-select
  // is the default (just opens the row); bulk mode is the explicit
  // gesture for multi-row operations (nudge / archive / reassign).
  // Operations are admin+ only — Coord/Editor see the bulk button
  // hidden so they don't get a no-op toggle.
  const { toast: toastBulk } = useProto();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitBulk = () => { setBulkMode(false); setSelectedIds(new Set()); };

  return (
    <aside data-tulala-list-pane style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${COLORS.borderSoft}`, background: "#fff",
      minHeight: 0, minWidth: 0, maxWidth: "100%",
    }}>
      <HoverActionsCss />
      <div data-tulala-inbox-header style={{
        padding: "14px 14px 8px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        minWidth: 0, maxWidth: "100%",
      }}>
        <div data-tulala-list-header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Inbox</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{inquiries.length} thread{inquiries.length === 1 ? "" : "s"}</span>
            {/* Bulk-select toggle — admin+ only. Visible chevron pill
                so the affordance reads as "switch into bulk mode" not
                some hidden gesture. */}
            <button type="button"
              onClick={() => setBulkMode(b => !b)}
              title={bulkMode ? "Exit bulk select" : "Select multiple threads"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 999,
                border: `1px solid ${bulkMode ? COLORS.accent : COLORS.borderSoft}`,
                background: bulkMode ? COLORS.accentSoft : "transparent",
                color: bulkMode ? COLORS.accentDeep : COLORS.inkMuted,
                fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                fontFamily: FONTS.body, textTransform: "uppercase", letterSpacing: 0.4,
              }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                <rect x="1.5" y="1.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="7" y="1.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="1.5" y="7" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="7" y="7" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              {bulkMode ? "Done" : "Select"}
            </button>
          </div>
        </div>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-list-header] { display: none !important; }
            [data-tulala-inbox-header],
            [data-tulala-inbox-search],
            [data-tulala-inbox-chips],
            [data-tulala-inbox-scroll] {
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            [data-tulala-inbox-chips] {
              overflow-x: auto !important;
              scrollbar-width: none !important;
            }
            [data-tulala-inbox-chips]::-webkit-scrollbar { display: none !important; }
          }
        `}</style>
        <div data-tulala-inbox-search style={{ marginBottom: 10 }}>
          <SearchPill value={search} onChange={onSearchChange} placeholder="Search clients, briefs…" />
        </div>
        <div data-tulala-inbox-chips style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {chips.map(c => (
            <FilterChip
              key={c.id} id={c.id} label={c.label}
              active={filter === c.id}
              count={c.count}
              icon={c.pin ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
              ) : undefined}
              onClick={() => onFilterChange(c.id)}
            />
          ))}
        </div>
      </div>
      <div data-tulala-inbox-scroll style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        minWidth: 0, maxWidth: "100%",
      }}>
        {inquiries.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt, color: COLORS.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              {search.trim() ? <>No matches for &ldquo;{search}&rdquo;</> : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4, maxWidth: 240 }}>
              {search.trim() ? "Try a different keyword, or clear the search." : <>Try the <strong>All</strong> filter or clear your search.</>}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => onSearchChange("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>Clear search</button>
            )}
          </div>
        ) : renderWithDateGroups(
            sortPinnedFirst(inquiries),
            i => i.lastActivityHrs,
            i => (
              // In bulk mode, wrap each row with a checkbox lane on the
              // left. The row click toggles selection (instead of opening
              // the conv) so the gesture stays consistent.
              bulkMode ? (
                <div key={i.id} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  paddingLeft: 8,
                  background: selectedIds.has(i.id) ? COLORS.accentSoft : "transparent",
                }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(i.id)}
                    onChange={() => toggleSelect(i.id)}
                    aria-label={`Select ${i.clientName}`}
                    style={{ width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AdminInquiryRow inquiry={i} active={false} onClick={() => toggleSelect(i.id)} hideNeedsYouChip={filter === "needs-me"} />
                  </div>
                </div>
              ) : (
                <AdminInquiryRow key={i.id} inquiry={i} active={i.id === activeId} onClick={() => onSelect(i.id)} hideNeedsYouChip={filter === "needs-me"} />
              )
            ),
          )}
      </div>
      {/* Bulk action bar — sticky bottom strip when one+ rows selected.
          Counts the selection + shows the three primary bulk operations
          (Nudge / Archive / Reassign). Reassign is admin+; the others
          are coord+. All resolve to a toast in the prototype but the
          underlying selectedIds set is real. */}
      {bulkMode && selectedIds.size > 0 && (
        <div style={{
          flexShrink: 0,
          padding: "10px 14px",
          background: COLORS.fill, color: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
          fontFamily: FONTS.body, fontSize: 12,
        }}>
          <span style={{ fontWeight: 700 }}>
            {selectedIds.size} selected
          </span>
          <span style={{ flex: 1 }} />
          <button type="button"
            onClick={() => { toastBulk(`Nudged ${selectedIds.size} thread${selectedIds.size === 1 ? "" : "s"}`); exitBulk(); }}
            style={{
              padding: "5px 10px", borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#fff",
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            Nudge
          </button>
          <button type="button"
            onClick={() => { toastBulk(`Archived ${selectedIds.size} thread${selectedIds.size === 1 ? "" : "s"}`); exitBulk(); }}
            style={{
              padding: "5px 10px", borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#fff",
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            Archive
          </button>
          <button type="button"
            onClick={() => { toastBulk(`Reassign ${selectedIds.size} thread${selectedIds.size === 1 ? "" : "s"}`); exitBulk(); }}
            style={{
              padding: "5px 12px", borderRadius: 999,
              border: "none",
              background: "#fff", color: COLORS.fill,
              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            Reassign
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Admin thread header (slim — most context is in WorkspaceBody) ──
// ── Admin INQUIRY DETAIL — same shell as talent/client, ops-flavored hero ──
// Hero: status pill + project + brief + funnel
// Operational block: lineup status + offer state + needs-me action card
// Tab bar: Client thread · Talent group · Files · Details (admin sees ALL — no locks)
// Tab content adapts per active tab.
function AdminInquiryDetail({ inquiry, onBack }: { inquiry: RichInquiry; onBack: () => void }) {
  const { toast, state } = useProto();
  const [activeTab, setActiveTab] = useState<ThreadTabId>("client");
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
      primary: { label: "Reply to client", tone: "primary", onClick: () => { setActiveTab("client"); toast("Open client thread"); } },
    };
    if (stageBucket === "hold") return {
      hint: "Hold open — send the revised offer.",
      primary: { label: "Send offer", tone: "primary", onClick: () => { setActiveTab("offer"); toast("Open offer"); } },
    };
    if (stageBucket === "booked") return {
      hint: "Booked. Build the call sheet.",
      primary: { label: "Build call sheet", tone: "success", onClick: () => { setActiveTab("logistics"); toast("Call sheet editor"); } },
    };
    return {};
  })();

  // Split messages by thread
  const clientMessages = inquiry.messages.filter(m => m.threadType === "private");
  const talentMessages = inquiry.messages.filter(m => m.threadType === "group");
  const fileCount = (MOCK_FILES_FOR_CONV[resolveFileKey(inquiry.id)] ?? []).length;

  return (
    <div style={{
      padding: 16, fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
      height: "100%", minHeight: 0,
    }}>
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
        rightSlot={(() => {
          if (!offerLabel) return null;
          return (
            <span title={offerLabel} style={{
              padding: "3px 9px", borderRadius: 999,
              background: COLORS.surfaceAlt, color: COLORS.inkMuted,
              fontSize: 11, fontWeight: 600,
              fontFamily: FONTS.body, fontVariantNumeric: "tabular-nums",
              maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{offerLabel}</span>
          );
        })()}
        // Admin's lineup + coord signals — folded into the header instead
        // of a separate floating strip below, so the workspace detail
        // matches the client/talent header silhouette (single card).
        metaExtras={lineupTotal > 0 || inquiry.coordinator ? (
          <>
            {lineupTotal > 0 && (() => {
              const tone = lineupAccepted === 0 ? "red"
                : lineupAccepted < lineupTotal ? "amber"
                : "green";
              const palette = tone === "red"
                ? { dot: COLORS.coral, fg: COLORS.coralDeep }
                : tone === "amber"
                ? { dot: COLORS.amber, fg: COLORS.amber }
                : { dot: COLORS.success, fg: COLORS.successDeep ?? COLORS.success };
              return (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontWeight: 700, color: palette.fg,
                }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: palette.dot }} />
                  {lineupAccepted}/{lineupTotal} accepted
                </span>
              );
            })()}
            {lineupPending > 0 && (
              <>
                <span aria-hidden style={{ opacity: 0.35 }}>·</span>
                <span style={{ color: COLORS.amber, fontWeight: 600 }}>{lineupPending} pending</span>
              </>
            )}
            {inquiry.coordinator && (
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Avatar size={16} tone="ink" hashSeed={inquiry.coordinator.name} initials={inquiry.coordinator.initials} />
                <span style={{ color: COLORS.ink, fontWeight: 600 }}>{inquiry.coordinator.name}</span>
              </span>
            )}
          </>
        ) : undefined}
      />

      {/* TAB BAR — admin sees all 4 tabs unlocked. Lineup + Offer summaries
          live inside the Offer tab now (single source of truth). The hero
          stays slim: identity + brief + funnel only. */}
      <div style={{
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.md, overflow: "hidden",
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column",
      }}>
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
        {/* Stage-aware smart-reply context — pipeline position drives
            which suggestion set the composer surfaces. */}
        {(() => {
          const adminSmartCtx = stageBucket === "inquiry" ? "inquiry"
            : stageBucket === "hold" ? "hold"
            : stageBucket === "booked" ? "offer"
            : "default";
          return (
            <>
              {activeTab === "client" && (
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
                />
              )}
              {activeTab === "talent" && (
                <AdminMessageStream
                  messages={talentMessages}
                  placeholder="Message talent group…"
                  threadKey={`admin:${inquiry.id}:talent`}
                  smartReplyContext={adminSmartCtx}
                  closed={inquiry.stage === "rejected" || inquiry.stage === "expired"}
                  closedNotice={inquiry.stage === "rejected"
                    ? "Closed · the client passed on this project."
                    : "Closed · auto-expired."}
                />
              )}
            </>
          );
        })()}
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
        {/* Merged Project tab — admin now uses the same `booking` tab id
            as talent + client so all three povs route the polished
            card-grid view through the same key. Older `details` id is
            kept as a fallback for any external callers that still pin
            it (e.g. notification deep-links) until they migrate. */}
        {(activeTab === "booking" || activeTab === "details") && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <AdminBookingTab inquiry={toInquiry(inquiry)} planTier={planTier} />
          </div>
        )}
      </div>
      <ShellNextActionBar {...adminAction} />
    </div>
  );
}

// Stream renderer for admin. Reads from RichInquiry.messages directly
// (different shape from MOCK_THREAD that ConversationTab consumes), but
// matches ConversationTab's design language: per-bubble sender avatar +
// role tag, day separators, mine/theirs alignment, double-check ts,
// closure-aware footer that swaps the composer for a closed-conv notice
// when the inquiry is past / cancelled / rejected / expired.
function AdminMessageStream({
  messages, placeholder, closed, closedNotice, threadKey, smartReplyContext = "default",
  firstTimeClientName,
}: {
  messages: RichInquiry["messages"];
  placeholder: string;
  /** When true, the composer is replaced with a closure pill — same
   *  pattern ConversationTab uses for past/cancelled convs. */
  closed?: boolean;
  closedNotice?: string;
  /** Stable key that identifies which thread a sent message belongs to.
   *  Used for the local-stash so admin's "Just now" sends echo back into
   *  the stream without a backend. */
  threadKey: string;
  /** Stage-flavored smart-reply set ("inquiry" / "hold" / "offer" /
   *  "default"). Maps to SMART_REPLIES_FOR_LAST so admin's chip
   *  suggestions match the conversation's pipeline position rather
   *  than always falling back to the generic default. */
  smartReplyContext?: string;
  /** When set, render the "First time with {client}" banner at the
   *  top of the stream. Caller computes the first-time signal so the
   *  stream stays presentation-only. */
  firstTimeClientName?: string;
}) {
  const { toast, state } = useProto();
  // Subscribe so locally-sent messages re-render the stream.
  useMessageStashSubscription();
  const localMessages = readLocalMessages(threadKey);
  // Phase 4 of System User direction — workspace identity available
  // to the composer when the user is coord+ on a paid tier. The
  // workspace name comes from the Tulala TENANT identity. Free
  // workspaces don't surface the toggle (no abstraction to choose).
  const wsName = TENANT.name;
  const canSendAsWs = meetsRole(state.role, "coordinator") && state.plan !== "free";
  const allMessages: Array<{
    id: string;
    body: string;
    ts: string;
    isYou: boolean;
    senderName: string;
    senderRole: string;
    senderInitials: string;
  }> = [
    ...messages.map(m => ({
      id: m.id, body: m.body, ts: m.ts, isYou: !!m.isYou,
      // RichInquiry messages carry senderRole — when it's the
      // synthetic "workspace" role we coerce the rendered name to
      // the workspace identity so the bubble reads as System User.
      senderName: m.senderRole === "workspace"
        ? (m.senderName || "Workspace")
        : m.senderName,
      senderRole: m.senderRole as string,
      senderInitials: m.senderInitials,
    })),
    // Stashed sends honor the per-message sender so workspace-attributed
    // posts render as System User bubbles (not "you" bubbles). When
    // sender is "workspace", we use the workspace identity for the name
    // + initials so the bubble carries the agency voice.
    ...localMessages.map(m => {
      const isWs = m.sender === "workspace";
      return {
        id: m.id, body: m.body, ts: m.ts,
        // Workspace sends are attributed to the workspace, not "you" —
        // even though THIS user is the one who pushed the button. The
        // bubble visually aligns left (theirs side) so the workspace
        // identity reads as a third-party participant.
        isYou: !isWs,
        senderName: isWs ? wsName : "You",
        senderRole: isWs ? "workspace" : "coordinator",
        senderInitials: isWs ? wsName.slice(0, 2).toUpperCase() : "ME",
      };
    }),
  ];
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      fontFamily: FONTS.body,
    }}>
      {firstTimeClientName && (
        <div style={{ paddingTop: 10 }}>
          <FirstConvBanner clientName={firstTimeClientName} audience="admin" />
        </div>
      )}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "14px 14px 4px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {allMessages.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.inkDim, fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>
            No messages in this thread yet.
          </div>
        ) : allMessages.map((m, idx) => {
          const mine = m.isYou;
          const prevDay = idx > 0 ? dayKey(allMessages[idx - 1]!.ts) : null;
          const thisDay = dayKey(m.ts);
          const showDay = thisDay !== prevDay;
          return (
            <React.Fragment key={m.id}>
              {showDay && <DaySeparator label={thisDay} />}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
                {!mine && (
                  <Avatar
                    size={26}
                    tone={m.senderRole === "coordinator" || m.senderRole === "workspace" ? "ink" : "auto"}
                    hashSeed={m.senderName}
                    initials={m.senderInitials}
                  />
                )}
                <div style={{
                  maxWidth: "78%",
                  background: mine ? COLORS.fill : COLORS.surfaceAlt,
                  color: mine ? "#fff" : COLORS.ink,
                  padding: "9px 12px",
                  borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  fontSize: 13, lineHeight: 1.45,
                }}>
                  {!mine && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted, marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span>{m.senderName} <span style={{ fontWeight: 500 }}>· {m.senderRole}</span></span>
                      {m.senderRole === "workspace" && (
                        <span title="Workspace System User" style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          padding: "0 5px", borderRadius: 999,
                          background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                          fontSize: 8.5, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 0.4,
                        }}>
                          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
                            <path d="M2 1.5h4l1 1.5v3l-1 1.5H2l-1-1.5v-3l1-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                          </svg>
                          System
                        </span>
                      )}
                    </div>
                  )}
                  {m.body}
                  <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.55)" : COLORS.inkDim, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {m.ts}
                    {mine && (
                      <span aria-hidden style={{ display: "inline-flex" }}>
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4.8L3.5 7L7 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M5 4.8L7.5 7L11 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 14px",
        background: "#fff",
        borderTop: `1px solid ${COLORS.borderSoft}`,
      }}>
        {closed ? (
          <div style={{
            padding: "10px 14px",
            borderRadius: 999,
            background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted,
          }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            {closedNotice ?? "Conversation closed."}
          </div>
        ) : (
          <DraftComposer
            threadKey={threadKey}
            placeholder={placeholder}
            smartReplyContext={smartReplyContext}
            onSend={(text) => {
              appendLocalMessage(threadKey, text);
              toast("Message sent");
            }}
            workspaceName={wsName}
            canSendAsWorkspace={canSendAsWs}
            onSendAsWorkspace={(text) => {
              appendLocalMessage(threadKey, text, "workspace");
              toast(`Sent as ${wsName}`);
            }}
          />
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════
// 2) TALENT JOB SHELL — assignment-centric, NOT chat-first
// ════════════════════════════════════════════════════════════════════
//
// Detail view is a JOB CARD, not a chat. The hero is the job's facts:
// status, dates, location, your-take-home. Big actions (Accept, Decline,
// Hold). Schedule + Location + Coordinator + Files as detail blocks.
// Conversation is at the bottom — secondary.

type TalentFilter = "all" | "inquiry" | "hold" | "booked" | "past" | "coordinating";

// Talent's quoted rate per conversation. Single source of truth =
// the offer.rows[mine].costRate × units, computed lazily via a Proxy
// so every consumer (job header, inbox row, calendar tile, earnings
// tile) reads the same number. Pending rows render as "—" because the
// talent hasn't quoted yet. Empty offer = "—".
//
// Was a static map that drifted away from the offer fixtures (e.g.
// c3 shown as €2,200 here while offer.costRate said €4,000). Reading
// from the offer eliminates the divergence.
export const TALENT_RATE_FOR_CONV: Record<string, string> = new Proxy({}, {
  get(_target, convId: string) {
    const baseOffer = MOCK_OFFER_FOR_CONV[convId];
    if (!baseOffer) return "—";
    // Apply any in-session overrides — submitted rate / withdrawals /
    // edits — so every surface (header pill, inbox row, calendar, etc.)
    // reads the same number after the talent acts.
    const offer = applyRowOverrides(convId, baseOffer);
    const myRow = offer.rows.find(r => r.talentId === currentTalentId());
    if (!myRow || !myRow.costRate) return "—";
    const gross = myRow.costRate * myRow.units;
    const currency = offer.clientBudget?.currency ?? "EUR";
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(gross);
  },
}) as Record<string, string>;

// ── Resizable inbox layout — drag-to-resize left rail + collapse to
// a thin status strip. State persists per-shell to localStorage so
// reloads keep the user's chosen width. ──
const INBOX_DEFAULT_WIDTH = 340;
const INBOX_MIN_WIDTH = 240;
const INBOX_MAX_WIDTH = 560;
function useResizableInboxLayout(shellKey: "talent" | "client" | "admin") {
  const widthKey = `tulala_inbox_w_${shellKey}_v1`;
  const collapsedKey = `tulala_inbox_collapsed_${shellKey}_v1`;
  const [leftWidth, setLeftWidthState] = useState<number>(() => {
    if (typeof window === "undefined") return INBOX_DEFAULT_WIDTH;
    const raw = window.localStorage.getItem(widthKey);
    const n = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(n) && n >= INBOX_MIN_WIDTH && n <= INBOX_MAX_WIDTH ? n : INBOX_DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(collapsedKey) === "1";
  });
  const setLeftWidth = (w: number) => {
    const clamped = Math.max(INBOX_MIN_WIDTH, Math.min(INBOX_MAX_WIDTH, Math.round(w)));
    setLeftWidthState(clamped);
    try { window.localStorage.setItem(widthKey, String(clamped)); } catch {}
  };
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try { window.localStorage.setItem(collapsedKey, v ? "1" : "0"); } catch {}
  };
  return { leftWidth, setLeftWidth, collapsed, setCollapsed };
}

// ── ColumnDivider — 6px wide drag rail between the inbox and the
// thread pane. Mouse-down + document-level mousemove/mouseup keeps
// the drag fluid even when the cursor leaves the rail. ──
function ColumnDivider({ onResize, disabled }: { onResize: (w: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const grid = (e.currentTarget.parentElement as HTMLElement | null);
    if (!grid) return;
    const firstCol = grid.children[0] as HTMLElement | undefined;
    const startW = firstCol?.getBoundingClientRect().width ?? INBOX_DEFAULT_WIDTH;
    startRef.current = { x: e.clientX, w: startW };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      onResize(startRef.current.w + dx);
    };
    const up = () => {
      startRef.current = null;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  return (
    <div
      data-tulala-column-divider
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize jobs list"
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        width: "100%", height: "100%",
        background: dragging ? COLORS.accent : "transparent",
        cursor: disabled ? "default" : "col-resize",
        opacity: disabled ? 0 : 1,
        transition: `background ${TRANSITION.micro}`,
        zIndex: 2,
      }}
    >
      {/* Hide on mobile — the existing single-pane mobile CSS forces
          grid-template-columns to 1fr, which would otherwise let this
          divider stack as a full-width 446px row in the layout. The
          drag handle has no meaning on touch anyway; the door-pattern
          tab handles the open/close gesture. */}
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){[data-tulala-column-divider]{display:none!important}}"
      }} />
      {/* The actual visible 1px line in the middle of the 6px rail. */}
      <span aria-hidden style={{
        position: "absolute", top: 0, bottom: 0, left: "50%",
        width: 1, transform: "translateX(-50%)",
        background: dragging ? COLORS.accent : (hover ? COLORS.border : COLORS.borderSoft),
        transition: `background ${TRANSITION.micro}`,
      }} />
      {/* Hover/drag grip — small dimples in the middle so the user
          knows it's a drag handle. */}
      {(hover || dragging) && !disabled && (
        <span aria-hidden style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 4, height: 36, borderRadius: 2,
          background: dragging ? COLORS.accent : COLORS.border,
        }} />
      )}
    </div>
  );
}

// ── MobileInboxTab — thin fixed-position handle on the left edge of
// the viewport that shows when the user is reading a thread on mobile.
// Tap → opens the inbox (door open). Selecting a job auto-closes (door
// close — driven by the existing setMobilePane("thread") on row click). ──
function MobileInboxTab({ unreadCount, onOpen }: { unreadCount: number; onOpen: () => void }) {
  const hasUnread = unreadCount > 0;
  return (
    <button
      type="button"
      data-tulala-mobile-inbox-tab
      onClick={onOpen}
      aria-label={hasUnread ? `Open jobs list · ${unreadCount} unread` : "Open jobs list"}
      title={hasUnread ? `${unreadCount} unread · open jobs` : "Open jobs"}
      style={{
        // CSS in page.tsx unhides this on mobile-thread mode only.
        display: "none",
        position: "fixed",
        left: 0, top: "50%", transform: "translateY(-50%)",
        zIndex: 50,
        // Tall thin pull-tab — SOLID slate handle, like a physical
        // drawer pull. Same color family as the primary CTA so it
        // reads as 'this is the actionable button on this surface'.
        width: 16, height: 104,
        padding: 0,
        background: COLORS.fill, // #4D4855 — same as primary CTAs
        border: "none",
        borderRadius: "0 9px 9px 0",
        // Outer shadow puts it in front of the surface; inner highlight
        // on the visible (right) edge gives a 3D handle feel.
        boxShadow: [
          "3px 5px 16px -4px rgba(11,11,13,0.30)",
          "inset -1px 0 0 rgba(255,255,255,0.12)",
          "inset 0 1px 0 rgba(255,255,255,0.08)",
        ].join(", "),
        color: "#fff",
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
    >
      <span aria-hidden style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "100%", height: "100%",
      }}>
        <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
          <path
            d="M1.75 1.75L6.5 7.5l-4.75 5.75"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {hasUnread && (
          <span aria-hidden style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            width: 6, height: 6, borderRadius: "50%",
            background: COLORS.accent,
            boxShadow: `0 0 0 1.5px ${COLORS.fill}`,
          }} />
        )}
      </span>
    </button>
  );
}

// ── CollapsedInboxRail — 32px-wide vertical strip when the inbox is
// collapsed. Shows the expand chevron + total/unread counts so the
// user always knows the rail's there. ──
function CollapsedInboxRail({
  count, unreadCount, onExpand,
}: { count: number; unreadCount: number; onExpand: () => void }) {
  return (
    <aside data-tulala-list-pane data-tulala-collapsed style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 8, padding: "10px 0",
      borderRight: `1px solid ${COLORS.borderSoft}`,
      background: "#fff",
    }}>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand jobs list"
        title="Expand jobs list"
        style={{
          width: 24, height: 24, borderRadius: 7,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div style={{
        writingMode: "vertical-rl", transform: "rotate(180deg)",
        fontFamily: FONTS.body, fontSize: 10, color: COLORS.inkMuted,
        letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
        marginTop: 6,
      }}>
        {count} jobs
      </div>
      {unreadCount > 0 && (
        <span style={{
          marginTop: 2,
          minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
          background: COLORS.accent, color: "#fff",
          fontSize: 9.5, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONTS.body,
        }}>{unreadCount}</span>
      )}
    </aside>
  );
}

function TalentJobShell() {
  const conversations = MOCK_CONVERSATIONS;
  // Subscribe to seen-state changes so the inbox re-sorts the moment
  // a row gets clicked (the NEW pill drops, the unseen sort tier loses
  // that conv, and it falls back to its recency rank).
  useSeenSubscription();
  // Pin-aware initial state — when a caller (talent Today row, booking
  // row, etc.) pinned a conversation, land in the thread pane directly.
  const { initialId, fromPin } = (() => {
    const pending = consumePendingConversation();
    if (pending && conversations.some(c => c.id === pending)) {
      return { initialId: pending, fromPin: true };
    }
    return { initialId: conversations[0]?.id ?? "", fromPin: false };
  })();
  const [activeId, setActiveId] = useState<string>(initialId);
  // Mark whatever conv we land on as seen — covers both pin-driven
  // entries and the default first-conv selection so the user never
  // sees a stale NEW pill on the conv they're currently viewing.
  useEffect(() => {
    if (initialId) markConvSeen(initialId);
    // run once on mount with the initial id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TalentFilter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(fromPin ? "thread" : "list");
  const layout = useResizableInboxLayout("talent");

  const filtered = conversations.filter(c => {
    // "coordinating" filter — jobs where Marta runs her own workspace
    // (talent_coord pov). Distinct from stage filters because it
    // crosses stages: an inquiry she's coord'ing AND a booked one
    // both qualify.
    if (filter === "coordinating") {
      if (!c.iAmCoordinator) return false;
    } else if (filter !== "all" && c.stage !== filter) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      // Wider haystack than just client+brief so "Sara", "Madrid",
      // "Hub", or an agency name actually finds the right job.
      const haystack = [
        c.client, c.brief, c.agency,
        c.leader?.name, c.location, c.date,
        c.source?.kind === "tulala-hub" ? c.source.label : "",
        c.source?.kind === "direct" ? c.source.label : "",
        c.lastMessage.preview,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Two-tier chronological sort so the inbox reads top-down as
    // "what's brand-new, then what's most recent, then what's older."
    //   Tier 1: unseen (never opened) inquiries — most urgent attention
    //   Tier 2: everything else — sorted by recency (freshest first)
    // Within each tier, lower ageHrs = more recent → top. Locally-seen
    // convs lose their tier-1 status (after the user opens them) so
    // they re-rank into the recency sort like any other row.
    const aNew = (a.seen === false && !isLocallySeen(a.id)) ? 1 : 0;
    const bNew = (b.seen === false && !isLocallySeen(b.id)) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    return a.lastMessage.ageHrs - b.lastMessage.ageHrs;
  });

  const active = conversations.find(c => c.id === activeId) ?? filtered[0] ?? conversations[0];

  return (
    <>
      {/* Page header removed — inbox header inside the shell already
          says "My jobs · count", so this row was a duplicate. */}
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          // CRITICAL: grid-template-columns is driven from a CSS
          // variable rather than inline directly. The mobile @media
          // override needs unambiguous precedence over the desktop
          // 3-track layout — putting `--tulala-shell-cols` on the
          // inline style and resolving via the stylesheet means the
          // mobile rule (`grid-template-columns: 1fr !important`)
          // wins cleanly with no inline-vs-stylesheet ambiguity.
          ["--tulala-shell-cols" as never]: `${layout.collapsed ? 32 : layout.leftWidth}px 6px 1fr`,
          gridTemplateColumns: "var(--tulala-shell-cols)",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
          height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 200px), 820px)",
          minHeight: 560,
          // Hard floor so a long unbreakable child can't push the
          // shell wider than its assigned grid track. Was the root
          // cause of the right-side bleed: a chip strip's min-content
          // expanded the shell's intrinsic width.
          minWidth: 0,
          maxWidth: "100%",
          fontFamily: FONTS.body,
        }}
      >
        {/* Mobile: pin the shell to fill the viewport area between
            the top chrome (cbar + identity bar + page header ≈ 156px)
            and the bottom nav (~80px). Position:fixed bypasses the
            inline height calc that was leaving the composer below the
            bottom nav. Uses dynamic viewport units so iOS Safari URL
            bar collapse doesn't break the layout. The grid template
            also forces 1fr (single column) here for redundant safety
            in case the page-wide rule misses. */}
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){"
          + "[data-tulala-messages-shell]{"
          + "position:fixed!important;"
          + "left:0!important;right:0!important;"
          + "width:100vw!important;max-width:100vw!important;"
          + "grid-template-columns:1fr!important;"
          // Page header was removed entirely, so the shell only needs
          // to clear the cbar + identity bar (50 + 56 = 106px) at the
          // top, and the bottom nav (80px) at the bottom.
          + "top:calc(var(--proto-cbar, 50px) + 56px)!important;"
          + "bottom:80px!important;"
          + "height:calc(100dvh - var(--proto-cbar, 50px) - 56px - 80px)!important;"
          + "min-height:0!important;max-height:none!important;"
          + "border-radius:0!important;border-left:0!important;border-right:0!important;"
          + "z-index:10!important;"
          + "}"
          // Children of the shell — list/thread panes — must be able
          // to shrink to 0. Without min-width:0 their min-content
          // width pushes the shell beyond viewport.
          + "[data-tulala-messages-shell] > *{min-width:0!important;max-width:100%!important}"
          + "}"
        }} />
        {layout.collapsed ? (
          <CollapsedInboxRail
            count={conversations.length}
            unreadCount={conversations.reduce((s, c) => s + c.unreadCount, 0)}
            onExpand={() => layout.setCollapsed(false)}
          />
        ) : (
          <TalentJobInbox
            conversations={filtered}
            activeId={active?.id ?? ""}
            onSelect={(id) => { setActiveId(id); setMobilePane("thread"); markConvSeen(id); }}
            search={search} onSearchChange={setSearch}
            filter={filter} onFilterChange={setFilter}
            onCollapse={() => layout.setCollapsed(true)}
          />
        )}
        <ColumnDivider onResize={layout.setLeftWidth} disabled={layout.collapsed} />
        <div data-tulala-thread-pane style={{ display: "flex", flexDirection: "column", minHeight: 0, background: COLORS.surfaceAlt, overflow: "hidden" }}>
          {active ? <TalentJobDetail conv={active} onBack={() => setMobilePane("list")} /> : <EmptyDetail label="No job selected" />}
        </div>
      </div>
      {/* Mobile-only: thin tab on left edge that pops open the inbox
          while a thread is open. Hidden on desktop via CSS. */}
      {mobilePane === "thread" && (
        <MobileInboxTab
          unreadCount={conversations.reduce((s, c) => s + c.unreadCount, 0)}
          onOpen={() => setMobilePane("list")}
        />
      )}
    </>
  );
}

// ── Talent: job-flavored row ──
// Shows: client + status + dates/location + your-take-home line + your status
function TalentJobRow({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  const sc = stageStyle(conv.stage);
  const yourRate = TALENT_RATE_FOR_CONV[conv.id] ?? "—";
  const myStatus: "accepted" | "pending" | "—" =
    conv.stage === "booked" ? "accepted"
    : conv.stage === "inquiry" || conv.stage === "hold" ? "pending"
    : "—";

  // Compose the last-message preview. Sender prefix gives instant
  // context ("Sara: ..." vs "You: ..." vs system-only).
  const senderPrefix = (() => {
    switch (conv.lastMessage.sender) {
      case "you": return "You: ";
      case "coordinator": return `${conv.leader?.name?.split(" ")[0] ?? "Coordinator"}: `;
      case "client": return `${conv.client.split(" ")[0]}: `;
      case "agency": return `${conv.agency?.split(" ")[0] ?? "Agency"}: `;
      case "system": return "";
      default: return "";
    }
  })();

  // Pull the human-readable date label. "Sat, May 17" reads better than
  // a raw "May 17" — but we leave the conv.date string alone (single
  // source). When data ships with a weekday it'll just render through.
  const dateLabel = conv.date;

  // Parse the location into city. We drop the venue from the row — it
  // belongs in the Details rail. City + date is enough to scan by.
  const cityLabel = conv.location ? conv.location.split(" · ")[0] : null;

  // Build a single subtitle: "Brief · Sat, May 14 · Madrid" — but only
  // include city if the brief doesn't already mention it. De-dupes the
  // common mock pattern "Spring lookbook · Madrid" + "📍 Madrid".
  const briefMentionsCity = cityLabel && conv.brief.toLowerCase().includes(cityLabel.toLowerCase());
  const subtitleParts = [
    conv.brief,
    dateLabel ? withWeekday(dateLabel) : null,
    !briefMentionsCity ? cityLabel : null,
  ].filter(Boolean);

  // Active-stage word — appears inline next to funnel dots. Drops the
  // separate uppercase stage label that was duplicating it on row 4.
  // Cancelled rows surface the outcome reason in place of the generic
  // "Cancelled" — talent reads "Client cancelled" / "Rejected" /
  // "Expired" inline without opening the conv to find out why.
  const stageWord = conv.stage === "past" ? "Wrapped"
    : conv.stage === "hold" ? "Offer"
    : conv.stage === "cancelled" && conv.outcome === "client_cancelled" ? "Client cancelled"
    : conv.stage === "cancelled" && conv.outcome === "client_rejected" ? "Rejected"
    : conv.stage === "cancelled" && conv.outcome === "client_no_response" ? "Expired"
    : conv.stage === "cancelled" && conv.outcome === "talent_declined" ? "You declined"
    : conv.stage.charAt(0).toUpperCase() + conv.stage.slice(1);
  const ageLbl = ageLabel(conv.lastMessage.ageHrs);
  const slaTone = freshnessTone(conv.lastMessage.ageHrs, myStatus === "pending");
  // "Awaiting you" only when the talent actually owes a response. The
  // "✓ confirmed" pill on booked rows was duplicate signal — the funnel
  // step already says Booked and the take-home rate already says Paid /
  // confirmed. Drop it.
  const showAwaiting = myStatus === "pending";

  // Stage-tinted row backgrounds — subtle wash that helps the eye sort
  // the inbox at a glance. Brand-new (unseen) inquiries get a coral
  // tint to read as "needs attention now"; booked rows get a soft
  // green to read as "locked in"; everything else stays transparent.
  // The active row (currently selected) wins over the stage tint with
  // a darker neutral wash + accent border-left.
  // `seen: false` flips to true once the user opens the conv in this
  // session (markConvSeen). Module-level seen-set means the NEW pill
  // disappears the moment they click in.
  // Manual-unread overrides the locally-seen state — see AdminInquiryRow.
  const isUnseen = isManualUnread(conv.id) || (conv.seen === false && !isLocallySeen(conv.id));
  const stageBg: string =
    active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,48,58,0.05)"     // coral-soft = brand-new inquiry
    : conv.stage === "booked" ? "rgba(46,125,91,0.045)" // success-soft = locked
    : "transparent";

  const rowRef = useScrollIntoViewWhenActive(active);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      data-tulala-inbox-row
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        width: "100%", padding: "12px 14px",
        background: stageBg,
        borderLeft: active ? `3px solid ${COLORS.accent}`
          : isUnseen ? `3px solid ${COLORS.coral}`
          : "3px solid transparent",
        // Longhand to silence React's shorthand-vs-longhand warning
        // when borderLeft flips between active / unseen / default.
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
        // Slight emphasis when unseen — bumps weight to the row level,
        // not just text — so the eye registers "new" before reading.
        position: "relative",
      }}
    >
      <InboxRowHoverActions rowId={conv.id} label={conv.client} />
      {/* Client avatar — initial in deterministic auto-tint per client
          name. Most clients are brands (Mango, Bvlgari, Vogue), so
          a colored initial reads cleaner than a generic logo would.
          marginTop:2 baselines the avatar with the first text row. */}
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <Avatar
          initials={initialsOf(conv.client)}
          hashSeed={conv.client}
          tone="auto"
          size={36}
        />
      </span>

      {/* Right column — three rows of text + a slim funnel strip. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — client name (single line, truncated) + NEW pill (when
            never opened) + take-home rate (when set). */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            title={conv.client}
            style={{
              fontSize: 14, fontWeight: 700, color: COLORS.ink,
              flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.25, letterSpacing: -0.1,
            }}
          >
            {conv.client}
          </span>
          {/* NEW pill — only on brand-new (unseen) inquiries. Pulls
              the eye before the stage funnel + status pill in row 4
              so the talent can spot fresh work even before reading. */}
          {isUnseen && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              padding: "2px 6px", borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              textTransform: "uppercase",
              boxShadow: `0 0 0 2px ${COLORS.coral}1f`,
            }}>NEW</span>
          )}
          {yourRate && yourRate !== "—" && (
            <span style={{
              flexShrink: 0,
              fontSize: 12.5, fontWeight: 700, color: COLORS.ink,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -0.1,
            }}>{yourRate}</span>
          )}
        </div>

        {/* Row 2 — brief · date · city · source. Single ellipsized line.
            Source chip appears inline (small dot + label) so the
            talent reads where the inquiry came from without opening
            the conv. */}
        {subtitleParts.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4,
            minWidth: 0,
          }}>
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1,
            }}>
              {subtitleParts.join(" · ")}
            </span>
            {(() => {
              const sm = conv.source ? sourceChipMeta(conv.source) : null;
              if (!sm) return null;
              return (
                <span title={sm.tooltip} style={{
                  flexShrink: 0,
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "1px 6px", borderRadius: 999,
                  background: sm.bg, color: sm.fg,
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}>
                  <span aria-hidden style={{ display: "inline-flex" }}>{sm.icon}</span>
                  {sm.label}
                </span>
              );
            })()}
          </div>
        )}

        {/* Row 3 — last-message preview · age (right) · unread badge. */}
        {conv.lastMessage.preview && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 1,
          }}>
            <span style={{
              flex: 1, minWidth: 0,
              fontSize: 11.5, color: conv.unreadCount > 0 ? COLORS.ink : COLORS.inkMuted,
              fontWeight: conv.unreadCount > 0 ? 500 : 400,
              lineHeight: 1.4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {senderPrefix && (
                <span style={{ color: COLORS.inkMuted, fontWeight: 600 }}>{senderPrefix}</span>
              )}
              {conv.lastMessage.preview}
            </span>
            <span style={{ flexShrink: 0, fontSize: 10.5, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>
              {ageLbl}
            </span>
            {conv.unreadCount > 0 && (
              <span style={{
                flexShrink: 0,
                minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, boxSizing: "border-box",
                background: COLORS.accent, color: "#fff",
                fontSize: 9.5, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>{conv.unreadCount}</span>
            )}
          </div>
        )}

        {/* Row 4 — funnel dots + active-stage word + (optional) "awaiting
            you" badge. Dropped the duplicate uppercase stage label and
            the "✓ confirmed" success pill — both said the same thing
            the funnel step already says. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ flex: "0 0 auto", maxWidth: 130 }}>
            <JobStageFunnel currentStage={conv.stage} compact={true} />
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: sc.fg, letterSpacing: 0.3, textTransform: "uppercase",
            flexShrink: 0,
          }}>
            {stageWord}
          </span>
          <span style={{ flex: 1 }} />
          {slaTone && (
            <span aria-label={`SLA: ${slaTone.label}`} style={{
              width: 6, height: 6, borderRadius: "50%",
              background: slaTone.color, flexShrink: 0,
            }} />
          )}
          {showAwaiting && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
              background: `${COLORS.amber}18`,
              color: COLORS.amber,
              flexShrink: 0,
            }}>
              awaiting you
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Add a weekday prefix to a date label when missing. "May 14" →
// "Sat, May 14". Best-effort — falls through if we can't parse.
function withWeekday(label: string): string {
  // Already has weekday like "Sat, May 14" or "Sun, Jun 8" — leave it.
  if (/^[A-Z][a-z]{2,5}, /.test(label)) return label;
  // Range like "May 14–15" — leave it; weekday for first day adds
  // ambiguity for multi-day shoots.
  if (/[–-]/.test(label)) return label;
  const parsed = Date.parse(`${label} ${new Date().getFullYear()}`);
  if (isNaN(parsed)) return label;
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(parsed).getDay()];
  return `${day}, ${label}`;
}

function TalentJobInbox({
  conversations, activeId, onSelect, search, onSearchChange, filter, onFilterChange, onCollapse,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string; onSearchChange: (s: string) => void;
  filter: TalentFilter; onFilterChange: (f: TalentFilter) => void;
  /** Optional handler — when present, renders a small collapse-to-rail
   *  button in the inbox header. Hosting shell controls the width. */
  onCollapse?: () => void;
}) {
  // Subscribe to pin/manual-unread flags so the inbox re-orders +
  // re-tints when those toggle from a row's hover actions.
  useFlagsSubscription();
  // "Coordinating" only appears in the strip when there's at least one
  // job where Marta runs her own workspace. Hides for talents with no
  // coord work — keeps the strip lean for the common case.
  const coordCount = conversations.filter(c => c.iAmCoordinator).length;
  const chips: { id: TalentFilter; label: string; count?: number; pin?: boolean }[] = [
    { id: "all", label: "All jobs" },
    { id: "inquiry", label: "Inquiry" },
    { id: "hold", label: "Hold" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
    ...(coordCount > 0 ? [{ id: "coordinating" as const, label: "Coordinating", count: coordCount, pin: true }] : []),
  ];
  return (
    <aside data-tulala-list-pane style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${COLORS.borderSoft}`, background: "#fff",
      minHeight: 0,
      // Hard responsive floor for the list pane — without min-width:0
      // a long unbreakable child (filter chip label, message preview)
      // pushes the pane wider than its grid track. max-width:100% keeps
      // it inside the shell at every viewport.
      minWidth: 0, maxWidth: "100%",
    }}>
      <HoverActionsCss />
      <div data-tulala-inbox-header style={{
        padding: "14px 14px 8px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        minWidth: 0, maxWidth: "100%",
      }}>
        <div data-tulala-list-header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>My jobs</h3>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{conversations.length}</span>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse jobs list"
                title="Collapse to rail"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                  color: COLORS.inkMuted, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M8 2l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-list-header] { display: none !important; }
            /* Inbox subgroups — every nested wrapper gets min-width:0
               + max-width:100% so the chip strip + search + row list
               can never push their parent beyond viewport. The chip
               strip stays scrollable horizontally inside its own box. */
            [data-tulala-inbox-header],
            [data-tulala-inbox-search],
            [data-tulala-inbox-chips],
            [data-tulala-inbox-scroll] {
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            [data-tulala-inbox-chips] {
              overflow-x: auto !important;
              scrollbar-width: none !important;
            }
            [data-tulala-inbox-chips]::-webkit-scrollbar { display: none !important; }
          }
        `}</style>
        <div data-tulala-inbox-search style={{ marginBottom: 10 }}>
          <SearchPill value={search} onChange={onSearchChange} placeholder="Search jobs…" />
        </div>
        <div data-tulala-inbox-chips style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {chips.map(c => <FilterChip
            key={c.id}
            id={c.id}
            label={c.label}
            active={filter === c.id}
            count={c.count}
            icon={c.pin ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            ) : undefined}
            onClick={() => onFilterChange(c.id)}
          />)}
        </div>
      </div>
      <div data-tulala-inbox-scroll style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        // min-width:0 so the row buttons (which use flex with truncating
        // text) actually shrink to their parent — without it the rows'
        // text-overflow:ellipsis never kicks in on the message preview
        // and they push the inbox wider than viewport.
        minWidth: 0, maxWidth: "100%",
      }}>
        {conversations.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt, color: COLORS.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              {search.trim() ? <>No matches for &ldquo;{search}&rdquo;</> : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4, maxWidth: 240 }}>
              {search.trim() ? "Try a different keyword, or clear the search." : <>Try the <strong>All jobs</strong> filter or clear your search to see everything.</>}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => onSearchChange("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>Clear search</button>
            )}
          </div>
        ) : renderWithDateGroups(
            sortPinnedFirst(conversations),
            c => c.lastMessage.ageHrs,
            c => (
              <TalentJobRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ),
          )}
      </div>
    </aside>
  );
}

// ── Talent JOB SHELL HEADER — unified single-band header ──
// Replaces the prior 4-band stack (PageTopThread + StageProgress +
// ParticipantTrustStrip + TakeHomeCard). Premium principle: one focal
// point per zone. Top row: back + title + take-home + status. Bottom
// row: slim 4-step funnel (Inquiry → Offer → Booked → Wrapped). Trust
// badges relocate to the Details rail.
function TalentJobShellHeader({
  conv, yourRate, onBack,
}: {
  conv: Conversation;
  yourRate: string;
  onBack: () => void;
}) {
  const sc = stageStyle(conv.stage);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const hasRate = yourRate && yourRate !== "—";
  const stageLabel = conv.stage === "past" ? "Wrapped"
    : conv.stage === "hold" ? "Offer"
    : conv.stage.charAt(0).toUpperCase() + conv.stage.slice(1);

  // Take-home breakdown (mirror of the old TakeHomeCard math)
  const numeric = parseFloat(yourRate.replace(/[^0-9.]/g, ""));
  const isReal = !isNaN(numeric) && numeric > 0;
  const currency = yourRate.match(/[€£$]/)?.[0] ?? "€";
  const gross = isReal ? numeric / 0.80 : 0;
  const agencyFee = isReal ? gross * 0.15 : 0;
  const platformFee = isReal ? gross * 0.05 : 0;
  const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

  const metaLine = [
    `via ${conv.agency}`,
    conv.location ? conv.location.split(" · ")[0] : null,
    conv.date,
  ].filter(Boolean).join(" · ");

  // Build the source-channel descriptor (where the inquiry came from).
  // Surfaces as a small chip next to the meta line so the talent always
  // knows who reached them and through which channel.
  const sourceMeta = conv.source ? sourceChipMeta(conv.source) : null;

  return (
    <header data-tulala-job-shell-header style={{
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md,
      padding: "12px 14px",
      fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* On narrow viewports the take-home chip + status pill push the
          title into a 60-char ellipsis. Drop them into a second row so
          the title gets its full width. Funnel still goes below. */}
      <style dangerouslySetInnerHTML={{ __html:
        // Mobile (≤720px) — heavy compaction. Drop the chunky back
        // button card (the inbox-tab handle on the left edge replaces
        // it), hide the redundant status pill (funnel below carries
        // stage), shrink the meta line to a single ellipsized strip,
        // and drop funnel labels to tiny — leaving only the dots and
        // the active-stage label inline next to them.
        "@media (max-width: 720px){"
        + "[data-tulala-job-shell-header]{padding:10px 12px!important;gap:6px!important}"
        + "[data-tulala-job-shell-header] h1{font-size:15px!important}"
        + "[data-tulala-job-shell-header] [data-tulala-back-btn]{display:none!important}"
        + "[data-tulala-job-shell-header] [data-tulala-status-pill]{display:none!important}"
        + "[data-tulala-job-shell-header] [data-tulala-source-chip-text]{display:none}"
        + "[data-tulala-job-shell-header] [data-tulala-coord-pill-text]{display:none}"
        + "[data-tulala-job-shell-header] [data-tulala-funnel] .tulala-funnel-label{display:none!important}"
        + "[data-tulala-job-shell-header] [data-tulala-funnel]{gap:3px!important}"
        + "}"
        + "@media (max-width: 520px){"
        // Keep title + take-home on row 1, meta below the title.
        // (We used to wrap actions to a 3rd row, which made the
        // header taller; with status pill hidden the take-home chip
        // fits inline now.)
        + "[data-tulala-job-shell-header] h1{font-size:14px!important;line-height:1.2!important}"
        + "[data-tulala-job-shell-header] [data-tulala-header-actions]{flex-shrink:0!important}"
        + "}"
      }} />
      {/* Row 1: back + title + meta + take-home + status */}
      <div data-tulala-header-row1 style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <button
          type="button"
          data-tulala-back-btn
          onClick={onBack}
          aria-label="Back to my jobs"
          style={{
            flexShrink: 0, marginTop: 2,
            width: 26, height: 26, borderRadius: 7,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
            color: COLORS.inkMuted, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div data-tulala-header-meta style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            fontFamily: FONTS.display, fontSize: 17, fontWeight: 700,
            color: COLORS.ink, letterSpacing: -0.25, lineHeight: 1.25,
            display: "flex", alignItems: "center", gap: 8,
            whiteSpace: "nowrap", overflow: "hidden",
          }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {conv.client} <span style={{ fontWeight: 500, color: COLORS.inkMuted }}>· {conv.brief}</span>
            </span>
            {conv.clientTrust && conv.clientTrust !== "basic" && (
              <span style={{ flexShrink: 0 }}>
                <ClientTrustChip level={conv.clientTrust} compact />
              </span>
            )}
          </h1>
          <div style={{
            fontSize: 11.5, color: COLORS.inkMuted, marginTop: 3,
            display: "flex", alignItems: "center", gap: 8,
            whiteSpace: "nowrap", overflow: "hidden",
          }}>
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
            }}>{metaLine}</span>
            {sourceMeta && (
              <span aria-label={`Source: ${sourceMeta.label}`} title={sourceMeta.tooltip} style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 10.5, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                <span data-tulala-source-chip-text>{sourceMeta.label}</span>
              </span>
            )}
            {conv.iAmCoordinator && (
              <span title="You're the coordinator on this job" style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                fontSize: 10.5, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                <span data-tulala-coord-pill-text>You're coord</span>
              </span>
            )}
          </div>
        </div>
        {/* Take-home + status — wrapped in a flex group so mobile media
            query can drop them onto a second row in unison. */}
        <div data-tulala-header-actions style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Cancelled / no-rate jobs: show an outcome chip in the
            take-home slot so the header isn't naked and the user
            instantly reads the closure reason. */}
        {!hasRate && conv.stage === "cancelled" && conv.outcome && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 999,
            background: "rgba(11,11,13,0.05)",
            color: COLORS.inkMuted,
            fontSize: 11, fontWeight: 600, fontFamily: FONTS.body,
          }}>
            <span aria-hidden style={{ fontSize: 11 }}>
              {conv.outcome === "client_cancelled" ? "🚫"
                : conv.outcome === "client_rejected" ? "✕"
                : conv.outcome === "client_no_response" ? "⌛"
                : "—"}
            </span>
            {conv.outcome === "client_cancelled" ? "Client cancelled"
              : conv.outcome === "client_rejected" ? "Offer rejected"
              : conv.outcome === "client_no_response" ? "Expired · no reply"
              : conv.outcome === "talent_declined" ? "You declined"
              : "Closed"}
          </span>
        )}
        {hasRate && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setBreakdownOpen(v => !v)}
              aria-expanded={breakdownOpen}
              aria-label={`Your take-home: ${yourRate}. Click for breakdown.`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 999,
                background: COLORS.successSoft, border: `1px solid ${COLORS.success}30`,
                color: COLORS.successDeep ?? COLORS.success, cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: FONTS.body,
                fontVariantNumeric: "tabular-nums",
                transition: `background ${TRANSITION.micro}`,
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.7, letterSpacing: 0.3, textTransform: "uppercase" }}>
                {conv.stage === "past" ? "Paid" : "Your pay"}
              </span>
              <span>{yourRate}</span>
              {isReal && (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ transform: breakdownOpen ? "rotate(180deg)" : "rotate(0)", transition: TRANSITION.sm, opacity: 0.7 }}>
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            {breakdownOpen && isReal && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                width: 240, padding: 12,
                background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10, boxShadow: "0 12px 30px -8px rgba(11,11,13,0.12)",
                zIndex: 10,
              }}>
                <BreakdownRow label="Gross rate"      value={fmt(gross)} muted />
                <BreakdownRow label="Agency commission (15%)" value={`–${fmt(agencyFee)}`} muted />
                <BreakdownRow label="Platform fee (5%)"  value={`–${fmt(platformFee)}`} muted />
                <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 0" }} />
                <BreakdownRow label="Your take-home" value={yourRate} bold />
                <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 8 }}>
                  {conv.stage === "past" ? "Paid · receipt available" : "Paid 14 days post-shoot"}
                </div>
              </div>
            )}
          </div>
        )}
        <span data-tulala-status-pill style={{
          flexShrink: 0,
          fontSize: 10.5, fontWeight: 700,
          padding: "3px 9px", borderRadius: 999,
          background: sc.bg, color: sc.fg,
          textTransform: "uppercase", letterSpacing: 0.4,
          marginTop: 1,
        }}>{stageLabel}</span>
        </div>
      </div>
      {/* Row 2: slim funnel — labels visible on desktop, hidden on
          mobile via media query (the inline active-stage label below
          carries the meaning). */}
      <div data-tulala-funnel style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <JobStageFunnel currentStage={conv.stage} compact={false} />
        {/* Mobile-only: inline active-stage label after the dots. CSS
            hides the funnel's own labels on mobile, so this picks up
            the meaning. Hidden on desktop. */}
        <span data-tulala-active-stage style={{
          display: "none",
          fontSize: 10.5, fontWeight: 700,
          color: sc.fg, textTransform: "uppercase", letterSpacing: 0.4,
        }}>{stageLabel}</span>
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){[data-tulala-active-stage]{display:inline!important}}"
        }} />
      </div>
    </header>
  );
}

// ── ShellHeader — generic version of the unified header used by the
// client + admin shells. Same compact band: back arrow + title + meta
// (with trust + source + coord chips) + status pill + slim funnel.
// Pluggable `rightSlot` lets each shell drop in its own primary chip
// (talent: take-home; client: next-action CTA; admin: SLA chip). ──
type ShellHeaderInput = {
  client: string;
  brief: string;
  stage: string;
  agency: string;
  location?: string;
  date?: string;
  clientTrust?: import("./_state").ClientTrustLevel;
  source?: Conversation["source"];
  iAmCoordinator?: boolean;
};

function ShellHeader({
  conv, onBack, backLabel, rightSlot, primaryChip, showCoordPill = true, metaExtras,
}: {
  conv: ShellHeaderInput;
  onBack: () => void;
  backLabel: string;
  /** Optional element rendered at the right of row 1 — typically a
   *  CTA chip (next action) or a money chip (take-home / total). */
  rightSlot?: React.ReactNode;
  /** When provided, replaces the default uppercase status pill with
   *  arbitrary content (e.g. an admin SLA chip). Pass `null` to hide. */
  primaryChip?: React.ReactNode;
  /** Whether to render the "You're coord" pill. Hidden on admin. */
  showCoordPill?: boolean;
  /** Optional row rendered below the funnel — used by admin to surface
   *  lineup count + coord owner inside the same header card so the
   *  detail view doesn't grow a second floating chip strip below. */
  metaExtras?: React.ReactNode;
}) {
  const sc = stageStyle(conv.stage);
  const stageLabel = conv.stage === "past" ? "Wrapped"
    : conv.stage === "hold" ? "Offer"
    : conv.stage.charAt(0).toUpperCase() + conv.stage.slice(1);
  const metaLine = [
    `via ${conv.agency}`,
    conv.location ? conv.location.split(" · ")[0] : null,
    conv.date,
  ].filter(Boolean).join(" · ");
  const sourceMeta = conv.source ? sourceChipMeta(conv.source) : null;
  return (
    <header data-tulala-job-shell-header style={{
      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md, padding: "12px 14px",
      fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 520px){"
        + "[data-tulala-job-shell-header] [data-tulala-header-row1]{flex-wrap:wrap}"
        + "[data-tulala-job-shell-header] [data-tulala-header-meta]{flex:1 1 100%}"
        + "[data-tulala-job-shell-header] [data-tulala-header-actions]{order:3;flex:1 1 100%;justify-content:flex-start;gap:8px;margin-left:36px}"
        + "}"
      }} />
      <div data-tulala-header-row1 style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <button type="button" onClick={onBack} aria-label={`Back to ${backLabel}`} style={{
          flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: 7,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div data-tulala-header-meta style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontFamily: FONTS.display, fontSize: 17, fontWeight: 700,
            color: COLORS.ink, letterSpacing: -0.25, lineHeight: 1.25,
            display: "flex", alignItems: "center", gap: 8,
            whiteSpace: "nowrap", overflow: "hidden",
          }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {conv.client} <span style={{ fontWeight: 500, color: COLORS.inkMuted }}>· {conv.brief}</span>
            </span>
            {conv.clientTrust && conv.clientTrust !== "basic" && (
              <span style={{ flexShrink: 0 }}>
                <ClientTrustChip level={conv.clientTrust} compact />
              </span>
            )}
          </h1>
          <div style={{
            fontSize: 11.5, color: COLORS.inkMuted, marginTop: 3,
            display: "flex", alignItems: "center", gap: 8,
            whiteSpace: "nowrap", overflow: "hidden",
          }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{metaLine}</span>
            {sourceMeta && (
              <span aria-label={`Source: ${sourceMeta.label}`} title={sourceMeta.tooltip} style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 10.5, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
            )}
            {showCoordPill && conv.iAmCoordinator && (
              <span title="You're the coordinator on this job" style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                fontSize: 10.5, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                You're coord
              </span>
            )}
          </div>
        </div>
        <div data-tulala-header-actions style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {rightSlot}
          {primaryChip !== null && (
            primaryChip ?? (
              <span style={{
                flexShrink: 0,
                fontSize: 10.5, fontWeight: 700,
                padding: "3px 9px", borderRadius: 999,
                background: sc.bg, color: sc.fg,
                textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1,
              }}>{stageLabel}</span>
            )
          )}
        </div>
      </div>
      <JobStageFunnel currentStage={conv.stage} compact={false} />
      {metaExtras && (
        <div style={{
          paddingTop: 8,
          borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 11.5, color: COLORS.inkMuted,
          flexWrap: "wrap",
        }}>
          {metaExtras}
        </div>
      )}
    </header>
  );
}

// Small chip describing where the inquiry came from. Talent's first
// instinct when a new job lands: "Where did this come from?". This
// answers it without needing to dig into Details.
function sourceChipMeta(source: NonNullable<Conversation["source"]>): {
  icon: React.ReactNode;
  label: string;
  bg: string;
  fg: string;
  tooltip: string;
} {
  switch (source.kind) {
    case "tulala-hub":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4"/></svg>),
        label: "Tulala Hub",
        bg: COLORS.indigoSoft,
        fg: COLORS.indigoDeep,
        tooltip: source.label ?? "Discovered via Tulala Hub",
      };
    case "direct":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 3h8v6H2zM2 3l4 3 4-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>),
        label: "Direct",
        bg: "rgba(46,125,91,0.10)",
        fg: COLORS.successDeep ?? COLORS.success,
        tooltip: source.label ?? "Direct inbound to your agency",
      };
    case "agency-referral":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="3.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="8.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 6h2" stroke="currentColor" strokeWidth="1.3"/></svg>),
        label: "Referral",
        bg: COLORS.surfaceAlt,
        fg: COLORS.inkMuted,
        tooltip: source.via ? `Referred by ${source.via}` : "Routed by another agency",
      };
    case "instagram-dm":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.3"/><circle cx="6" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.3"/></svg>),
        label: "IG DM",
        bg: "rgba(218,89,153,0.12)",
        fg: "#B23170",
        tooltip: "Inbound Instagram DM",
      };
    case "email":
      return {
        icon: (<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 3h8v6H2zM2 3l4 3 4-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>),
        label: "Cold email",
        bg: "rgba(11,11,13,0.05)",
        fg: COLORS.inkMuted,
        tooltip: source.from ? `Cold email from ${source.from}` : "Cold inbound email",
      };
  }
}

// ── Slim, premium 4-step funnel — inline variant. Fits within the
// unified header (full labels) AND inside left-rail rows (compact).
function JobStageFunnel({ currentStage, compact }: { currentStage: string; compact: boolean }) {
  const idx = funnelIndexFor(currentStage);
  // Cancelled jobs get a muted coral palette instead of success green —
  // the visual cue should match the outcome (negative/abandoned), not
  // the funnel position. Same dot positions, different tone.
  const isCancelled = currentStage === "cancelled" || currentStage === "rejected" || currentStage === "expired";
  const palette = isCancelled
    ? { past: "rgba(11,11,13,0.16)", here: COLORS.coral, rail: "rgba(11,11,13,0.10)" }
    : { past: COLORS.success, here: COLORS.accent, rail: COLORS.success };
  return (
    <div role="progressbar"
      data-tulala-stage-funnel={compact ? "compact" : "full"}
      aria-valuemin={1} aria-valuemax={FUNNEL_STAGES.length} aria-valuenow={idx + 1}
      aria-label={`Stage ${idx + 1} of ${FUNNEL_STAGES.length}: ${FUNNEL_STAGES[idx]?.label}`}
      style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6, fontFamily: FONTS.body, justifyContent: "flex-start" }}
    >
      {/* Mobile: center the funnel — on narrow viewports the row of dots
          + labels feels off-balance hugged to the left. Doesn't apply
          inside the compact left-rail rows (they hug left intentionally). */}
      {!compact && (
        <style>{`
          @media (max-width: 600px) {
            [data-tulala-stage-funnel="full"] { justify-content: center !important; }
          }
        `}</style>
      )}
      {FUNNEL_STAGES.map((s, i) => {
        const past = i < idx;
        const here = i === idx;
        const dotColor = past ? palette.past : here ? palette.here : "rgba(11,11,13,0.16)";
        const railColor = past ? palette.rail : "rgba(11,11,13,0.10)";
        const dotSize = compact ? 6 : 8;
        const hereBoost = here && !compact ? 2 : 0;
        return (
          <React.Fragment key={s.id}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6, flexShrink: 0 }}>
              <span aria-hidden style={{
                width: dotSize + hereBoost, height: dotSize + hereBoost,
                borderRadius: "50%", background: dotColor,
                boxShadow: here && !compact ? `0 0 0 3px ${palette.here}22` : "none",
                transition: TRANSITION.sm,
              }} />
              {!compact && (
                <span className="tulala-funnel-label" style={{
                  fontSize: 11, fontWeight: here ? 700 : 500,
                  color: past || here ? COLORS.ink : COLORS.inkDim,
                  letterSpacing: -0.05,
                  textDecoration: isCancelled && here ? "line-through" : "none",
                }}>{s.label}</span>
              )}
            </span>
            {i < FUNNEL_STAGES.length - 1 && (
              <span aria-hidden style={{
                flex: compact ? "1 1 0" : "0 1 32px",
                height: compact ? 1 : 1.5,
                background: railColor, borderRadius: 1,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── ChannelDescriptor was removed: was a sub-header naming participants
// + visibility rules ("Booking team · Client doesn't see this"). The tab
// name and team-strip already convey who's listening, so the descriptor
// was redundant chrome. ~125 dead lines deleted. ──

function funnelIndexFor(stage: string): number {
  if (stage === "submitted" || stage === "coordination" || stage === "draft" || stage === "inquiry") return 0;
  if (stage === "offer_pending" || stage === "hold" || stage === "offered") return 1;
  if (stage === "approved" || stage === "booked") return 2;
  if (stage === "completed" || stage === "past" || stage === "rejected" || stage === "expired" || stage === "wrapped") return 3;
  // Cancelled — visually treat as terminal (stage 3) so the funnel
  // doesn't read like a fresh inquiry.
  if (stage === "cancelled") return 3;
  return 0;
}

// ── Talent JOB DETAIL — the heart of the talent shell ──
// Layout (top-down): unified header → tabs → conversation
function TalentJobDetail({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { toast } = useProto();
  const yourRate = TALENT_RATE_FOR_CONV[conv.id] ?? "—";

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
  const defaultTab: ThreadTabId = (() => {
    const pinned = consumePendingThreadTab();
    if (pinned) return pinned as ThreadTabId;
    if (isCoordinator && (conv.stage === "inquiry" || conv.stage === "hold")) return "client";
    return "talent";
  })();
  const [activeTab, setActiveTab] = useState<ThreadTabId>(defaultTab);
  // Single shared lineup-drawer state — both the conversation team
  // strip AND the Details tab's "Who's on this job" trigger this same
  // drawer so we never have two divergent representations of the same
  // lineup data on screen.
  const [lineupOpen, setLineupOpen] = useState(false);
  const lineupInquiry = useMemo(() => convToInquiry(conv), [conv]);
  const fileCount = (MOCK_FILES_FOR_CONV[conv.id] ?? []).length;
  const messages = MOCK_THREAD[conv.id] ?? [];
  const talentGroupUnread = messages.filter(m => m.kind === "text").length > 0 ? Math.min(3, conv.unreadCount) : 0;

  return (
    <div style={{
      padding: 16, fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
      // Fill the parent's available height so the inner tab content
      // can be flex:1 and own its own scroll. Without this the whole
      // shell scrolled together — header + funnel + tabs + composer
      // disappeared as the user read down the message stream.
      height: "100%", minHeight: 0,
    }}>
      {/* Unified header — replaces PageTopThread + StageProgress +
          ParticipantTrustStrip + TakeHomeCard. One band, three pieces of
          chrome (back+title, take-home chip, status pill) and a slim
          inline funnel beneath. Trust badges move to the Details rail. */}
      <TalentJobShellHeader
        conv={conv}
        yourRate={yourRate}
        onBack={onBack}
      />

      {/* TAB BAR — Conversation | Offer | Files | Details (no Client thread for talent) */}
      <div style={{
        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.md, overflow: "hidden",
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column",
      }}>
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
        {/* Tab content — ChannelDescriptor removed. The tab name +
            team-strip on the conversation already convey "you're in
            booking team / client thread", so the descriptor was just
            redundant chrome eating vertical space on mobile. */}
        {activeTab === "talent" && (
          <ConversationTab
            conv={conv}
            threadKey={`${conv.id}:talent`}
            placeholder="Message booking team…"
            crossThreadBridge={!isCoordinator ? { who: conv.leader.name, clientName: conv.client } : undefined}
            povCanEditLineup={isCoordinator}
            povCanSeeOffers={isCoordinator}
            povCanSeeCoordNote={true}
          />
        )}
        {activeTab === "client" && isCoordinator && (
          <ConversationTab
            conv={conv}
            threadKey={`${conv.id}:client`}
            placeholder={`Message ${conv.client}…`}
            povCanEditLineup={isCoordinator}
            povCanSeeOffers={isCoordinator}
            povCanSeeCoordNote={true}
          />
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
            <FilesTab conv={conv} povCanSeeTalentFiles={true} />
          </div>
        )}
        {activeTab === "payment" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <TalentPaymentTab conv={conv} yourRate={yourRate} />
          </div>
        )}
        {activeTab === "details" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <DetailsPanel
              inquiry={convToInquiry(conv)}
              pov={isCoordinator ? "talent_coord" : "talent"}
            />
          </div>
        )}
        {/* Booking — talent-only merged view. Replaces the old separate
            Logistics + Details tabs at the booked stage. Single screen
            holds: countdown → schedule + location two-up → transport +
            lodging two-up → who's on this job → coordinator → my notes. */}
        {activeTab === "booking" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <TalentBookingTab
              conv={conv}
              inquiry={convToInquiry(conv)}
              isCoordinator={isCoordinator}
              onOpenLineup={() => setLineupOpen(true)}
            />
          </div>
        )}
      </div>
      {/* Action bar — single bottom surface for "what do I do next".
          Was previously suppressed when an in-thread pin showed the
          same prompt; pins are gone now (replaced by TeamStrip), so
          the bar is the canonical action surface across all tabs. */}
      <ShellNextActionBar {...resolveShellAction(conv, isCoordinator ? "talent_coord" : "talent", toast)} />
      {/* Lineup drawer — rendered at the TalentJobDetail level (not
          inside the booking tab) so the same drawer state survives
          tab-switches and so the conversation tab's TeamStrip and the
          booking tab's "Who's on this job" can both trigger it. */}
      <LineupDrawer
        open={lineupOpen}
        onClose={() => setLineupOpen(false)}
        conv={conv}
        inquiry={lineupInquiry}
        canEdit={isCoordinator}
        povCanSeeOffers={isCoordinator}
        povCanSeeCoordNote={true}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 3) CLIENT PROJECT SHELL — calm, premium, project-status focused
// ════════════════════════════════════════════════════════════════════
//
// Detail view = a project status page. Hero is the stage progress + a
// single "Next action" card (Approve offer / Sign / Pay). Agency card,
// talent lineup avatars, schedule, files, timeline. Conversation at
// the bottom (single thread with the coordinator).

type ClientFilter = "all" | "waiting-agency" | "action-needed" | "booked" | "past";

// Derived next-action — reads offer.stage + conv.stage so adding a
// new conversation no longer requires updating a hand-rolled map.
// Static overrides below win when the derived label doesn't carry
// enough context (e.g. payment-blocker reasons unique to one conv).
function deriveClientNextAction(conv: Conversation): { label: string; primary?: boolean } | null {
  const offer = getOffer(conv.id);
  const ofStage = offer?.stage;
  // Booked + offer accepted → next-action depends on what's left.
  if (conv.stage === "booked") {
    // Mock the deposit/balance signal off the conv.amountToYou string
    // (production reads from a real invoice ledger).
    if (conv.amountToYou && /balance.*owed|balance.*due|€\d+ balance/i.test(conv.amountToYou)) {
      const m = conv.amountToYou.match(/€[\d,]+ balance/);
      return { label: m ? `Pay ${m[0]}` : "Pay balance", primary: true };
    }
    return { label: "Sign call sheet" };
  }
  if (conv.stage === "past") return null;
  if (conv.stage === "cancelled") return null;
  // Inquiry / hold — depends on offer stage.
  if (ofStage === "sent" || ofStage === "reviewing") {
    const total = offer ? offer.rows.reduce((s, r) => s + r.clientRate * r.units, 0) + offer.agencyFee : 0;
    const currency = offer?.clientBudget?.currency ?? "EUR";
    return { label: total > 0 ? `Approve offer (${fmtMoney(total, currency)})` : "Approve offer", primary: true };
  }
  if (ofStage === "countered") return { label: "Review counter", primary: true };
  if (ofStage === "accepted") return { label: "Sign booking" };
  if (conv.stage === "hold") {
    return { label: `Confirm ${conv.date ?? "hold"}`, primary: true };
  }
  if (conv.stage === "inquiry") {
    if (ofStage === "no_offer" || ofStage === "client_budget") return { label: "Add a brief", primary: true };
    return { label: "Review profiles" };
  }
  return null;
}

// Static fallbacks — used only when deriveClientNextAction can't infer
// the right label (KYC blockers, post-cancellation notes, etc.). Most
// conversations get their CTA derived; this map is for edge cases.
const CLIENT_NEXT_ACTION_OVERRIDES: Record<string, { label: string; primary?: boolean } | null> = {
  g1: { label: "Verify card on file", primary: true },
  g3: { label: "Verify card to unlock profiles", primary: true },
};

// Compatibility shim — the existing call sites use bracket access
// (`CLIENT_NEXT_ACTION_FOR_CONV[conv.id]`). Proxied so the lookup
// runs derive-then-override at call time. Pass the conv-id key, get
// the right computed action.
const CLIENT_NEXT_ACTION_FOR_CONV: Record<string, { label: string; primary?: boolean } | null> = new Proxy({}, {
  get(_t, convId: string) {
    if (CLIENT_NEXT_ACTION_OVERRIDES[convId]) return CLIENT_NEXT_ACTION_OVERRIDES[convId];
    // Find the conv across both client-profile maps.
    for (const list of Object.values(CLIENT_MOCK_CONVERSATIONS_BY_PROFILE)) {
      const c = list.find(c => c.id === convId);
      if (c) return deriveClientNextAction(c);
    }
    // Fall back to MOCK_CONVERSATIONS for talent-side ids that share
    // the same conv (preserves the c1 / c2 / c3 entries' behavior).
    const c = MOCK_CONVERSATIONS.find(c => c.id === convId);
    if (c) return deriveClientNextAction(c);
    return null;
  },
}) as Record<string, { label: string; primary?: boolean } | null>;

// Old hand-rolled map kept as a backstop reference (no longer the
// source of truth). The Proxy above wins. Useful for documenting
// what the legacy values were when something looks wrong.
const _LEGACY_CLIENT_NEXT_ACTION: Record<string, { label: string; primary?: boolean } | null> = {
  // Mock client-side next-action per conversation. Production reads
  // from the inquiry record; null = no action needed.
  c1: null,
  c2: { label: "Sign booking", primary: true },
  c3: { label: "Approve offer (€8,000)", primary: true },
  c4: { label: "Reply to coordinator" },
  c5: { label: "Pay invoice (€3,200)", primary: true },
  // Martina profile — 8 projects across stages (5 seeded + 3 new
  // for richer demo: 2 brand-new inquiries with NEW pill, 1 in-flight
  // hold awaiting approval).
  m1: { label: "Approve talent (Marta + 2 alts)", primary: true }, // inquiry · awaiting client decision
  m2: { label: "Sign call sheet" },                                // booked · routine confirmation
  m3: null,                                                         // wrapped, paid
  m4: { label: "Confirm Sep 6 hold", primary: true },              // hold · client owes a yes
  m5: null,                                                         // cancelled
  m6: { label: "Review brief + budget" },                           // brand-new inquiry, agency replying first
  m7: { label: "Review profiles" },                                 // brand-new inquiry from referral agency
  m8: { label: "Approve sunset shoot (€4,200)", primary: true },   // hold · approval needed
  // Gringo profile — 4 projects (2 seeded + 2 new for variety).
  g1: { label: "Verify card on file", primary: true },             // inquiry · KYC blocker
  g2: null,                                                         // past
  g3: { label: "Verify card to unlock profiles", primary: true },  // brand-new inquiry, KYC blocker
  g4: { label: "Pay €1,200 balance", primary: true },              // booked · balance due
};
void _LEGACY_CLIENT_NEXT_ACTION;

function ClientProjectShell() {
  // Each client profile sees only THEIR commissioned projects — not
  // the talent's full inbox or the agency's roster. Falls back to an
  // empty list if a profile hasn't seeded any.
  const { state } = useProto();
  const profileId = state.clientProfile;
  const conversations = CLIENT_MOCK_CONVERSATIONS_BY_PROFILE[profileId] ?? [];
  // Re-render on seen-state changes so the inbox re-sorts the moment
  // a row is clicked (the NEW pill drops, the unseen sort tier loses
  // that conv, and it re-ranks into the recency sort).
  useSeenSubscription();
  // Pin the conversation that the caller requested via pinNextConversation
  // (e.g. the Today bookings row). One-shot consumption — refresh won't
  // re-pin, so the user can navigate freely after.
  // Track BOTH the resolved id AND whether it came from a pin. When the
  // caller (Today row, booking row, etc.) pinned a conversation we always
  // open the thread pane — even if the pinned id happens to match the
  // default first conversation. Without this, clicking Mango (which is
  // c1, also the default) would leave the user stranded on the list.
  const { initialId, fromPin } = (() => {
    const pending = consumePendingConversation();
    if (pending && conversations.some(c => c.id === pending)) {
      return { initialId: pending, fromPin: true };
    }
    return { initialId: conversations[0]?.id ?? "", fromPin: false };
  })();
  const [activeId, setActiveId] = useState<string>(initialId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(fromPin ? "thread" : "list");

  const filtered = conversations.filter(c => {
    const next = CLIENT_NEXT_ACTION_FOR_CONV[c.id];
    if (filter === "action-needed" && !next?.primary) return false;
    if (filter === "waiting-agency" && next?.primary) return false;
    if (filter === "booked" && c.stage !== "booked") return false;
    if (filter === "past" && c.stage !== "past") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = [
        c.client, c.brief, c.agency,
        c.leader?.name, c.location, c.date,
        c.lastMessage.preview,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Same chronological model as the talent inbox: unseen tier
    // first, then by recency (freshest first). Action-needed acts
    // as a secondary tier-1 boost so projects waiting on the
    // client's decision (Approve / Sign / Pay) bubble up too.
    const aNew = (a.seen === false && !isLocallySeen(a.id)) ? 1 : 0;
    const bNew = (b.seen === false && !isLocallySeen(b.id)) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aAct = CLIENT_NEXT_ACTION_FOR_CONV[a.id]?.primary ? 1 : 0;
    const bAct = CLIENT_NEXT_ACTION_FOR_CONV[b.id]?.primary ? 1 : 0;
    if (aAct !== bAct) return bAct - aAct;
    return a.lastMessage.ageHrs - b.lastMessage.ageHrs;
  });

  const active = conversations.find(c => c.id === activeId) ?? filtered[0] ?? conversations[0];

  return (
    <>
      {/* Page header removed — list-pane header already shows "Projects · count". */}
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          // CSS variable drives the desktop 2-track layout; mobile
          // override in <style> below collapses to 1fr unambiguously.
          ["--tulala-shell-cols" as never]: "340px 1fr",
          gridTemplateColumns: "var(--tulala-shell-cols)",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
          height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 200px), 820px)",
          minHeight: 560,
          minWidth: 0,
          maxWidth: "100%",
          fontFamily: FONTS.body,
        }}
      >
        {/* Same fixed-position mobile pattern as the talent shell —
            shell pins to viewport between identity bar (top) and bottom
            nav, panes stack via grid + slide between via translateX
            (CSS lives in page.tsx). 1fr override is repeated here for
            specificity safety. */}
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){"
          + "[data-tulala-messages-shell]{"
          + "position:fixed!important;"
          + "left:0!important;right:0!important;"
          + "width:100vw!important;max-width:100vw!important;"
          + "grid-template-columns:1fr!important;"
          + "top:calc(var(--proto-cbar, 50px) + 56px)!important;"
          + "bottom:80px!important;"
          + "height:calc(100dvh - var(--proto-cbar, 50px) - 56px - 80px)!important;"
          + "min-height:0!important;max-height:none!important;"
          + "border-radius:0!important;border-left:0!important;border-right:0!important;"
          + "z-index:10!important;"
          + "}"
          + "[data-tulala-messages-shell] > *{min-width:0!important;max-width:100%!important}"
          + "}"
        }} />
        <ClientProjectInbox
          conversations={filtered}
          activeId={active?.id ?? ""}
          onSelect={(id) => { setActiveId(id); setMobilePane("thread"); markConvSeen(id); }}
          search={search} onSearchChange={setSearch}
          filter={filter} onFilterChange={setFilter}
        />
        <div data-tulala-thread-pane style={{ display: "flex", flexDirection: "column", minHeight: 0, background: COLORS.surfaceAlt, overflow: "hidden" }}>
          {active ? <ClientProjectDetail conv={active} onBack={() => setMobilePane("list")} /> : <EmptyDetail label="No project selected" />}
        </div>
      </div>
      {/* Mobile-only: thin tab on left edge to reopen the inbox while
          a thread is open. Same handle pattern as the talent shell. */}
      {mobilePane === "thread" && (
        <MobileInboxTab
          unreadCount={conversations.reduce((s, c) => s + c.unreadCount, 0)}
          onOpen={() => setMobilePane("list")}
        />
      )}
    </>
  );
}

// ── Client: project-flavored row ──
// Mirrors the TalentJobRow pattern (avatar + name + brief + funnel)
// but client-shaped: instead of "your take-home", the right-side
// signal is the next-action chip (Approve / Sign / Pay), and the
// preview line is plain-language project status. Stage-tinted
// background + NEW pill for unseen rows match the talent inbox so
// the eye reads both surfaces the same way.
function ClientProjectRow({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  const sc = stageStyle(conv.stage);
  const next = CLIENT_NEXT_ACTION_FOR_CONV[conv.id];
  const dateLabel = conv.date;
  const cityLabel = conv.location ? conv.location.split(" · ")[0] : null;
  const briefMentionsCity = cityLabel && conv.brief.toLowerCase().includes(cityLabel.toLowerCase());
  const subtitleParts = [
    conv.brief,
    dateLabel ? withWeekday(dateLabel) : null,
    !briefMentionsCity ? cityLabel : null,
  ].filter(Boolean);

  // Plain-language status — what's happening on the project today.
  // Action items come from CLIENT_NEXT_ACTION_FOR_CONV; otherwise
  // the message uses the stage-shape phrasing the client expects.
  const statusLine = (() => {
    if (next?.primary) return next.label;
    if (conv.stage === "inquiry") return "Coordinator preparing your shortlist";
    if (conv.stage === "hold") return "Hold confirmed · finalising offer";
    if (conv.stage === "booked") return "Booked · schedule confirmed";
    if (conv.stage === "past") return "Wrapped · invoice closed";
    if (conv.stage === "cancelled") return conv.outcome === "client_cancelled" ? "Cancelled by you" : "Cancelled";
    return conv.lastMessage.preview;
  })();

  const stageWord = conv.stage === "past" ? "Wrapped"
    : conv.stage === "hold" ? "Hold"
    : conv.stage === "cancelled" && conv.outcome === "client_cancelled" ? "Cancelled by you"
    : conv.stage === "cancelled" && conv.outcome === "client_rejected" ? "Offer rejected"
    : conv.stage === "cancelled" && conv.outcome === "client_no_response" ? "Expired · no reply"
    : conv.stage === "cancelled" ? "Cancelled"
    : conv.stage.charAt(0).toUpperCase() + conv.stage.slice(1);

  // Same seen + tint logic as the talent inbox so the row pattern
  // reads identically across roles.
  // Manual-unread overrides the locally-seen state — see AdminInquiryRow.
  const isUnseen = isManualUnread(conv.id) || (conv.seen === false && !isLocallySeen(conv.id));
  const isActionNeeded = !!next?.primary;
  const stageBg: string =
    active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,48,58,0.05)"
    : isActionNeeded ? "rgba(176,48,58,0.04)"
    : conv.stage === "booked" ? "rgba(46,125,91,0.045)"
    : "transparent";

  const rowRef = useScrollIntoViewWhenActive(active);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      data-tulala-inbox-row
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        width: "100%", padding: "12px 14px",
        background: stageBg,
        borderLeft: active ? `3px solid ${COLORS.accent}`
          : isUnseen ? `3px solid ${COLORS.coral}`
          : isActionNeeded ? `3px solid ${COLORS.coral}88`
          : "3px solid transparent",
        // Longhand keeps React from warning when borderLeft flips
        // between active / unseen / action-needed / default.
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
        position: "relative",
      }}
    >
      <InboxRowHoverActions rowId={conv.id} label={conv.brief} />
      {/* Project avatar — initial of the project / brand they're
          commissioning. Colored by hash so each project is visually
          distinct. */}
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <Avatar
          initials={initialsOf(conv.brief.split(" ").slice(0, 2).join(" "))}
          hashSeed={conv.brief + conv.client}
          tone="auto"
          size={36}
        />
      </span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — project name (brief) + NEW pill + age */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            title={conv.brief}
            style={{
              fontSize: 14, fontWeight: 700, color: COLORS.ink,
              flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.25, letterSpacing: -0.1,
            }}
          >
            {conv.brief}
          </span>
          {isUnseen && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              padding: "2px 6px", borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              textTransform: "uppercase",
              boxShadow: `0 0 0 2px ${COLORS.coral}1f`,
            }}>NEW</span>
          )}
          <span style={{ flexShrink: 0, fontSize: 10.5, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>
            {ageLabel(conv.lastMessage.ageHrs)}
          </span>
        </div>

        {/* Row 2 — agency / coordinator + city + date + source chip.
            Source chip surfaces whether the inquiry routed through
            Tulala Hub, IG DM, agency referral, etc. — same triage
            signal the talent gets in their inbox. */}
        {subtitleParts.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4,
            minWidth: 0,
          }}>
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1,
            }}>
              via {conv.agency}
              {subtitleParts.length > 1 && " · "}
              {subtitleParts.slice(1).join(" · ")}
            </span>
            {(() => {
              const sm = conv.source ? sourceChipMeta(conv.source) : null;
              if (!sm) return null;
              return (
                <span title={sm.tooltip} style={{
                  flexShrink: 0,
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "1px 6px", borderRadius: 999,
                  background: sm.bg, color: sm.fg,
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}>
                  <span aria-hidden style={{ display: "inline-flex" }}>{sm.icon}</span>
                  {sm.label}
                </span>
              );
            })()}
          </div>
        )}

        {/* Row 3 — status line · unread badge. When action is needed
            the line gets a coral tint + bullet so the eye flags it. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 2,
        }}>
          {isActionNeeded && (
            <span aria-hidden style={{
              flexShrink: 0,
              width: 6, height: 6, borderRadius: "50%",
              background: COLORS.coral,
            }} />
          )}
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 11.5,
            color: isActionNeeded ? COLORS.coralDeep : conv.unreadCount > 0 ? COLORS.ink : COLORS.inkMuted,
            fontWeight: isActionNeeded ? 600 : conv.unreadCount > 0 ? 500 : 400,
            lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {statusLine}
          </span>
          {conv.unreadCount > 0 && (
            <span style={{
              flexShrink: 0,
              minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, boxSizing: "border-box",
              background: COLORS.accent, color: "#fff",
              fontSize: 9.5, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>{conv.unreadCount}</span>
          )}
        </div>

        {/* Row 4 — funnel dots + stage word + coordinator chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ flex: "0 0 auto", maxWidth: 130 }}>
            <JobStageFunnel currentStage={conv.stage} compact={true} />
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: sc.fg, letterSpacing: 0.3, textTransform: "uppercase",
            flexShrink: 0,
          }}>
            {stageWord}
          </span>
          <span style={{ flex: 1 }} />
          {/* Coordinator owner — small avatar so the client knows
              who's handling their project at a glance. */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            flexShrink: 0,
            fontSize: 10.5, color: COLORS.inkMuted,
          }} title={`${conv.leader.name} · ${conv.agency}`}>
            <Avatar size={14} tone="ink" hashSeed={conv.leader.name} initials={conv.leader.initials} />
            {conv.leader.name.split(" ")[0]}
          </span>
        </div>
      </div>
    </button>
  );
}

function ClientProjectInbox({
  conversations, activeId, onSelect, search, onSearchChange, filter, onFilterChange,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string; onSearchChange: (s: string) => void;
  filter: ClientFilter; onFilterChange: (f: ClientFilter) => void;
}) {
  // Subscribe to pin/manual-unread flags so the inbox re-orders +
  // re-tints when those toggle from a row's hover actions.
  useFlagsSubscription();
  const chips: { id: ClientFilter; label: string; count?: number }[] = [
    { id: "all", label: "All projects" },
    { id: "action-needed", label: "Needs you", count: conversations.filter(c => CLIENT_NEXT_ACTION_FOR_CONV[c.id]?.primary).length },
    { id: "waiting-agency", label: "In flight" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
  ];
  return (
    <aside data-tulala-list-pane style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${COLORS.borderSoft}`, background: "#fff",
      minHeight: 0, minWidth: 0, maxWidth: "100%",
    }}>
      <HoverActionsCss />
      <div data-tulala-inbox-header style={{
        padding: "14px 14px 8px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        minWidth: 0, maxWidth: "100%",
      }}>
        <div data-tulala-list-header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Projects</h3>
          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{conversations.length}</span>
        </div>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-list-header] { display: none !important; }
            [data-tulala-inbox-header],
            [data-tulala-inbox-search],
            [data-tulala-inbox-chips],
            [data-tulala-inbox-scroll] {
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            [data-tulala-inbox-chips] {
              overflow-x: auto !important;
              scrollbar-width: none !important;
            }
            [data-tulala-inbox-chips]::-webkit-scrollbar { display: none !important; }
          }
        `}</style>
        <div data-tulala-inbox-search style={{ marginBottom: 10 }}>
          <SearchPill value={search} onChange={onSearchChange} placeholder="Search projects…" />
        </div>
        <div data-tulala-inbox-chips style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {chips.map(c => (
            <FilterChip
              key={c.id} id={c.id} label={c.label}
              active={filter === c.id}
              count={c.count}
              onClick={() => onFilterChange(c.id)}
            />
          ))}
        </div>
      </div>
      <div data-tulala-inbox-scroll style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        minWidth: 0, maxWidth: "100%",
      }}>
        {conversations.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt, color: COLORS.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              {search.trim() ? <>No matches for &ldquo;{search}&rdquo;</> : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4, maxWidth: 240 }}>
              {search.trim() ? "Try a different keyword, or clear the search." : <>Try the <strong>All projects</strong> filter or clear your search.</>}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => onSearchChange("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>Clear search</button>
            )}
          </div>
        ) : renderWithDateGroups(
            sortPinnedFirst(conversations),
            c => c.lastMessage.ageHrs,
            c => (
              <ClientProjectRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ),
          )}
      </div>
    </aside>
  );
}

// ── Client PROJECT DETAIL — calm, status-focused ──
function ClientProjectDetail({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { toast } = useProto();

  // Mock talent lineup for client view (would come from inquiry record)
  const lineup = (conv.participants ?? []).filter(p => p.isTalent).slice(0, 4);

  // Mock timeline of milestones (events the client cares about)
  const timeline: { ts: string; label: string }[] = [
    { ts: "Apr 22", label: "Inquiry sent" },
    { ts: "Apr 22", label: `${conv.leader.name} assigned as your coordinator` },
    ...(conv.stage !== "inquiry" ? [{ ts: "Apr 23", label: "Offer sent · €8,000" }] : []),
    ...(conv.stage === "booked" || conv.stage === "past" ? [{ ts: "Apr 23", label: "You approved offer" }] : []),
    ...(conv.stage === "booked" || conv.stage === "past" ? [{ ts: "Apr 24", label: "Call sheet published" }] : []),
    ...(conv.stage === "past" ? [{ ts: "May 6",  label: "Shoot wrapped" }] : []),
    ...(conv.stage === "past" ? [{ ts: "May 13", label: "Selects shared" }] : []),
  ];

  return (
    <div style={{
      padding: 16, fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
      height: "100%", minHeight: 0,
    }}>
      {/* Unified shell header — same compact band as the talent shell.
          Trust badges, source channel, status pill, and slim funnel
          all consolidated. Client view: take-home is replaced by the
          "next action" CTA, since clients care about what they owe
          (decision, signature, payment) more than fee breakdowns. */}
      <ShellHeader
        conv={conv}
        onBack={onBack}
        backLabel="Projects"
        primaryChip={null}
        showCoordPill={false}
        rightSlot={(() => {
          const action = CLIENT_NEXT_ACTION_FOR_CONV[conv.id];
          if (!action) return null;
          return (
            <button type="button" onClick={() => toast(action.label)} style={{
              padding: "5px 11px", borderRadius: 999,
              border: action.primary ? "none" : `1px solid ${COLORS.border}`,
              background: action.primary ? COLORS.success : "transparent",
              color: action.primary ? "#fff" : COLORS.ink,
              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
              {action.label}
            </button>
          );
        })()}
      />
      {/* TAB BAR — Client thread (native) | Talent group (locked) | Files | Details */}
      <ClientTabsBlock conv={conv} lineup={lineup} timeline={timeline} />
    </div>
  );
}

// ── Client tabs block — Client thread (native) | Talent group (locked) | Files | Details ──
function ClientTabsBlock({
  conv, lineup, timeline,
}: {
  conv: Conversation;
  lineup: Participant[];
  timeline: { ts: string; label: string }[];
}) {
  const { toast } = useProto();
  const [activeTab, setActiveTab] = useState<ThreadTabId>("client");
  const fileCount = (MOCK_FILES_FOR_CONV[conv.id] ?? []).filter(f => f.thread === "client").length;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md, overflow: "hidden",
      flex: 1, minHeight: 0,
      display: "flex", flexDirection: "column",
    }}>
      <ThreadTabBar
        activeId={activeTab}
        onSelect={setActiveTab}
        tabs={buildInquiryTabs({
          status: conv.stage === "booked" || conv.stage === "past" ? "booked" : "inquiry",
          pov: "client",
          unread: { client: conv.unreadCount, files: fileCount },
          offerNeedsAttention: getOffer(conv.id)?.stage === "sent",
          paymentDue: conv.stage === "booked",
        })}
      />
      {activeTab === "client" && (
        <ConversationTab
          conv={conv}
          threadKey={`${conv.id}:client`}
          placeholder={`Message ${conv.leader.name.split(" ")[0]}…`}
          /* Client can suggest swaps + add talent to their own lineup.
             Offer details visible in the dedicated Offer tab; the
             lineup drawer just shows the line item totals. */
          povCanEditLineup={true}
          povCanSeeOffers={true}
          povCanSeeCoordNote={false}
        />
      )}
      {activeTab === "talent" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <LockedTabOverlay
            title="Talent group is internal"
            subtitle={`This is the coordinator's working thread with the talent (${lineup.map(t => t.name.split(" ")[0]).join(", ")}). You don't need to see it day-to-day, but ${conv.leader.name} can pull you in if it's useful.`}
            requestLabel="Ask coordinator to share"
            onRequest={() => toast("Request sent to coordinator")}
            ghostPreview={
              <>
                <div style={{ marginBottom: 8 }}><strong>{conv.leader.name}:</strong> Lineup confirmed for May 6. Marta + Tomás locked, Zara on standby…</div>
                {lineup[0] && <div style={{ marginBottom: 8, marginLeft: 24 }}><strong>{lineup[0].name}:</strong> All clear from me — happy to confirm.</div>}
                {lineup[1] && <div style={{ marginBottom: 8, marginLeft: 24 }}><strong>{lineup[1].name}:</strong> Checking my schedule, back in an hour…</div>}
              </>
            }
          />
        </div>
      )}
      {activeTab === "offer" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <OfferTab conv={conv} pov={{ kind: "client" }} />
        </div>
      )}
      {activeTab === "logistics" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <LogisticsTab inquiry={convToInquiry(conv)} pov="client" />
        </div>
      )}
      {activeTab === "payment" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <PaymentTab inquiry={convToInquiry(conv)} pov="client" />
        </div>
      )}
      {activeTab === "files" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <FilesTab conv={conv} povCanSeeTalentFiles={false} />
        </div>
      )}
      {activeTab === "details" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <DetailsPanel inquiry={convToInquiry(conv)} pov="client" />
        </div>
      )}
      {/* Merged "Project" tab — replaces Details + Logistics for client.
          Same surface pattern as the talent's "Details" tab so the
          design language is consistent across roles. */}
      {activeTab === "booking" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <ClientProjectViewTab conv={conv} inquiry={convToInquiry(conv)} />
        </div>
      )}
      <ShellNextActionBar {...resolveShellAction(conv, "client", toast)} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Shared detail-view atoms (used by talent + client detail views)
// ════════════════════════════════════════════════════════════════════

function DetailBlock({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {icon && <span aria-hidden style={{ color: COLORS.inkMuted, display: "inline-flex" }}>{icon}</span>}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 12.5 }}>
      <span style={{ color: COLORS.inkMuted }}>{label}</span>
      <span style={{ color: COLORS.ink, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function ActionButton({ label, primary, tone, onClick }: { label: string; primary?: boolean; tone?: "danger"; onClick: () => void }) {
  const bg = primary ? COLORS.fill : "#fff";
  const fg = primary ? "#fff" : tone === "danger" ? COLORS.coral : COLORS.ink;
  const border = primary ? "none" : `1px solid ${tone === "danger" ? `${COLORS.coral}40` : COLORS.border}`;
  return (
    <button type="button" onClick={onClick} style={{
      padding: "10px 12px", borderRadius: 8, border, background: bg, color: fg,
      fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, cursor: "pointer",
      transition: TRANSITION.sm,
    }}>
      {label}
    </button>
  );
}

function MiniComposer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onSend(val); setVal(""); } }}
        placeholder={placeholder}
        style={{
          flex: 1, padding: "10px 14px", borderRadius: 24,
          background: "rgba(11,11,13,0.04)", border: `1.5px solid ${val ? COLORS.accent : "transparent"}`,
          fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, outline: "none",
        }}
      />
      <button type="button" disabled={!val.trim()} onClick={() => { if (val.trim()) { onSend(val); setVal(""); } }}
        aria-label="Send"
        style={{
          width: 36, height: 36, borderRadius: "50%", border: "none",
          cursor: val.trim() ? "pointer" : "default",
          background: val.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
          color: val.trim() ? "#fff" : COLORS.inkDim,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12.5 7H1.5M12.5 7L8 2.5M12.5 7L8 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

function EmptyDetail({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.inkDim, fontSize: 13, fontFamily: FONTS.body }}>
      {label}
    </div>
  );
}

// #9 — Talent take-home with collapsible breakdown.
// Headline = the take-home (what they get). Click "See breakdown"
// reveals: gross rate · agency commission · platform fee · take-home.
function TakeHomeCard({ takeHome, stage }: { takeHome: string; stage: string }) {
  const [expanded, setExpanded] = useState(false);
  // Mock the breakdown — production reads from booking record.
  // Talent take-home is the headline; everything else derives.
  const numeric = parseFloat(takeHome.replace(/[^0-9.]/g, ""));
  const isReal = !isNaN(numeric) && numeric > 0;
  const currency = takeHome.match(/[€£$]/)?.[0] ?? "€";
  const gross = isReal ? numeric / 0.80 : 0; // talent's 80% of gross
  const agencyFee = isReal ? gross * 0.15 : 0;
  const platformFee = isReal ? gross * 0.05 : 0;
  const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

  return (
    <div style={{
      background: COLORS.successSoft, border: `1px solid ${COLORS.success}30`,
      borderRadius: RADIUS.md, padding: 16,
      fontFamily: FONTS.body,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.success }}>Your take-home</div>
          <div style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 700, color: COLORS.ink, marginTop: 2, letterSpacing: -0.5 }}>{takeHome}</div>
          <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
            {stage === "past" ? "Paid · invoice receipt available" : "Paid 14 days post-shoot"}
          </div>
        </div>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: COLORS.success }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5v13M4.5 5.5C4.5 4 5.5 3 7 3h2c1.5 0 2.5 1 2.5 2.5S10.5 8 9 8H7c-1.5 0-2.5 1-2.5 2.5S5.5 13 7 13h2c1.5 0 2.5-1 2.5-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </span>
      </div>
      {isReal && (
        <>
          <button type="button" onClick={() => setExpanded(v => !v)} style={{
            marginTop: 10, background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, color: COLORS.success,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            {expanded ? "Hide breakdown" : "See breakdown"}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: TRANSITION.sm }}>
              <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {expanded && (
            <div style={{ marginTop: 10, padding: 12, background: "rgba(255,255,255,0.5)", borderRadius: 8, border: `1px solid ${COLORS.success}25` }}>
              <BreakdownRow label="Gross rate"      value={fmt(gross)} muted />
              <BreakdownRow label="Agency commission (15%)" value={`–${fmt(agencyFee)}`} muted />
              <BreakdownRow label="Platform fee (5%)"  value={`–${fmt(platformFee)}`} muted />
              <div style={{ height: 1, background: `${COLORS.success}25`, margin: "6px 0" }} />
              <BreakdownRow label="Your take-home" value={takeHome} bold />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: muted ? COLORS.inkMuted : COLORS.ink }}>{label}</span>
      <span style={{ color: COLORS.ink, fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Shared TAB SYSTEM — shipped to talent + client per the spec.
// (Admin already has its own tab implementation inside WorkspaceBody.)
// ════════════════════════════════════════════════════════════════════

/**
 * Build the tab config for the inquiry shell.
 *
 * Same shell, evolved tabs as the record moves through its lifecycle:
 *   - inquiry / coordinating / offer:  client · talent · offer · files · details
 *   - booked / wrapped:                client · talent · logistics · files · payment · details
 *
 * Pov drives lock states (a non-coord talent can't see the client thread,
 * a client can't see the talent group). Booking-stage tabs surface only
 * once the inquiry has converted.
 */
export function buildInquiryTabs(opts: {
  status: "inquiry" | "booked";
  pov: "admin" | "client" | "talent_coord" | "talent";
  unread?: { client?: number; talent?: number; files?: number };
  offerNeedsAttention?: boolean;
  paymentDue?: boolean;
  /** Workspace plan tier — hides team-only surfaces on Free
   *  (no team to coordinate with). Admin-only. */
  planTier?: "free" | "studio" | "agency" | "hub-network" | "network";
}): TabDef[] {
  const { status, pov, unread = {}, offerNeedsAttention, paymentDue, planTier } = opts;
  const tabs: TabDef[] = [];

  // Client thread — visible to admin/client/talent_coord. Hidden entirely
  // for non-coord talent (was prior locked-tab — too much chrome for
  // something they can't use).
  if (pov !== "talent") {
    tabs.push({
      id: "client",
      label: "Client thread",
      state: "active",
      badge: unread.client && unread.client > 0 ? unread.client : undefined,
    });
  }
  // Talent group — locked for client. For talent we use "Booking team"
  // (industry term that names the participants — coordinator + booked
  // talent) instead of the technical "Talent group". Coordinator-talents
  // also get this label so they don't see two different names for the
  // same channel.
  //
  // Free-tier exception: solo workspace has no team to coordinate with,
  // so the Talent group tab adds zero value and clutters the bar. Hide.
  const hideTalentGroupOnFree = pov === "admin" && planTier === "free";
  if (!hideTalentGroupOnFree) {
    tabs.push({
      id: "talent",
      label: (pov === "talent" || pov === "talent_coord") ? "Booking team" : "Talent group",
      state: pov === "client" ? "locked" : "active",
      lockedReason: pov === "client" ? "Internal coordination" : undefined,
      badge: unread.talent && unread.talent > 0 ? unread.talent : undefined,
    });
  }
  // Inquiry-stage commercial tab.
  if (status === "inquiry") {
    tabs.push({
      id: "offer",
      label: "Offer",
      state: "active",
      badge: offerNeedsAttention ? "!" : undefined,
    });
  }
  // For talent / talent_coord we run a SINGLE merged info tab at every
  // stage — same component (TalentBookingTab) renders the right cards
  // for whatever data is on the conversation. Inquiry stage shows the
  // job + lineup + coord; booked stage adds countdown + call sheet +
  // transport + lodging. One tab, no stage-dependent label so the
  // talent always knows where to find the details. Admin and client
  // keep the legacy split (Logistics call-sheet editor + Details) since
  // they need different controls per stage.
  // Talent + client both get a single MERGED info tab — talent calls
  // it "Details" (carries the full booking + project context), client
  // calls it "Project" (project status + lineup + when/where + coord).
  // Admin now uses the same merged tab pattern (AdminBookingTab); the
  // dedicated Logistics call-sheet editor is still surfaced separately
  // for admin only because they're orchestrating across both threads
  // and need a focused editor surface for the call sheet.
  const isTalentPov = pov === "talent" || pov === "talent_coord";
  const isClientPov = pov === "client";
  const isAdminPov = pov === "admin";
  // All three povs now get a merged info tab (the polished card grid).
  // Admin additionally keeps the dedicated Logistics editor at booked
  // stage; talent's logistics info is folded into the merged tab.
  const useMergedInfoTab = true;
  if (status === "booked" && isAdminPov) {
    tabs.push({ id: "logistics", label: "Logistics", state: "active" });
  }
  tabs.push({
    id: "files",
    label: "Files",
    state: "active",
    badge: unread.files && unread.files > 0 ? unread.files : undefined,
  });
  if (status === "booked") {
    // Payment — used to be locked for talent. But booked talent care
    // intensely about: when do I get paid, what method, what's the
    // status. The talent-side view is intentionally narrow (their
    // take-home only, not the full client invoice). Coordinators of a
    // talent_coord can still see the full picture.
    tabs.push({
      id: "payment",
      label: "Payment",
      state: "active",
      badge: paymentDue ? "!" : undefined,
    });
  }
  if (useMergedInfoTab) {
    // Tab labels: client = "Project" (their language), admin =
    // "Project" (mirrors client now that admin renders the same card-
    // grid view), talent = "Details" (industry term — they're inside
    // the booking, not commissioning a project).
    const mergedLabel = isClientPov || isAdminPov ? "Project" : "Details";
    tabs.push({
      id: "booking",
      label: mergedLabel,
      state: "active",
    });
  } else {
    tabs.push({ id: "details", label: "Details", state: "active" });
  }
  // Suppress unused warning — kept for future per-pov diverging logic.
  void isTalentPov;
  return tabs;
}

// Conversation → InquiryRecord adapter. Talent/client shells consume
// `Conversation`, but the new shared shell components consume the
// canonical `InquiryRecord`. This bridges the two while we retire
// Conversation in a future pass.
// Photo lookup for talents that appear in synthesized inquiries
// (c4 / c5 / c6 / c7 / c8 / c9 / c10 — anywhere convToInquiry can't
// hit RICH_INQUIRIES). Explicit map for named talents in the
// prototype, deterministic pravatar fallback otherwise so the UI
// never renders bare initials.
const TALENT_PHOTO_BY_NAME: Record<string, string> = {
  "Marta Reyes":     "https://i.pravatar.cc/200?img=5",
  "Lucia Ortiz":     "https://i.pravatar.cc/200?img=47",
  "Camille Roux":    "https://i.pravatar.cc/200?img=44",
  "Marco Vasquez":   "https://i.pravatar.cc/200?img=33",
  "Sofia Herrera":   "https://i.pravatar.cc/200?img=49",
  "Emma Ricci":      "https://i.pravatar.cc/200?img=20",
  "Tomás Navarro":   "https://i.pravatar.cc/200?img=12",
  "Lina Park":       "https://i.pravatar.cc/200?img=30",
  "Kai Lin":         "https://i.pravatar.cc/200?img=14",
  "Yael Soto":       "https://i.pravatar.cc/200?img=23",
  "Cleo Vega":       "https://i.pravatar.cc/200?img=45",
  "Tariq Joubert":   "https://i.pravatar.cc/200?img=68",
  "Anouk Naseri":    "https://i.pravatar.cc/200?img=43",
  "Nadia Köhler":    "https://i.pravatar.cc/200?img=48",
  "Zara Habib":      "https://i.pravatar.cc/200?img=36",
  "Hana Matsumoto":  "https://i.pravatar.cc/200?img=39",
  "Riku Vesa":       "https://i.pravatar.cc/200?img=11",
  "Sofia Andrade":   "https://i.pravatar.cc/200?img=25",
  "Diego Álvarez":   "https://i.pravatar.cc/200?img=8",
};
function photoForTalent(name: string): string | undefined {
  if (TALENT_PHOTO_BY_NAME[name]) return TALENT_PHOTO_BY_NAME[name];
  // Deterministic fallback — hash the name to one of pravatar's
  // 70 portraits. Same name always picks the same face.
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return `https://i.pravatar.cc/200?img=${(h % 70) + 1}`;
}

function convToInquiry(conv: Conversation): InquiryRecord {
  // Try the matching RichInquiry first (richer data); fall back to a
  // synthesized record from the Conversation alone.
  const matchingRich = RICH_INQUIRIES.find(r =>
    r.clientName.toLowerCase().includes(conv.client.toLowerCase()) ||
    conv.client.toLowerCase().includes(r.clientName.toLowerCase())
  );
  if (matchingRich) return toInquiry(matchingRich);

  const status: import("./_state").InquiryStatus =
      conv.stage === "booked" ? "booked"
    : conv.stage === "past" ? "wrapped"
    : conv.stage === "cancelled" ? "cancelled"
    : conv.stage === "hold" ? "coordinating"
    : "submitted";

  // Derive talent lineup from the conv's participants (anyone marked
  // isTalent). Map Conversation.Participant → InquiryRecord.talent.
  // Status defaults to "accepted" — production has a real workflow but
  // the fallback path is for jobs without rich inquiry data, where we
  // assume the talent is on the lineup if they're listed at all.
  const derivedTalent = (conv.participants ?? [])
    .filter(p => p.isTalent)
    .map(p => ({
      talentId: `t-${p.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: p.name,
      initials: p.initials,
      photoUrl: photoForTalent(p.name),
      // "accepted" was the legacy value — the canonical InquiryTalentInvite
      // union is invited/declined/hold/confirmed/selected/withdrawn.
      // "confirmed" is the closest semantic match for an on-lineup talent.
      state: "confirmed" as const,
    }));

  return {
    id: conv.id,
    source: { kind: "agency_referral" },
    status,
    createdBy: { id: conv.client, name: conv.client },
    createdAt: `${conv.lastMessage.ageHrs}h ago`,
    title: conv.brief,
    client: { id: conv.client.toLowerCase().replace(/\s+/g, "-"), name: conv.client },
    coordinators: conv.leader ? [{
      id: conv.leader.name.toLowerCase().replace(/\s+/g, "-"),
      name: conv.leader.name,
      initials: conv.leader.initials,
      role: "coordinator",
    }] : [],
    talent: derivedTalent,
    schedule: { start: conv.date ?? "TBC" },
    location: conv.location
      ? { mode: "on_site", city: conv.location.split(" · ")[0], venue: conv.location.split(" · ")[1] }
      : { mode: "tbc" },
    brief: { summary: conv.brief, files: [] },
    threads: { client: `${conv.id}:client`, talentGroup: `${conv.id}:talent` },
    timeline: [],
  };
}

// ════════════════════════════════════════════════════════════════════
// LogisticsTab + PaymentTab — the booking-stage tabs that swap in once
// inquiry.status flips to "booked". Same shell, evolved tab config —
// the user's mental model ("this is my Mango project") never breaks.
// ════════════════════════════════════════════════════════════════════

// ── TalentBookingTab — merged Logistics + Details for booked talent.
// Single comprehensive screen that replaces tab-hopping between two
// near-duplicate views. 2026 layout: 2-column grids on desktop where it
// makes sense (Schedule | Location, Transport | Lodging, Lineup |
// Coordinator), tighter card spacing, soft shadows, gradient countdown.
// On mobile the grids collapse to a single column, the gap shrinks,
// and the countdown banner stays full-width. ──
function TalentBookingTab({
  conv, inquiry, isCoordinator, onOpenLineup,
}: {
  conv: Conversation;
  inquiry: InquiryRecord;
  isCoordinator: boolean;
  /** Opens the lineup drawer (managed by TalentJobDetail). When
   *  provided, the "Who's on this job" card renders an edit/view
   *  affordance. Coords see "Edit lineup" (add + remove); non-coord
   *  talent see "View lineup" (read-only). */
  onOpenLineup?: () => void;
}) {
  const { toast } = useProto();
  const pinned = conv.pinned ?? {};
  const days = countdownLabel(inquiry.schedule.start);
  const coord = inquiry.coordinators[0];
  const teammates = inquiry.talent.length > 1;
  // Solo-coord case: when isCoordinator AND there's only 1 talent (the
  // coord themselves), we still render the lineup card so the coord has
  // an obvious surface to invite a teammate from. Without this they'd
  // get no affordance at all.
  const soloCoord = isCoordinator && inquiry.talent.length <= 1;
  const showLineupCard = teammates || soloCoord;
  const showCoord = !!coord;
  const hotel = (pinned as { hotel?: string }).hotel;
  // Historical offer reference — only at booked / past stages, when
  // the OfferTab is hidden by buildInquiryTabs. Pulls the talent's
  // accepted row + currency so the booking tab can surface the agreed
  // terms inline. Talent shouldn't have to dig into a hidden tab to
  // re-read what they agreed to.
  const histOffer = (conv.stage === "booked" || conv.stage === "past")
    ? MOCK_OFFER_FOR_CONV[conv.id]
    : undefined;
  const histRow = histOffer?.rows.find(r => r.talentId === currentTalentId());
  const histCurrency = histOffer?.clientBudget?.currency ?? "EUR";

  // Card style — compact 2026 surface. Soft hairline border, very
  // subtle shadow on desktop only (mobile keeps it flat to read more
  // like the iOS "list inset" pattern). 12px corners, 12-14px inner
  // padding to balance density against the new 8px gap between cards.
  const cardStyle: CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
    // Cards must be able to shrink to fit their grid track without
    // letting their content (avatars + buttons + text) push the
    // border outline beyond the viewport. min-width:0 lets the flex/
    // grid track shrink; overflow:hidden + max-width:100% stop any
    // surviving content overflow from leaking past the card frame.
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    boxSizing: "border-box",
  };
  const sectionTitle: CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  };

  return (
    <div data-tulala-booking-tab style={{
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontFamily: FONTS.body,
    }}>
      {/* Mobile: KEEP the 2-column grids (per user request — denser
          info-card layout that mirrors desktop). The page-wide mobile
          CSS in page.tsx has a generic [style*="grid-template-columns:
          1fr 1fr"] rule that collapses every two-up grid to single
          column at ≤720px — we override it here with higher specificity
          so the booking-tab grids stay 2-up. Paddings + gaps tighten so
          cards still breathe at 360px. */}
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-booking-tab]{padding:10px!important;gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-grid]{gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-card]{padding:9px 10px!important}"
        + "[data-tulala-booking-tab] [data-booking-section-title]{font-size:9.5px!important;margin-bottom:5px!important}"
        + "[data-tulala-booking-tab] [data-booking-card] h1,"
        + "[data-tulala-booking-tab] [data-booking-card] [data-booking-headline]{font-size:13px!important}"
        + "}"
        // Below 480px every booking-grid row collapses to one column —
        // when the column track drops under ~160px the LocationMapTile
        // and the lineup card both truncate badly.
        + "@media (max-width: 480px){"
        + "[data-tulala-booking-tab] [data-booking-grid]{grid-template-columns:1fr!important}"
        + "}"
      }} />

      {/* Countdown — gradient banner that doubles as the visual anchor
          of the tab. Hidden when the shoot is more than 14 days out
          (countdownLabel returns null) so the banner stays meaningful. */}
      {days && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: days.urgent
            ? `linear-gradient(135deg, ${COLORS.amber}18 0%, ${COLORS.amber}08 100%)`
            : `linear-gradient(135deg, ${COLORS.successSoft} 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid ${days.urgent ? `${COLORS.amber}40` : `${COLORS.success}30`}`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: days.urgent ? `${COLORS.amber}28` : `${COLORS.success}20`,
            color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success),
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2.5 6.5h11M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success),
            }}>{days.headline}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {days.subhead}
            </div>
          </div>
        </div>
      )}

      {/* The job — title + brief + source. One row, no over-styled chrome.
          Source chip surfaces where the inquiry came from (Tulala Hub /
          Direct / Referral / IG DM / etc.) so the talent reads the
          relationship context next to the job they're looking at. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>The job</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.35 }}>
          {inquiry.title}
        </div>
        {inquiry.client.name && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>
            For {inquiry.client.name}
          </div>
        )}
        {/* Source chip — small inline pill that names the inbound
            channel (and the specific origin via tooltip). Falls back to
            no chip when the conversation has no source set. */}
        {(() => {
          const sourceMeta = conv.source ? sourceChipMeta(conv.source) : null;
          if (!sourceMeta) return null;
          return (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                textTransform: "uppercase", color: COLORS.inkDim,
              }}>Came in via</span>
              <span
                aria-label={`Source: ${sourceMeta.label}`}
                title={sourceMeta.tooltip}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 9px", borderRadius: 999,
                  background: sourceMeta.bg, color: sourceMeta.fg,
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.2,
                }}
              >
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
              {/* Origin label — additional human-readable detail
                  (e.g. "Tulala Hub · Hospitality vertical"). Hidden
                  when redundant with the chip label itself. The
                  property name varies per source kind, so we resolve
                  it via a small per-kind getter. */}
              {(() => {
                const src = conv.source;
                if (!src) return null;
                const detail =
                  (src.kind === "tulala-hub" || src.kind === "direct") ? src.label
                  : src.kind === "agency-referral" ? (src.via ? `via ${src.via}` : null)
                  : src.kind === "email" ? (src.from ? `from ${src.from}` : null)
                  : null;
                if (!detail || detail.toLowerCase() === sourceMeta.label.toLowerCase()) return null;
                return (
                  <span style={{
                    fontSize: 11, color: COLORS.inkMuted,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    minWidth: 0,
                  }}>{detail}</span>
                );
              })()}
            </div>
          );
        })()}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, color: COLORS.ink, marginTop: 8, lineHeight: 1.55 }}>
            {inquiry.brief.summary}
          </div>
        )}
        {inquiry.brief.notes && (
          <div style={{
            fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.55,
            marginTop: 8,
            padding: "8px 10px",
            background: COLORS.surfaceAlt,
            borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
          }}>
            {inquiry.brief.notes}
          </div>
        )}
        {/* Coordinator's framing — every conversation seeded a
            pinned.coordinatorNote with the agent's read of the deal
            ("Mango is keen", "Returning client", "Brand-new client").
            Surfaces here as a quoted strip so the talent reads the
            agency's perspective right next to the job context. */}
        {pinned.coordinatorNote && (
          <div style={{
            marginTop: 10,
            display: "flex", gap: 9,
            padding: "10px 12px",
            background: COLORS.indigoSoft,
            border: `1px solid rgba(91,107,160,0.18)`,
            borderRadius: 10,
          }}>
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1, color: COLORS.indigoDeep }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 3h3v3H4l-1 2v-2H3V3zm5 0h3v3H9l-1 2v-2H8V3z" fill="currentColor"/>
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", color: COLORS.indigoDeep,
                marginBottom: 2,
              }}>
                {coord ? `${coord.name.split(" ")[0]}'s read` : "Coordinator's read"}
              </div>
              <div style={{
                fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5,
                fontStyle: "italic",
              }}>
                "{pinned.coordinatorNote}"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booked-stage historical offer reference. Only renders when
          the offer tab is hidden (booked/past stages) and there's an
          accepted row for the talent. Surfaces the agreed rate +
          take-home so the talent can re-read the terms inline. */}
      {histOffer && histRow && histRow.costRate > 0 && (
        <div data-booking-card style={{
          ...cardStyle,
          // Soft success tint to mark this as "locked-in commercials"
          // (different visual register from the active info cards).
          background: `linear-gradient(180deg, ${COLORS.successSoft} 0%, #fff 60%)`,
          borderColor: `rgba(46,125,91,0.18)`,
        }}>
          <div data-booking-section-title style={{
            ...sectionTitle,
            color: COLORS.successDeep ?? COLORS.success,
          }}>
            {conv.stage === "past" ? "What you were paid" : "Your booking terms"}
          </div>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
              color: COLORS.ink, fontVariantNumeric: "tabular-nums",
              letterSpacing: -0.4, lineHeight: 1,
            }}>
              {fmtMoney(histRow.costRate * histRow.units, histCurrency)}
            </span>
            <span style={{ fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>
              {histRow.units} × {UNIT_TYPE_LABEL[histRow.unitType]}
            </span>
          </div>
          {histRow.notes && (
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 6, fontStyle: "italic", lineHeight: 1.4 }}>
              "{histRow.notes}"
            </div>
          )}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginTop: 8, fontSize: 11, color: COLORS.inkMuted,
          }}>
            <span aria-hidden style={{ color: COLORS.success }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" fill="currentColor" opacity="0.18"/>
                <path d="M3.5 6l1.7 1.7L8.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            {conv.stage === "past"
              ? "Receipt + invoice in Files."
              : "Locked. Contract signed."}
          </div>
        </div>
      )}

      {/* Schedule + Location — 2-up. Schedule is the most-asked
          question, Location the second. Side-by-side at desktop,
          stacked at mobile via the data-booking-grid media rule. */}
      <div data-booking-grid style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>When</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
            {inquiry.schedule.start}
            {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
          </div>
          {pinned.callTime && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
              Call time · <span style={{ color: COLORS.ink, fontWeight: 600 }}>{pinned.callTime}</span>
            </div>
          )}
          {pinned.schedule && (
            <div style={{
              fontSize: 11.5, color: COLORS.inkMuted, marginTop: 6,
              lineHeight: 1.5, whiteSpace: "pre-line",
            }}>
              {pinned.schedule}
            </div>
          )}
        </div>
        <div data-booking-card style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div data-booking-section-title style={{ ...sectionTitle, padding: "12px 14px 0" }}>Where</div>
          {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) ? (
            <div style={{ padding: "8px 14px 12px" }}>
              <LocationMapTile
                venue={inquiry.location.venue}
                address={inquiry.location.address}
                city={inquiry.location.city}
                onOpenMaps={() => toast("Open map")}
              />
            </div>
          ) : (
            <div style={{ padding: "0 14px 12px", fontSize: 12, color: COLORS.inkMuted }}>
              Location TBC.
            </div>
          )}
        </div>
      </div>

      {/* Transport + Lodging — 2-up. Both pulled from pinned data set
          by the coordinator; falls back to "not shared yet" copy when
          missing so the slot doesn't read as broken. */}
      <div data-booking-grid style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>Transport</div>
          {pinned.transport ? (
            <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5 }}>
              {pinned.transport}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              Coordinator hasn't shared transport yet.
            </div>
          )}
        </div>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>Lodging</div>
          {hotel ? (
            <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5 }}>
              {hotel}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              No hotel needed for this job.
            </div>
          )}
        </div>
      </div>

      {/* Who's on this job + Coordinator — 2-up when both present.
          Lineup shows ALL teammates (not just self) with state pills so
          the talent reads the team's health at a glance. */}
      {(showLineupCard || showCoord) && (
        <div data-booking-grid style={{
          display: "grid",
          gridTemplateColumns: showLineupCard && showCoord ? "1.4fr 1fr" : "1fr",
          gap: 10,
        }}>
          {showLineupCard && (
            <div data-booking-card style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>
                {soloCoord && !teammates ? "On this job" : "Who's on this job"}
              </div>
              {inquiry.talent.map(t => (
                <RosterMemberRow
                  key={t.talentId}
                  talent={t}
                  isMe={t.talentId === currentTalentId() || t.name === MY_TALENT_PROFILE.name}
                  stagePast={inquiry.status === "wrapped" || inquiry.status === "cancelled"}
                />
              ))}
              {soloCoord && inquiry.talent.length === 0 && (
                <div style={{ fontSize: 12, color: COLORS.inkMuted, padding: "8px 0" }}>
                  No talent on this job yet.
                </div>
              )}
              {/* Edit / view lineup affordance — opens the same lineup
                  drawer the conversation tab's TeamStrip uses, so the
                  user gets one canonical surface for adding/removing
                  talent. Coords get the full add/remove flow; non-coord
                  talent get a read-only view-all-members drawer. */}
              {onOpenLineup && (
                <button
                  type="button"
                  onClick={onOpenLineup}
                  style={{
                    marginTop: 10, width: "100%",
                    padding: "8px 10px", borderRadius: 8,
                    border: `1px ${isCoordinator ? "dashed" : "solid"} ${COLORS.border}`,
                    background: isCoordinator ? COLORS.accentSoft : "transparent",
                    color: isCoordinator ? COLORS.accentDeep : COLORS.ink,
                    cursor: "pointer",
                    fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {isCoordinator ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                      {soloCoord && !teammates ? "Invite a teammate" : "Edit lineup · add or remove talent"}
                    </>
                  ) : (
                    <>
                      View full lineup
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M3.5 2L7.5 6L3.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
          {showCoord && (
            <div data-booking-card data-booking-coord style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>Your coordinator</div>
              {/* Identity row — avatar + name. Stacks above the action
                  button so the card never has to fit avatar + name +
                  button on a single 42%-of-viewport horizontal track. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <Avatar size={36} tone="auto" hashSeed={coord.name} initials={coord.initials} />
                  <PresenceDot name={coord.name} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: COLORS.ink,
                    display: "flex", alignItems: "center", gap: 6,
                    minWidth: 0,
                  }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {coord.name}
                    </span>
                    <CoordRoleBadge role={coord.role} />
                  </div>
                  <div style={{
                    fontSize: 11, color: COLORS.inkMuted,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {coord.role === "owner" ? "Workspace owner" : "Your coordinator"}
                  </div>
                </div>
              </div>
              {/* Action row — full-width Message button. Sits below the
                  identity row so it never competes with name truncation
                  for horizontal space. Same look as before, just wraps
                  underneath when the card is narrow. */}
              <button type="button" onClick={() => toast(`Messaging ${coord.name}…`)} style={{
                marginTop: 10, width: "100%",
                padding: "7px 10px", borderRadius: 8,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 3.5h10v6H6L3 12v-2.5H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
                Message
              </button>
            </div>
          )}
        </div>
      )}

      {/* My notes — personal scratchpad. Keyed by conv.id so each job
          has its own draft (no more shared note bleeding across all
          conversations). Saves on blur into the module-level notes
          stash; survives tab + conv switches within the session. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>My notes</div>
        <textarea
          key={conv.id}
          defaultValue={readConvNote(conv.id)}
          placeholder="Things to bring, contacts, reminders…"
          onBlur={(e) => { writeConvNote(conv.id, e.currentTarget.value); toast("Note saved"); }}
          style={{
            width: "100%", minHeight: 64, resize: "vertical",
            padding: 10, borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      {/* Suppress the unused-isCoordinator lint warning — kept in the
          prop list so future tweaks (e.g. coord-only billing summary)
          have it without re-threading from the parent. */}
      {void isCoordinator}
    </div>
  );
}

// ── ClientProjectViewTab ──
// Client-flavored mirror of TalentBookingTab. Same 2-column card grid
// pattern (so the look/feel reads identically across roles) but the
// content shifts to what a client cares about:
//   • Project status hero — what's happening NOW + the next decision
//     they own (Approve / Sign / Pay / Add note)
//   • The project — title, brief, source where the inquiry came in
//   • When + Where 2-up
//   • Your talent (commissioned lineup) + Your contact (coordinator)
//   • Files + your notes
//
// No "submit rate" flow (talent-only) and no commercial breakdown
// (handled by the dedicated Offer tab when they're approving / paying).
function ClientProjectViewTab({
  conv, inquiry,
}: {
  conv: Conversation;
  inquiry: InquiryRecord;
}) {
  const { toast } = useProto();
  const pinned = conv.pinned ?? {};
  const days = countdownLabel(inquiry.schedule.start);
  const coord = inquiry.coordinators[0];
  const lineup = inquiry.talent;
  const teammates = lineup.length > 0;
  const showCoord = !!coord;
  const action = CLIENT_NEXT_ACTION_FOR_CONV[conv.id];
  // Subscribe to offer-stash + notes so this view re-renders when
  // the client approves something or edits their notes.
  useOfferStashSubscription();
  useNotesSubscription();
  const offer = getOffer(conv.id);
  // Action sheet state — opens when the client clicks the Do it now
  // hero CTA. Kind is inferred from the action label (Approve / Sign
  // / Pay / Verify card) so each hero has the right confirmation flow.
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  // Lineup drawer — opens from the "Add talent" footer button or from
  // the per-row swap button. Same drawer the coordinator uses, but
  // with the client's pov so picker tabs read "Favorites / Recent /
  // All Tulala" and edits are framed as "request changes".
  const [lineupOpen, setLineupOpen] = useState(false);
  // Change-coordinator sheet — opens from the "Manage" overflow on
  // the Your-contact card. Lets the client request a re-assign, ask
  // for a backup coordinator, or send a private note to the agency.
  const [coordSheetOpen, setCoordSheetOpen] = useState(false);
  const actionKind: ClientActionKind | null = (() => {
    if (!action?.primary) return null;
    const l = action.label.toLowerCase();
    if (l.includes("approve")) return "approve";
    if (l.includes("sign")) return "sign";
    if (l.includes("pay")) return "pay";
    if (l.includes("verify")) return "verify-card";
    return "approve";
  })();

  // Same compact card surface as the talent's TalentBookingTab so
  // the patterns look identical across roles.
  const cardStyle: CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    boxSizing: "border-box",
  };
  const sectionTitle: CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    color: COLORS.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  };

  return (
    <div data-tulala-booking-tab style={{
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontFamily: FONTS.body,
    }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-booking-tab]{padding:10px!important;gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-grid]{gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-card]{padding:9px 10px!important}"
        + "[data-tulala-booking-tab] [data-booking-section-title]{font-size:9.5px!important;margin-bottom:5px!important}"
        + "}"
        // Below 480px the side-by-side cards squash to <160px wide and
        // the LocationMapTile + talent rows truncate aggressively. Stack
        // every booking-grid row to a single column so each card gets
        // the full width. !important is needed because the inline
        // gridTemplateColumns (e.g. "1.4fr 1fr") on the JSX would
        // otherwise win.
        + "@media (max-width: 480px){"
        + "[data-tulala-booking-tab] [data-booking-grid]{grid-template-columns:1fr!important}"
        + "}"
      }} />

      {/* Action hero — when the client owes a decision, this banner
          carries it front-and-center so they can act without hunting
          for the right tab. Replaces the talent's "On set in N days"
          countdown (which doesn't apply for client). When no action,
          falls back to the countdown for booked projects. */}
      {action?.primary ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: `linear-gradient(135deg, ${COLORS.coral}14 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid ${COLORS.coral}40`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: `${COLORS.coral}28`,
            color: COLORS.coral, flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4.5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.coral }}>
              Needs your decision
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginTop: 2 }}>
              {action.label}
            </div>
          </div>
          <button type="button" onClick={() => setActionSheetOpen(true)} style={{
            flexShrink: 0,
            padding: "8px 14px", borderRadius: 999,
            background: COLORS.coral, color: "#fff",
            border: "none", cursor: "pointer",
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 700,
          }}>
            Do it now
          </button>
        </div>
      ) : days ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: days.urgent
            ? `linear-gradient(135deg, ${COLORS.amber}18 0%, ${COLORS.amber}08 100%)`
            : `linear-gradient(135deg, ${COLORS.successSoft} 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid ${days.urgent ? `${COLORS.amber}40` : `${COLORS.success}30`}`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: days.urgent ? `${COLORS.amber}28` : `${COLORS.success}20`,
            color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success),
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2.5 6.5h11M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success) }}>
              {days.headline}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {days.subhead}
            </div>
          </div>
        </div>
      ) : null}

      {/* The project — title + brief + source. Client wants context:
          what they commissioned, who's doing it, what stage it's at. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>The project</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.35 }}>
          {inquiry.title}
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>
          With {conv.agency} · {conv.leader.name} coordinating
        </div>
        {(() => {
          const sourceMeta = conv.source ? sourceChipMeta(conv.source) : null;
          if (!sourceMeta) return null;
          return (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                textTransform: "uppercase", color: COLORS.inkDim,
              }}>You sent this via</span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 999,
                background: sourceMeta.bg, color: sourceMeta.fg,
                fontSize: 11, fontWeight: 700,
              }}>
                <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
                {sourceMeta.label}
              </span>
            </div>
          );
        })()}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, color: COLORS.ink, marginTop: 8, lineHeight: 1.55 }}>
            {inquiry.brief.summary}
          </div>
        )}
        {/* Coordinator's note for the client — same atom as talent's
            "Sara's read" + admin's "Sara's read", framed for the
            client as a personal note from the coord rather than an
            internal-team read. Pulls from the same conv.pinned.
            coordinatorNote source so a coord writes once and both
            audiences see it (with appropriate framing). */}
        {conv.pinned?.coordinatorNote && coord && (
          <div style={{
            marginTop: 10,
            display: "flex", gap: 9,
            padding: "10px 12px",
            background: COLORS.indigoSoft,
            border: `1px solid rgba(91,107,160,0.18)`,
            borderRadius: 10,
          }}>
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1, color: COLORS.indigoDeep }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 3h3v3H4l-1 2v-2H3V3zm5 0h3v3H9l-1 2v-2H8V3z" fill="currentColor"/>
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", color: COLORS.indigoDeep,
                marginBottom: 2,
              }}>
                {coord.name.split(" ")[0]}'s note for you
              </div>
              <div style={{
                fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5,
                fontStyle: "italic",
              }}>
                "{conv.pinned.coordinatorNote}"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* When + Where — same 2-up layout the talent gets so the
          patterns mirror across roles. */}
      <div data-booking-grid style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>When</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
            {inquiry.schedule.start}
            {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
          </div>
          {pinned.callTime && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
              Call · <span style={{ color: COLORS.ink, fontWeight: 600 }}>{pinned.callTime}</span>
            </div>
          )}
        </div>
        <div data-booking-card style={{ ...cardStyle, padding: 0 }}>
          <div data-booking-section-title style={{ ...sectionTitle, padding: "12px 14px 0" }}>Where</div>
          {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) ? (
            <div style={{ padding: "8px 14px 12px" }}>
              <LocationMapTile
                venue={inquiry.location.venue}
                address={inquiry.location.address}
                city={inquiry.location.city}
                onOpenMaps={() => toast("Open map")}
              />
            </div>
          ) : (
            <div style={{ padding: "0 14px 12px", fontSize: 12, color: COLORS.inkMuted }}>
              Location TBC.
            </div>
          )}
        </div>
      </div>

      {/* Your talent + Your contact — 2-up. Lineup uses the
          ClientTalentCard component (which has add-talent + swap
          affordances baked in). Coordinator card shows who's running
          this with a Message CTA. */}
      {(teammates || showCoord) && (
        <div data-booking-grid style={{
          display: "grid",
          gridTemplateColumns: teammates && showCoord ? "1.4fr 1fr" : "1fr",
          gap: 10,
        }}>
          {teammates && (
            <div data-booking-card style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>Your talent</div>
              {lineup
                .filter(t => {
                  const s = (t.state ?? "").toLowerCase();
                  if (inquiry.status === "submitted" || inquiry.status === "coordinating") {
                    return s === "accepted" || s === "confirmed" || s === "booked";
                  }
                  return s !== "declined" && s !== "rejected" && s !== "withdrew";
                })
                .map(t => (
                  <ClientTalentCard
                    key={t.talentId} talent={t}
                    stagePast={inquiry.status === "wrapped"}
                    canEdit={inquiry.status !== "wrapped" && inquiry.status !== "cancelled"}
                    onSwap={() => setLineupOpen(true)}
                  />
                ))}
              {/* Add-talent footer — only when this lineup is still
                  editable (not past / cancelled). Opens the same drawer
                  the coordinator uses, with the client's "Favorites /
                  Recent / All Tulala" tab labels via the picker pov. */}
              {inquiry.status !== "wrapped" && inquiry.status !== "cancelled" && (
                <button type="button" onClick={() => setLineupOpen(true)} style={{
                  marginTop: 4, width: "100%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px dashed ${COLORS.border}`,
                  background: "transparent", color: COLORS.ink,
                  cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                  Add talent
                </button>
              )}
            </div>
          )}
          {showCoord && (
            <div data-booking-card data-booking-coord style={cardStyle}>
              <div data-booking-section-title style={sectionTitle}>Your contact</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <Avatar size={36} tone="auto" hashSeed={coord.name} initials={coord.initials} />
                  <PresenceDot name={coord.name} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: COLORS.ink,
                    display: "flex", alignItems: "center", gap: 6,
                    minWidth: 0,
                  }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {coord.name}
                    </span>
                    <CoordRoleBadge role={(coord as { role?: string }).role} />
                  </div>
                  <div style={{
                    fontSize: 11, color: COLORS.inkMuted,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {(coord as { role?: string }).role === "owner"
                      ? `Workspace owner · ${conv.agency}`
                      : `Coordinator · ${conv.agency}`}
                  </div>
                </div>
                {/* "Manage" overflow — opens the change-coordinator
                    sheet (request reassign / add backup / private
                    note). Uses the same kebab pattern the rest of the
                    app uses for secondary row actions. */}
                {inquiry.status !== "wrapped" && inquiry.status !== "cancelled" && (
                  <button type="button"
                    onClick={() => setCoordSheetOpen(true)}
                    aria-label="Manage coordinator"
                    style={{
                      flexShrink: 0,
                      width: 28, height: 28, borderRadius: 8,
                      border: `1px solid ${COLORS.borderSoft}`,
                      background: "transparent", color: COLORS.inkMuted,
                      cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <circle cx="3" cy="7" r="1" fill="currentColor"/>
                      <circle cx="7" cy="7" r="1" fill="currentColor"/>
                      <circle cx="11" cy="7" r="1" fill="currentColor"/>
                    </svg>
                  </button>
                )}
              </div>
              <button type="button" onClick={() => toast(`Messaging ${coord.name}…`)} style={{
                marginTop: 10, width: "100%",
                padding: "7px 10px", borderRadius: 8,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 3.5h10v6H6L3 12v-2.5H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
                Message
              </button>
            </div>
          )}
        </div>
      )}

      {/* Files preview — top 3 client-thread files so the client can
          spot a callsheet / contract / selects link without leaving the
          Project tab. "View all" jumps to the dedicated Files tab. */}
      {(() => {
        const clientFiles = (MOCK_FILES_FOR_CONV[conv.id] ?? []).filter(f => f.thread === "client");
        if (clientFiles.length === 0) return null;
        const preview = clientFiles.slice(0, 3);
        return (
          <div data-booking-card style={cardStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <div data-booking-section-title style={{ ...sectionTitle, marginBottom: 0 }}>Files</div>
              <span style={{ fontSize: 10.5, color: COLORS.inkMuted }}>
                {clientFiles.length} file{clientFiles.length === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {preview.map((f) => (
                <button key={f.name} type="button"
                  onClick={() => toast(`Opening ${f.name}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 9px", borderRadius: 8,
                    background: COLORS.surfaceAlt,
                    border: `1px solid ${COLORS.borderSoft}`,
                    cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
                  }}>
                  <span aria-hidden style={{
                    flexShrink: 0,
                    width: 24, height: 24, borderRadius: 6,
                    background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: COLORS.inkMuted,
                  }}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M3 1h4l2 2v8H3V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      <path d="M7 1v2h2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: COLORS.ink,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{f.name}</div>
                    <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>
                      {f.size} · added by {f.addedBy} · {f.addedAt}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {clientFiles.length > preview.length && (
              <button type="button"
                onClick={() => toast("Open Files tab")}
                style={{
                  marginTop: 8, width: "100%",
                  padding: "6px 10px", borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`, background: "transparent",
                  color: COLORS.ink, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}>
                View all {clientFiles.length} files
              </button>
            )}
          </div>
        );
      })()}

      {/* Your notes — reminders for the brand contact ("ask about
          shoot prep call", "remind to share selects by Fri"). Keyed
          by conv.id so each project has its own note. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>Your notes</div>
        <textarea
          key={conv.id}
          defaultValue={readConvNote(conv.id)}
          placeholder="Reminders, follow-ups, things to ask the coordinator…"
          onBlur={(e) => { writeConvNote(conv.id, e.currentTarget.value); toast("Note saved"); }}
          style={{
            width: "100%", minHeight: 64, resize: "vertical",
            padding: 10, borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      {/* Action sheet — opens from the Do-it-now CTA. Confirms the
          action, advances the offer stage in the module store, and
          appends a timeline event so all 3 povs see the change. */}
      {actionKind && (
        <ClientActionSheet
          open={actionSheetOpen}
          onClose={() => setActionSheetOpen(false)}
          conv={conv}
          kind={actionKind}
          offer={offer}
        />
      )}
      {/* Lineup drawer — same component the coordinator sees, but with
          the client's pov so picker tabs read "Favorites / Recent /
          All Tulala". Add / swap / remove all flow through here. */}
      <LineupDrawer
        open={lineupOpen}
        onClose={() => setLineupOpen(false)}
        conv={conv}
        inquiry={inquiry}
        canEdit={inquiry.status !== "wrapped" && inquiry.status !== "cancelled"}
        povCanSeeOffers={true}
        povCanSeeCoordNote={false}
        pickerPov="client"
      />
      {/* Change-coordinator sheet — three soft options that don't put
          the agency relationship at risk: request a re-assign (escalates
          to agency owner), add a backup (parallel coordinator for
          coverage), or send a private note. */}
      <ChangeCoordinatorSheet
        open={coordSheetOpen}
        onClose={() => setCoordSheetOpen(false)}
        coordName={coord?.name ?? ""}
        agency={conv.agency}
      />
    </div>
  );
}

// ── ChangeCoordinatorSheet — small modal that lives off the Your-contact
// kebab on the client's project view. Three soft actions that respect
// the agency relationship (no "fire your coordinator" surface — that
// happens off-platform). All three resolve to a toast in the prototype;
// production would write a request to the agency-ops queue. ──
function ChangeCoordinatorSheet({
  open, onClose, coordName, agency,
}: {
  open: boolean;
  onClose: () => void;
  coordName: string;
  agency: string;
}) {
  const { toast } = useProto();
  if (!open) return null;
  const options: { id: string; label: string; sub: string; tone: "neutral" | "warning"; onPick: () => void }[] = [
    {
      id: "reassign",
      label: "Request a different coordinator",
      sub: `Sends a private note to ${agency}'s ops team. ${coordName} won't be notified directly.`,
      tone: "warning",
      onPick: () => { toast("Reassign request sent to agency ops"); onClose(); },
    },
    {
      id: "backup",
      label: "Add a backup coordinator",
      sub: "Asks for a second coordinator on the project for coverage during holidays / handoffs.",
      tone: "neutral",
      onPick: () => { toast("Backup-coordinator request sent"); onClose(); },
    },
    {
      id: "note",
      label: "Send a private note to the agency",
      sub: "Goes to the agency owner — not your coordinator. Use for sensitive feedback.",
      tone: "neutral",
      onPick: () => { toast("Private note opened"); onClose(); },
    },
  ];
  return (
    <div role="dialog" aria-modal="true" aria-label="Change coordinator" style={{
      position: "fixed", inset: 0, zIndex: 9999, fontFamily: FONTS.body,
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(11,11,13,0.45)",
      }} />
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-coord-sheet]{"
        + "left:0!important;right:0!important;top:auto!important;bottom:0!important;"
        + "transform:none!important;width:auto!important;max-width:none!important;"
        + "border-radius:16px 16px 0 0!important;"
        + "}}"
      }} />
      <aside data-tulala-coord-sheet style={{
        position: "absolute",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 420, maxWidth: "calc(100vw - 32px)",
        background: "#fff", borderRadius: 14,
        boxShadow: "0 32px 80px -16px rgba(11,11,13,0.40), 0 8px 24px rgba(11,11,13,0.10)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 700,
              color: COLORS.ink, letterSpacing: -0.2,
            }}>Change coordinator</h2>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 3 }}>
              {coordName} is your point of contact at {agency}.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map(o => (
            <button key={o.id} type="button" onClick={o.onPick} style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
              padding: "11px 14px", borderRadius: 10,
              background: "#fff", color: COLORS.ink,
              border: `1px solid ${o.tone === "warning" ? `${COLORS.coral}40` : COLORS.borderSoft}`,
              cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: o.tone === "warning" ? COLORS.coralDeep : COLORS.ink }}>
                {o.label}
              </span>
              <span style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
                {o.sub}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ── ReassignCoordinatorSheet — admin/coord-side flow for actually
// moving a project to a different coordinator. Different shape from the
// client-side ChangeCoordinatorSheet:
//   • Lists workspace coordinators with current load + availability
//   • Requires a handoff note (so the new coord knows context)
//   • Optionally notifies the outgoing coord
//   • Posts a system event to the timeline so all parties see it
// ──
function ReassignCoordinatorSheet({
  open, onClose, currentCoordName, onReassign,
}: {
  open: boolean;
  onClose: () => void;
  currentCoordName: string;
  onReassign: (newCoordName: string, handoffNote: string, notifyOutgoing: boolean) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notifyOutgoing, setNotifyOutgoing] = useState(true);
  // Mock workspace coordinators with load + availability. Production
  // reads from workspace.members where role includes "coordinator".
  const coords = [
    { name: "Marta Reyes",  initials: "MR", load: 8,  available: true,  meta: "8 active · senior coordinator" },
    { name: "Theo Marsh",   initials: "TM", load: 5,  available: true,  meta: "5 active · accepts handoffs" },
    { name: "Cleo Vega",    initials: "CV", load: 12, available: false, meta: "12 active · OOO until May 9" },
    { name: "Sara Mendez",  initials: "SM", load: 3,  available: true,  meta: "3 active · light load" },
  ].filter(c => c.name !== currentCoordName);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Reassign coordinator" style={{
      position: "fixed", inset: 0, zIndex: 9999, fontFamily: FONTS.body,
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(11,11,13,0.45)",
      }} />
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-reassign-sheet]{"
        + "left:0!important;right:0!important;top:auto!important;bottom:0!important;"
        + "transform:none!important;width:auto!important;max-width:none!important;"
        + "max-height:90vh!important;border-radius:16px 16px 0 0!important;"
        + "}}"
      }} />
      <aside data-tulala-reassign-sheet style={{
        position: "absolute",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 460, maxWidth: "calc(100vw - 32px)", maxHeight: "85vh",
        background: "#fff", borderRadius: 14,
        boxShadow: "0 32px 80px -16px rgba(11,11,13,0.40), 0 8px 24px rgba(11,11,13,0.10)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 700,
              color: COLORS.ink, letterSpacing: -0.2,
            }}>Reassign coordinator</h2>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 3 }}>
              Move this project from {currentCoordName} to a teammate.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Pick the new coordinator
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {coords.map(c => (
                <button key={c.name}
                  type="button"
                  onClick={() => c.available && setPicked(c.name)}
                  disabled={!c.available}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 10,
                    background: picked === c.name ? COLORS.surfaceAlt : "#fff",
                    border: `1px solid ${picked === c.name ? COLORS.accent : COLORS.borderSoft}`,
                    cursor: c.available ? "pointer" : "not-allowed",
                    opacity: c.available ? 1 : 0.55,
                    textAlign: "left", fontFamily: FONTS.body,
                  }}>
                  <Avatar size={32} tone="auto" hashSeed={c.name} initials={c.initials} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{c.meta}</div>
                  </div>
                  {picked === c.name && (
                    <span aria-hidden style={{
                      flexShrink: 0,
                      width: 18, height: 18, borderRadius: "50%",
                      background: COLORS.accent, color: "#fff",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                    }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>
              Handoff note (required)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              placeholder="Where is this project? What does the new coordinator need to know?"
              style={{
                width: "100%", minHeight: 64, resize: "vertical",
                padding: 10, borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: COLORS.surfaceAlt,
                fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.ink, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={notifyOutgoing}
              onChange={(e) => setNotifyOutgoing(e.currentTarget.checked)}
              style={{ width: 14, height: 14, cursor: "pointer" }}
            />
            Notify {currentCoordName} (sends a system message in the team thread)
          </label>
        </div>
        <div style={{
          padding: 12, borderTop: `1px solid ${COLORS.borderSoft}`,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "transparent",
            color: COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            fontFamily: FONTS.body,
          }}>Cancel</button>
          <button type="button"
            disabled={!picked || !note.trim()}
            onClick={() => { if (picked && note.trim()) { onReassign(picked, note.trim(), notifyOutgoing); onClose(); } }}
            style={{
              padding: "8px 16px", borderRadius: 999,
              border: "none",
              background: (picked && note.trim()) ? COLORS.fill : "rgba(11,11,13,0.12)",
              color: "#fff",
              fontSize: 12.5, fontWeight: 700,
              cursor: (picked && note.trim()) ? "pointer" : "not-allowed",
              fontFamily: FONTS.body,
            }}>
            Reassign
          </button>
        </div>
      </aside>
    </div>
  );
}

// Build a stub Conversation from an InquiryRecord — used by admin-side
// surfaces (DetailsPanel) that need to pass a conv to LineupDrawer.
// Falls back to MOCK_CONVERSATIONS when an id matches; otherwise builds
// a minimal shape that satisfies LineupDrawer's read sites.
function buildConvFromInquiry(inquiry: InquiryRecord): Conversation {
  const real = MOCK_CONVERSATIONS.find(c => c.id === inquiry.id);
  if (real) return real;
  const coord = inquiry.coordinators[0];
  return {
    id: inquiry.id,
    client: inquiry.client.name ?? "Client",
    clientInitials: initialsOf(inquiry.client.name ?? "Client"),
    clientTrust: "verified",
    agency: coord ? "Your workspace" : "—",
    brief: inquiry.title,
    location: inquiry.location.city ?? null,
    date: inquiry.schedule.start,
    stage: inquiry.status === "wrapped" ? "past"
      : inquiry.status === "cancelled" ? "cancelled"
      : inquiry.status === "booked" ? "booked"
      : inquiry.status === "submitted" || inquiry.status === "coordinating" ? "inquiry"
      : "hold",
    leader: coord
      ? { id: coord.id, name: coord.name, initials: coord.initials }
      : { id: "u-stub", name: "Unassigned", initials: "—" },
    iAmCoordinator: false,
    lastMessage: { sender: "system", preview: "", ageHrs: 0 },
    seen: true,
    unreadCount: 0,
    pinned: {},
    participants: [],
    source: undefined,
    outcome: undefined,
  } as unknown as Conversation;
}

// ── AdminParticipantsActions — wires the Add-talent and Reassign-
// coordinator buttons that live on the admin Participants card. Owns
// both sheets locally so the parent block stays presentational. ──
function AdminParticipantsActions({ inquiry, planTier = "agency" }: {
  inquiry: InquiryRecord;
  /** Workspace plan tier — gates the Reassign Coordinator button.
   *  A Free workspace has no team to reassign to, so the button hides
   *  there. Studio / Agency / Hub-Network all surface it. */
  planTier?: "free" | "studio" | "agency" | "hub-network";
}) {
  const { toast, state } = useProto();
  const [lineupOpen, setLineupOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const conv = buildConvFromInquiry(inquiry);
  const currentCoord = inquiry.coordinators[0];
  const canEdit = inquiry.status !== "wrapped" && inquiry.status !== "cancelled";
  // Phase 3 of System User direction — permission ladder:
  //   • Add talent: requires coordinator+ (anyone managing projects can
  //     add talent to a project they're on)
  //   • Reassign coordinator: requires admin+ (moves project ownership
  //     between team members — privileged operation)
  //   • Free workspaces have no team to reassign to, so reassign hides
  //     regardless of role.
  const canAddTalent = meetsRole(state.role, "coordinator");
  const canReassign = meetsRole(state.role, "admin")
    && planTier !== "free"
    && !!currentCoord;
  if (!canEdit) return null;
  if (!canAddTalent && !canReassign) return null;
  return (
    <>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {canAddTalent && (
          <button type="button" onClick={() => setLineupOpen(true)} style={{
            padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
            borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: FONTS.body,
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Add talent
          </button>
        )}
        {canReassign && (
          <button type="button" onClick={() => setReassignOpen(true)} style={{
            padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
            borderRadius: 999, border: `1px solid ${COLORS.border}`,
            background: "transparent", color: COLORS.ink, cursor: "pointer",
            fontFamily: FONTS.body,
          }}>Reassign coordinator</button>
        )}
        {/* Free-tier upgrade nudge — Reassign hides on Free, but
            instead of leaving silence, surface a soft upsell so the
            user knows the affordance exists at higher tiers. Same
            amber palette as the create-workspace Free-cap explainer
            for visual consistency. */}
        {planTier === "free" && currentCoord && meetsRole(state.role, "admin") && (
          <button type="button"
            onClick={() => toast("Studio plan unlocks team coordinators · See plans")}
            style={{
              padding: "6px 12px", fontSize: 11.5, fontWeight: 600,
              borderRadius: 999, border: `1px dashed rgba(214,158,46,0.5)`,
              background: "rgba(214,158,46,0.08)", color: "#7C5A14",
              cursor: "pointer", fontFamily: FONTS.body,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            Reassign · Studio plan
          </button>
        )}
      </div>
      <LineupDrawer
        open={lineupOpen}
        onClose={() => setLineupOpen(false)}
        conv={conv}
        inquiry={inquiry}
        canEdit={true}
        povCanSeeOffers={true}
        povCanSeeCoordNote={true}
        pickerPov="admin"
        planTier={planTier}
      />
      {canReassign && currentCoord && (
        <ReassignCoordinatorSheet
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
          currentCoordName={currentCoord.name}
          onReassign={(newCoord, handoff, notify) => {
            toast(`Reassigned to ${newCoord}${notify ? ` · ${currentCoord.name} notified` : ""}`);
            // Append a system event so the change is visible in the
            // timeline of all 3 povs (admin / client / talent).
            applyOfferOverride(inquiry.id, {
              appendedTimeline: [{
                id: `reassign-${Date.now()}`,
                ts: "now",
                actor: currentCoord.name,
                body: `Reassigned this project to ${newCoord}. Handoff note: "${handoff.slice(0, 80)}${handoff.length > 80 ? "…" : ""}"`,
                tone: "info",
              }],
            });
            // Push to the handoff queue so the receiving coord sees an
            // "Incoming handoff" badge on this row in their inbox + can
            // filter to just incoming-handoff rows.
            recordHandoff({
              inquiryId: inquiry.id,
              fromCoordName: currentCoord.name,
              toCoordName: newCoord,
              note: handoff,
            });
          }}
        />
      )}
    </>
  );
}

// ── AdminBookingTab — workspace-flavored mirror of TalentBookingTab +
// ClientProjectViewTab. Same card-grid silhouette so the workspace
// detail view reads with one design language across roles, but the
// content shifts to admin's operational voice:
//   • Action hero — what does this coordinator owe RIGHT NOW
//     (Send to client / Build call sheet / Nudge talent)?
//   • Project card — brief + client trust badge + source provenance
//   • When + Where 2-up
//   • Lineup card — full participant list + Add talent + Reassign
//     coordinator (uses AdminParticipantsActions)
//   • Files preview — top 3 files across both threads
//   • Internal notes — coordinator-only memory pad
//
// Plan-tier hooks (planTier prop) gate workspace-only affordances:
//   - Free: hide Reassign coordinator (no team to reassign to)
//   - Studio / Agency / Hub-Network: full surface
function AdminBookingTab({
  inquiry, planTier = "agency",
}: {
  inquiry: InquiryRecord;
  /** Workspace plan tier — drives which admin-only affordances render.
   *  Defaults to "agency" so any unset caller gets the full surface. */
  planTier?: "free" | "studio" | "agency" | "hub-network";
}) {
  const { toast } = useProto();
  useOfferStashSubscription();
  useNotesSubscription();
  const conv = useMemo(() => buildConvFromInquiry(inquiry), [inquiry]);
  const offer = getOffer(conv.id);
  const days = countdownLabel(inquiry.schedule.start);
  const coord = inquiry.coordinators[0];
  const lineup = inquiry.talent;
  const lineupTotal = lineup.length;
  const lineupAccepted = lineup.filter(t => {
    const s = (t.state ?? "").toLowerCase();
    return s === "accepted" || s === "confirmed" || s === "booked";
  }).length;
  const lineupPending = lineup.filter(t => {
    const s = (t.state ?? "").toLowerCase();
    return s === "pending" || s === "invited";
  }).length;
  const canEdit = inquiry.status !== "wrapped" && inquiry.status !== "cancelled";
  // Resolve the source meta. InquiryRecord.source uses the simplified
  // schema (`hub` / `agency_referral` / `client_form` / `workspace_manual`);
  // map each to the conv-side sourceChipMeta input.
  const sourceMeta = (() => {
    const src = inquiry.source;
    if (!src) return null;
    if (src.kind === "hub")              return sourceChipMeta({ kind: "tulala-hub", label: src.label });
    if (src.kind === "agency_referral")  return sourceChipMeta({ kind: "agency-referral" });
    if (src.kind === "client_form")      return sourceChipMeta({ kind: "direct", label: src.label });
    if (src.kind === "workspace_manual") return sourceChipMeta({ kind: "email", from: src.label });
    return null;
  })();

  // Admin's "what do I do next" — drives the action hero. Single
  // primary CTA + one-line rationale, same shape the talent + client
  // hero use, but the labels speak admin's operational language.
  const adminAction: { label: string; sub: string; tone: "primary" | "amber" | "success" } | null = (() => {
    if (!canEdit) return null;
    const ofStage = offer?.stage;
    if (inquiry.status === "submitted" && lineupTotal === 0) {
      return { label: "Add talent", sub: "Build the shortlist before replying.", tone: "primary" };
    }
    if (inquiry.status === "submitted" || inquiry.status === "coordinating") {
      if (lineupAccepted < lineupTotal) {
        return { label: "Nudge talent", sub: `${lineupTotal - lineupAccepted} talent haven't responded yet.`, tone: "amber" };
      }
      if (ofStage === "no_offer" || ofStage === "client_budget" || !ofStage) {
        return { label: "Build the offer", sub: "Lineup confirmed — draft pricing.", tone: "primary" };
      }
      return { label: "Send to client", sub: "Offer is ready. Push it to the client.", tone: "primary" };
    }
    if (ofStage === "sent" || ofStage === "reviewing") {
      return { label: "Nudge client", sub: "Offer is with client — ping if it's been quiet.", tone: "amber" };
    }
    if (ofStage === "countered") {
      return { label: "Review counter", sub: "Client came back with a counter-offer.", tone: "primary" };
    }
    if (inquiry.status === "approved" || inquiry.status === "booked") {
      return { label: "Build call sheet", sub: "Booked. Lock the production details.", tone: "success" };
    }
    return null;
  })();

  const cardStyle: CSSProperties = {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
    minWidth: 0, maxWidth: "100%", overflow: "hidden", boxSizing: "border-box",
  };
  const sectionTitle: CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  };
  const heroPalette = adminAction?.tone === "amber"
    ? { bg: `linear-gradient(135deg, ${COLORS.amber}18 0%, ${COLORS.amber}08 100%)`, border: `${COLORS.amber}40`, fg: COLORS.amber, icBg: `${COLORS.amber}28` }
    : adminAction?.tone === "success"
    ? { bg: `linear-gradient(135deg, ${COLORS.successSoft} 0%, ${COLORS.surfaceAlt} 100%)`, border: `${COLORS.success}30`, fg: COLORS.successDeep ?? COLORS.success, icBg: `${COLORS.success}20` }
    : { bg: `linear-gradient(135deg, ${COLORS.coral}14 0%, ${COLORS.surfaceAlt} 100%)`, border: `${COLORS.coral}40`, fg: COLORS.coral, icBg: `${COLORS.coral}28` };

  const allFiles = MOCK_FILES_FOR_CONV[conv.id] ?? [];
  const filePreview = allFiles.slice(0, 3);

  return (
    <div data-tulala-booking-tab style={{
      padding: 14,
      display: "flex", flexDirection: "column", gap: 10,
      fontFamily: FONTS.body,
    }}>
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-booking-tab]{padding:10px!important;gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-grid]{gap:7px!important}"
        + "[data-tulala-booking-tab] [data-booking-card]{padding:9px 10px!important}"
        + "[data-tulala-booking-tab] [data-booking-section-title]{font-size:9.5px!important;margin-bottom:5px!important}"
        + "}"
        + "@media (max-width: 480px){"
        + "[data-tulala-booking-tab] [data-booking-grid]{grid-template-columns:1fr!important}"
        + "}"
      }} />

      {/* Action hero — admin-voice equivalent of the client's "Needs your
          decision" + talent's countdown banner. When no action is owed
          and a shoot is within 14 days, fall back to the same countdown
          banner the talent sees so booked workspaces get the same cue. */}
      {adminAction ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: heroPalette.bg,
          border: `1px solid ${heroPalette.border}`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: heroPalette.icBg, color: heroPalette.fg, flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4.5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: heroPalette.fg }}>
              Your move
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginTop: 2 }}>
              {adminAction.label}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {adminAction.sub}
            </div>
          </div>
          <button type="button" onClick={() => toast(adminAction.label)} style={{
            flexShrink: 0,
            padding: "8px 14px", borderRadius: 999,
            background: heroPalette.fg, color: "#fff",
            border: "none", cursor: "pointer",
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 700,
          }}>
            Do it
          </button>
        </div>
      ) : days ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: days.urgent
            ? `linear-gradient(135deg, ${COLORS.amber}18 0%, ${COLORS.amber}08 100%)`
            : `linear-gradient(135deg, ${COLORS.successSoft} 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid ${days.urgent ? `${COLORS.amber}40` : `${COLORS.success}30`}`,
          borderRadius: 12,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: days.urgent ? `${COLORS.amber}28` : `${COLORS.success}20`,
            color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success),
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2.5 6.5h11M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success) }}>
              {days.headline}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {days.subhead}
            </div>
          </div>
        </div>
      ) : null}

      {/* The project — title, brief summary, source, coord-team read.
          Same atom set as TalentBookingTab's "The job" card so the
          two surfaces read consistently across roles — what differs
          is voice ("The project" for admin/client vs "The job" for
          talent), not structure. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>The project</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.35 }}>
          {inquiry.title}
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>
          {inquiry.client.name ? `For ${inquiry.client.name}` : ""}
          {coord && ` · ${coord.name} coordinating`}
        </div>
        {sourceMeta && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
              textTransform: "uppercase", color: COLORS.inkDim,
            }}>Came in via</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 999,
              background: sourceMeta.bg, color: sourceMeta.fg,
              fontSize: 11, fontWeight: 700,
            }}>
              <span aria-hidden style={{ display: "inline-flex" }}>{sourceMeta.icon}</span>
              {sourceMeta.label}
            </span>
          </div>
        )}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, color: COLORS.ink, marginTop: 8, lineHeight: 1.55 }}>
            {inquiry.brief.summary}
          </div>
        )}
        {inquiry.brief.notes && (
          <div style={{
            fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.55, marginTop: 8,
            padding: "8px 10px", background: COLORS.surfaceAlt,
            borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
          }}>{inquiry.brief.notes}</div>
        )}
        {/* Coord-team read — admin counterpart of talent's "Sara's
            read" block. Same indigo quote silhouette so the two
            surfaces visually rhyme. Pulls from the same conv.pinned.
            coordinatorNote source so a coord's framing is visible to
            their team without writing it twice. */}
        {conv.pinned?.coordinatorNote && coord && (
          <div style={{
            marginTop: 10,
            display: "flex", gap: 9,
            padding: "10px 12px",
            background: COLORS.indigoSoft,
            border: `1px solid rgba(91,107,160,0.18)`,
            borderRadius: 10,
          }}>
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1, color: COLORS.indigoDeep }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M3 3h3v3H4l-1 2v-2H3V3zm5 0h3v3H9l-1 2v-2H8V3z" fill="currentColor"/>
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", color: COLORS.indigoDeep,
                marginBottom: 2,
              }}>
                {coord.name.split(" ")[0]}'s read
              </div>
              <div style={{
                fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5,
                fontStyle: "italic",
              }}>
                "{conv.pinned.coordinatorNote}"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* When + Where 2-up */}
      <div data-booking-grid style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div data-booking-card style={cardStyle}>
          <div data-booking-section-title style={sectionTitle}>When</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
            {inquiry.schedule.start}
            {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
          </div>
          {inquiry.schedule.callTime && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
              Call · <span style={{ color: COLORS.ink, fontWeight: 600 }}>{inquiry.schedule.callTime}</span>
            </div>
          )}
        </div>
        <div data-booking-card style={{ ...cardStyle, padding: 0 }}>
          <div data-booking-section-title style={{ ...sectionTitle, padding: "12px 14px 0" }}>Where</div>
          {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) ? (
            <div style={{ padding: "8px 14px 12px" }}>
              <LocationMapTile
                venue={inquiry.location.venue}
                address={inquiry.location.address}
                city={inquiry.location.city}
                onOpenMaps={() => toast("Open map")}
              />
            </div>
          ) : (
            <div style={{ padding: "0 14px 12px", fontSize: 12, color: COLORS.inkMuted }}>
              Location TBC.
            </div>
          )}
        </div>
      </div>

      {/* Lineup + Coordinator 2-up. Lineup card hosts AdminParticipantsActions
          which already wires Add talent + Reassign coordinator (the latter
          honors plan-tier — Free hides it because there's no team to
          reassign to). */}
      <div data-booking-grid style={{
        display: "grid",
        gridTemplateColumns: coord ? "1.4fr 1fr" : "1fr",
        gap: 10,
      }}>
        <div data-booking-card style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div data-booking-section-title style={{ ...sectionTitle, marginBottom: 0 }}>
              {/* Free-tier copy: "Lineup" is team language and doesn't
                  fit a solo workspace. On Free, the talent IS the
                  workspace, so the section reads as "On this job". */}
              {planTier === "free" ? "On this job" : "Lineup"}
            </div>
            {lineupTotal > 0 && (() => {
              const tone = lineupAccepted === 0 ? "red"
                : lineupAccepted < lineupTotal ? "amber"
                : "green";
              const palette = tone === "red"
                ? { bg: `${COLORS.coral}15`, fg: COLORS.coralDeep }
                : tone === "amber"
                ? { bg: `${COLORS.amber}1c`, fg: COLORS.amber }
                : { bg: COLORS.successSoft, fg: COLORS.successDeep ?? COLORS.success };
              return (
                <span aria-label={`${lineupAccepted} of ${lineupTotal} accepted${lineupPending ? `, ${lineupPending} pending` : ""}`} style={{
                  fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  padding: "1px 7px", borderRadius: 999,
                  background: palette.bg, color: palette.fg,
                }}>{lineupAccepted}/{lineupTotal}</span>
              );
            })()}
          </div>
          {lineup.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, padding: "8px 0" }}>
              No talent on this job yet.
            </div>
          ) : (
            lineup.map(t => (
              <RosterMemberRow
                key={t.talentId} talent={t}
                isMe={false}
                stagePast={inquiry.status === "wrapped" || inquiry.status === "cancelled"}
              />
            ))
          )}
          {canEdit && (
            <div style={{ marginTop: 10 }}>
              <AdminParticipantsActions inquiry={inquiry} planTier={planTier} />
            </div>
          )}
        </div>
        {coord && (
          <div data-booking-card data-booking-coord style={cardStyle}>
            <div data-booking-section-title style={sectionTitle}>Coordinator</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                <Avatar size={36} tone="auto" hashSeed={coord.name} initials={coord.initials} />
                <PresenceDot name={coord.name} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: COLORS.ink,
                  display: "flex", alignItems: "center", gap: 6,
                  minWidth: 0, flexWrap: "wrap",
                }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {coord.name}
                  </span>
                  <CoordRoleBadge role={coord.role} />
                  {/* Admin-only: workload pill so admins see how busy
                      this coord is at a glance. Tone red >=10 active /
                      amber >=6 / green otherwise. */}
                  <CoordWorkloadPill name={coord.name} />
                </div>
                <div style={{
                  fontSize: 11, color: COLORS.inkMuted,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {coord.role === "owner" ? "Workspace owner" : "Coordinator"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Files preview — same surface the client gets, with a "View all"
          jump when there's overflow. */}
      {allFiles.length > 0 && (
        <div data-booking-card style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div data-booking-section-title style={{ ...sectionTitle, marginBottom: 0 }}>Files</div>
            <span style={{ fontSize: 10.5, color: COLORS.inkMuted }}>
              {allFiles.length} file{allFiles.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {filePreview.map(f => (
              <button key={f.name} type="button"
                onClick={() => toast(`Opening ${f.name}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "7px 9px", borderRadius: 8,
                  background: COLORS.surfaceAlt,
                  border: `1px solid ${COLORS.borderSoft}`,
                  cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
                }}>
                <span aria-hidden style={{
                  flexShrink: 0,
                  width: 24, height: 24, borderRadius: 6,
                  background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: COLORS.inkMuted,
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M3 1h4l2 2v8H3V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    <path d="M7 1v2h2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: COLORS.ink,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{f.name}</div>
                  <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>
                    {f.thread === "client" ? "Client thread" : "Talent thread"} · {f.size} · added by {f.addedBy} · {f.addedAt}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {allFiles.length > filePreview.length && (
            <button type="button"
              onClick={() => toast("Open Files tab")}
              style={{
                marginTop: 8, width: "100%",
                padding: "6px 10px", borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`, background: "transparent",
                color: COLORS.ink, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
              }}>
              View all {allFiles.length} files
            </button>
          )}
        </div>
      )}

      {/* Internal notes — coordinator's private memory pad. Distinct from
          the client's "Your notes" because admin notes are workspace-
          internal: nobody outside the coord team sees them. */}
      <div data-booking-card style={cardStyle}>
        <div data-booking-section-title style={sectionTitle}>
          {/* Free-tier copy: "coordinator only" implies a team that
              doesn't exist on solo workspaces. Just "Notes" reads
              correctly when there's no team to scope-gate them from. */}
          {planTier === "free" ? "Notes" : "Internal notes (coordinator only)"}
        </div>
        <textarea
          key={inquiry.id}
          defaultValue={readConvNote(inquiry.id)}
          placeholder="Anything the rest of your coordinator team needs to know about this project…"
          onBlur={(e) => { writeConvNote(inquiry.id, e.currentTarget.value); toast("Note saved"); }}
          style={{
            width: "100%", minHeight: 64, resize: "vertical",
            padding: 10, borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

// ── TalentLogisticsTab — talent-flavored view of the call sheet. The
// generic LogisticsTab below is admin/client editor-shaped. Talent
// don't edit the call sheet, they READ it and add personal notes
// (driver name, hotel reservation, things-to-bring). This tab pulls
// from conv.pinned (the per-talent slot) plus inquiry.schedule. ──
function TalentLogisticsTab({ conv, inquiry }: { conv: Conversation; inquiry: InquiryRecord }) {
  const { toast } = useProto();
  const pinned = conv.pinned ?? {};
  const days = countdownLabel(inquiry.schedule.start);
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Countdown — only when within 14 days, hides for distant or past
          shoots. Visual register matches the in-thread action pin. */}
      {days && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          background: days.urgent ? `${COLORS.amber}14` : COLORS.successSoft,
          border: `1px solid ${days.urgent ? `${COLORS.amber}40` : `${COLORS.success}30`}`,
          borderRadius: 10,
        }}>
          <span aria-hidden style={{ fontSize: 16 }}>{days.urgent ? "⏱" : "📅"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: days.urgent ? COLORS.amber : (COLORS.successDeep ?? COLORS.success) }}>{days.headline}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{days.subhead}</div>
          </div>
        </div>
      )}

      {/* Schedule — call time + wrap time, the questions a working
          talent asks first. */}
      <DetailSection title="Schedule">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
          {inquiry.schedule.start}
          {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
        </div>
        {pinned.schedule && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-line" }}>
            {pinned.schedule}
          </div>
        )}
        {!pinned.schedule && pinned.callTime && (
          <DetailField label="Call time" value={pinned.callTime} />
        )}
      </DetailSection>

      {/* Location — uses the same map tile as Details, redundancy is OK
          here since Logistics is a one-stop "everything I need today". */}
      {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) && (
        <DetailSection title="Where">
          <LocationMapTile
            venue={inquiry.location.venue}
            address={inquiry.location.address}
            city={inquiry.location.city}
            onOpenMaps={() => toast("Open map")}
          />
        </DetailSection>
      )}

      {/* Transport — driver, pickup, parking. Pulled from the
          talent-specific pinned data (set by coordinator). */}
      <DetailSection title="Transport">
        {pinned.transport ? (
          <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5 }}>
            {pinned.transport}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            Coordinator hasn't shared transport details yet.
          </div>
        )}
      </DetailSection>

      {/* Hotel/lodging — if mentioned in pinned data. */}
      {(pinned as { hotel?: string }).hotel && (
        <DetailSection title="Lodging">
          <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5 }}>
            {(pinned as { hotel?: string }).hotel}
          </div>
        </DetailSection>
      )}

      {/* My notes — personal scratchpad. Saves to local state in the
          prototype; production: per-talent-per-job notes. */}
      <DetailSection title="My notes">
        <textarea
          placeholder="Things to bring, contacts, reminders…"
          onBlur={() => toast("Note saved")}
          style={{
            width: "100%", minHeight: 70, resize: "vertical",
            padding: 10, borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
            outline: "none",
          }}
        />
      </DetailSection>
    </div>
  );
}

// Compute a short countdown label from a date string. Best-effort —
// returns null when we can't parse the date or it's >14 days out / past.
function countdownLabel(start: string): { headline: string; subhead: string; urgent: boolean } | null {
  if (!start) return null;
  const parsed = Date.parse(`${start} ${new Date().getFullYear()}`);
  if (isNaN(parsed)) return null;
  const ms = parsed - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days < 0 || days > 14) return null;
  if (days === 0) return { headline: "Today is set day", subhead: "Make sure you've reviewed the call sheet.", urgent: true };
  if (days === 1) return { headline: "On set tomorrow", subhead: "Final check on transport, wardrobe, and call time.", urgent: true };
  if (days <= 3) return { headline: `On set in ${days} days`, subhead: "Confirm any open items with the coordinator.", urgent: true };
  return { headline: `On set in ${days} days`, subhead: "All set — we'll send a final reminder closer to the day.", urgent: false };
}

// ── TalentPaymentTab — talent's own slice of the financial picture.
// Used to be locked behind "Workspace-only". Talent care: did the
// client pay, when do I get paid, what method. We DON'T show the full
// invoice / commercial offer here — just the talent's own line. ──
function TalentPaymentTab({ conv, yourRate }: { conv: Conversation; yourRate: string }) {
  const { toast } = useProto();
  const isPast = conv.stage === "past";
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Headline — your take-home and the status. */}
      <div style={{
        background: isPast ? COLORS.surfaceAlt : COLORS.successSoft,
        border: `1px solid ${isPast ? COLORS.borderSoft : `${COLORS.success}30`}`,
        borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: isPast ? COLORS.inkMuted : (COLORS.successDeep ?? COLORS.success), textTransform: "uppercase" }}>
          {isPast ? "Paid" : "Your take-home"}
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 700, color: COLORS.ink, marginTop: 4, letterSpacing: -0.4 }}>
          {yourRate}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          {isPast ? "Receipt available below." : "Released 14 days after wrap, once the client invoice clears."}
        </div>
      </div>

      {/* Status timeline — what's happened so far. */}
      <DetailSection title="Status">
        <PaymentStep done label="Booking confirmed" detail="Contract signed and locked." />
        <PaymentStep done={isPast} label="Wrap" detail={isPast ? "Shoot wrapped on time." : "Pending — set day."} />
        <PaymentStep done={isPast} label="Client invoice" detail={isPast ? "Paid in full." : "Issued · awaiting client (NET 30)."} />
        <PaymentStep done={isPast} label="Talent payout" detail={isPast ? "Transferred to your bank." : "Released 14 days after wrap."} />
      </DetailSection>

      {/* Payment method — talent picks how they get paid. */}
      <DetailSection title="Pay me to">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10 }}>
          <span aria-hidden style={{
            width: 32, height: 32, borderRadius: 8,
            background: COLORS.surfaceAlt, color: COLORS.inkMuted,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 7h12" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>Bank transfer · ES•••• 4421</div>
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>Default · added Mar 2024</div>
          </div>
          <button type="button" onClick={() => toast("Change payment method")} style={{
            padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
          }}>Change</button>
        </div>
      </DetailSection>

      {isPast && (
        <DetailSection title="Receipt">
          <button type="button" onClick={() => toast("Receipt downloaded")} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v9m0 0L4 7m3 3l3-3M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download receipt (PDF)
          </button>
        </DetailSection>
      )}
    </div>
  );
}

function PaymentStep({ done, label, detail }: { done?: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <span aria-hidden style={{
        flexShrink: 0, marginTop: 3,
        width: 14, height: 14, borderRadius: "50%",
        background: done ? COLORS.success : "rgba(11,11,13,0.10)",
        color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {done && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4.2l1.7 1.6L6.5 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? COLORS.ink : COLORS.inkMuted }}>{label}</div>
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  );
}

export function LogisticsTab({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  const { toast } = useProto();
  const isClient = pov === "client";
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title="Call sheet">
        <DetailField label="Date" value={inquiry.schedule.start} />
        {inquiry.schedule.callTime && <DetailField label="Call time" value={inquiry.schedule.callTime} />}
        {inquiry.schedule.wrapTime && <DetailField label="Wrap" value={inquiry.schedule.wrapTime} />}
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => toast(isClient ? "Opening call sheet…" : "Edit call sheet")} style={primaryBtn(COLORS.accent)}>
            {isClient ? "View call sheet" : "Edit call sheet"}
          </button>
        </div>
      </DetailSection>
      <DetailSection title="Location">
        {inquiry.location.venue && <DetailField label="Venue" value={inquiry.location.venue} />}
        {inquiry.location.address && <DetailField label="Address" value={inquiry.location.address} />}
        {inquiry.location.mapUrl && (
          <button type="button" onClick={() => toast("Open map")} style={ghostBtn()}>Open map</button>
        )}
      </DetailSection>
      <DetailSection title="Transport">
        <div style={{ fontSize: 12, color: COLORS.inkMuted, padding: "6px 0" }}>
          Add transport, parking, or accommodation as needed.
        </div>
        <button type="button" onClick={() => toast("Add transport")} style={ghostBtn()}>+ Add transport</button>
      </DetailSection>
    </div>
  );
}

export function PaymentTab({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  const { toast } = useProto();
  const isClient = pov === "client";
  const total = inquiry.budget?.amount ?? 0;
  const currency = inquiry.budget?.currency ?? "EUR";
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title={isClient ? "Invoice" : "Billing"}>
        <DetailField label="Total" value={total ? new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(total) : "—"} />
        <DetailField label="Status" value={isClient ? "Awaiting payment" : "Issued · awaiting client"} />
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          {isClient ? (
            <button type="button" onClick={() => toast("Pay invoice flow")} style={primaryBtn(COLORS.success)}>
              Pay invoice
            </button>
          ) : (
            <button type="button" onClick={() => toast("Send reminder")} style={ghostBtn()}>Send reminder</button>
          )}
        </div>
      </DetailSection>
      {!isClient && (
        <DetailSection title="Payouts">
          <div style={{ fontSize: 12, color: COLORS.inkMuted, padding: "6px 0" }}>
            Released to talent once invoice clears.
          </div>
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
export type ShellAction = { label: string; tone: "primary" | "success" | "ghost"; onClick: () => void };

export function ShellNextActionBar({
  primary, secondary, hint,
}: {
  primary?: ShellAction;
  secondary?: ShellAction;
  hint?: string;
}) {
  // No-op when nothing is asked of the user — the bar should never feel
  // generic. Returning null keeps the shell quiet.
  if (!primary && !secondary && !hint) return null;
  return (
    <div style={{
      position: "sticky", bottom: 0, zIndex: 6,
      padding: "10px 14px",
      background: "rgba(255,255,255,0.96)", backdropFilter: "blur(6px)",
      borderTop: `1px solid ${COLORS.borderSoft}`,
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: FONTS.body,
    }}>
      {hint && (
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: COLORS.inkMuted }}>
          {hint}
        </span>
      )}
      {!hint && <span style={{ flex: 1 }} />}
      {secondary && (
        <button type="button" onClick={secondary.onClick} style={ghostBtn()}>{secondary.label}</button>
      )}
      {primary && (
        <button type="button" onClick={primary.onClick} style={primaryBtn(primary.tone === "success" ? COLORS.success : COLORS.accent)}>
          {primary.label}
        </button>
      )}
    </div>
  );
}

/** Resolve the single best next action for a given pov + Conversation. */
export function resolveShellAction(
  conv: Conversation, pov: "client" | "talent" | "talent_coord" | "admin",
  toast: (s: string) => void,
): { primary?: ShellAction; secondary?: ShellAction; hint?: string } {
  const offer = MOCK_OFFER_FOR_CONV[conv.id];
  // Booked → role-shaped logistics nudge, not commerce. Stays its own
  // branch because once booked the focus shifts from offer to call sheet.
  if (conv.stage === "booked") {
    if (pov === "client")
      return { hint: "Booking confirmed.", primary: { label: "View call sheet", tone: "primary", onClick: () => toast("Opening call sheet") } };
    if (pov === "talent" || pov === "talent_coord")
      return { hint: "You're booked.", primary: { label: "Open call sheet", tone: "primary", onClick: () => toast("Opening call sheet") } };
    return { hint: "Booked. Build the call sheet.", primary: { label: "Build call sheet", tone: "primary", onClick: () => toast("Call sheet editor") } };
  }

  // Past stage — wrapped + paid; conversation is read-only context.
  if (conv.stage === "past") {
    if (pov === "client") return { hint: "Wrapped. Selects approved.", secondary: { label: "Open archive", tone: "ghost", onClick: () => toast("Opening archive") } };
    if (pov === "talent" || pov === "talent_coord") return { hint: "Wrapped. Receipt available.", secondary: { label: "Download receipt", tone: "ghost", onClick: () => toast("Receipt downloaded") } };
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
    // Map well-known CTAs to the right local mutation so the demo
    // shows the negotiation actually advancing — not just a toast.
    // Talent / client / admin all hit this path; each role's CTA gets
    // its own override write.
    const handleCta = () => {
      const ctaLabel = action.cta ?? "";
      // Admin: Send to client → bump offer.stage to "sent" + emit event.
      if (pov === "admin" && ctaLabel === "Send to client") {
        applyOfferOverride(conv.id, {
          stage: "sent",
          appendedTimeline: [{
            id: `local-send-${conv.id}-${Date.now()}`,
            ts: "Just now",
            actor: "Coordinator",
            body: "Offer sent to client",
            tone: "info",
          }],
        });
        toast("Offer sent · client notified");
        return;
      }
      // Admin: Nudge talent / client → toast (mock notif).
      if (pov === "admin" && (ctaLabel === "Nudge talent" || ctaLabel === "Nudge client")) {
        toast(`${ctaLabel} · reminder sent`);
        return;
      }
      // Coord: Send to client (talent_coord pov also hits this).
      if (pov === "talent_coord" && ctaLabel === "Send to client") {
        applyOfferOverride(conv.id, {
          stage: "sent",
          appendedTimeline: [{
            id: `local-send-${conv.id}-${Date.now()}`,
            ts: "Just now",
            actor: "Coordinator",
            body: "Offer sent to client",
            tone: "info",
          }],
        });
        toast("Offer sent · client notified");
        return;
      }
      toast(`${ctaLabel}…`);
    };
    return {
      hint: action.label,
      primary: action.cta ? {
        label: action.cta,
        tone: action.ctaTone === "success" ? "success" : "primary",
        onClick: handleCta,
      } : undefined,
      secondary: action.secondary ? {
        label: action.secondary,
        tone: "ghost",
        onClick: () => toast(`${action.secondary} sent`),
      } : undefined,
    };
  }

  // ── Inquiry/hold WITHOUT an offer — talent's been invited but no
  //    pricing yet. Different from the offer-driven path; this is the
  //    "say yes / no to being on the shortlist" bar. ──
  if (conv.stage === "inquiry" || conv.stage === "hold") {
    if (pov === "client") return { hint: "Coordinator is on it.", secondary: { label: "Add a note", tone: "ghost", onClick: () => toast("Add a note") } };
    if (pov === "talent") {
      const verb = conv.stage === "inquiry" ? "Accept" : "Confirm";
      return {
        hint: `Coordinator invited you. ${verb}, hold, or decline?`,
        primary: { label: verb, tone: "success", onClick: () => toast(`${verb}ed — coordinator notified`) },
        secondary: { label: "Decline", tone: "ghost", onClick: () => toast("Declined — coordinator notified") },
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
      <div style={{
        maxWidth: "92%", padding: "10px 14px", borderRadius: 12,
        background: COLORS.royalSoft, border: `1px solid rgba(95,75,139,0.18)`,
        color: COLORS.ink,
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700,           color: COLORS.royalDeep, marginBottom: 4,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span aria-hidden style={{ display: "inline-flex" }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 2h6l2 2v6H2V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M4 5h4M4 7h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </span>
          Note from {who}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: COLORS.ink, fontStyle: "italic" }}>
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
      <div style={{
        maxWidth: "78%", padding: "6px 12px", borderRadius: 999,
        background: "rgba(11,11,13,0.04)", border: `1px solid ${COLORS.borderSoft}`,
        fontSize: 11, color: COLORS.inkMuted, textAlign: "center",
      }}>
        <span style={{ fontWeight: 500, color: COLORS.inkDim }}>● </span>
        {body}
        <span style={{ marginLeft: 6, color: COLORS.inkDim }}>· {ts}</span>
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

/**
 * Pov-shaped detail rendering. Same Inquiry record, four different
 * emotional registers:
 *
 *   client       — calm reassurance: "your project, your contact, your dates"
 *   talent       — personal job card: "your role, your dates, your contact"
 *   talent_coord — talent + coordinator extras (lineup, group)
 *   admin        — operational console: full participants + source + controls
 *
 * The structure shares one model but the *voice* and *density* differ. We
 * never let the canonical schema leak into the visible UI — labels are
 * human, sections are role-relevant, admin chrome stays out of client/talent.
 */
export function DetailsPanel({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  if (pov === "client")       return <ClientDetailsView inquiry={inquiry} />;
  if (pov === "talent")       return <TalentDetailsView inquiry={inquiry} isCoordinator={false} />;
  if (pov === "talent_coord") return <TalentDetailsView inquiry={inquiry} isCoordinator={true} />;
  return <AdminDetailsView inquiry={inquiry} />;
}

// ── CLIENT view — short, warm, reassurance-shaped ──
function ClientDetailsView({ inquiry }: { inquiry: InquiryRecord }) {
  const coord = inquiry.coordinators[0];
  const { toast } = useProto();
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Your project */}
      <DetailSection title="Your project">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.4 }}>{inquiry.title}</div>
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>{inquiry.brief.summary}</div>
        )}
      </DetailSection>

      {/* Your contact — single coordinator, not "Participants" */}
      {coord && (
        <DetailSection title="Your contact">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar size={36} tone="auto" hashSeed={coord.name} initials={coord.initials} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{coord.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>Your coordinator</div>
            </div>
            <button type="button" onClick={() => toast(`Messaging ${coord.name}…`)} style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
              border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
            }}>Message</button>
          </div>
        </DetailSection>
      )}

      {/* Your talent — the people the client commissioned. Filters to
          accepted/booked roles only when the inquiry has progressed past
          coordination, so the client doesn't see backstage decline data
          or talent who didn't make the lineup. The "Talent group" tab
          stays locked (private to coordinator + talent). This is where
          the client sees WHO they're hiring. */}
      {inquiry.talent.length > 0 && (
        <DetailSection title="Your talent">
          {inquiry.talent
            .filter(t => {
              const s = (t.state ?? "").toLowerCase();
              // While coordinating, hide pending/declined — only show
              // confirmed talent. After offer: show all approved rows.
              if (inquiry.status === "submitted" || inquiry.status === "coordinating") {
                return s === "accepted" || s === "confirmed" || s === "booked";
              }
              return s !== "declined" && s !== "rejected" && s !== "withdrew";
            })
            .map(t => (
              <ClientTalentCard key={t.talentId} talent={t} stagePast={inquiry.status === "wrapped"} canEdit={inquiry.status !== "wrapped" && inquiry.status !== "cancelled"} />
            ))
          }
          {/* Lineup editing — clients (and coordinators) can suggest
              swaps, request additional talent, or pull in someone they
              already worked with. Hidden once the project is wrapped /
              cancelled — no edits past that point. */}
          {inquiry.status !== "wrapped" && inquiry.status !== "cancelled" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => toast("Browse talent to add")} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 999,
                border: `1px dashed ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
              }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Add talent
              </button>
              <button type="button" onClick={() => toast("Request swap or alternate")} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 999,
                border: "none", background: "transparent",
                color: COLORS.inkMuted, cursor: "pointer",
                fontSize: 11.5, fontWeight: 500, fontFamily: FONTS.body,
              }}>
                Request a swap
              </button>
            </div>
          )}
        </DetailSection>
      )}

      {/* When + where, combined into one calm card */}
      <DetailSection title="When & where">
        <div style={{ fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
          {inquiry.schedule.start}
          {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
        </div>
        {(inquiry.location.city || inquiry.location.venue) && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
            {[inquiry.location.venue, inquiry.location.city].filter(Boolean).join(" · ")}
          </div>
        )}
        {inquiry.location.mode === "tbc" && (
          <div style={{ fontSize: 12, color: COLORS.inkDim, marginTop: 4, fontStyle: "italic" }}>Location TBC</div>
        )}
      </DetailSection>
    </div>
  );
}

// ── ClientTalentCard — how a client sees the talent they commissioned.
// Avatar + name + role/status + view-profile + (when editable) a swap
// affordance. Coordinator-side editing happens in the Offer tab; this
// is the client-facing view of the same lineup. ──
function ClientTalentCard({
  talent, stagePast, canEdit, onSwap,
}: {
  talent: { talentId: string; name: string; initials: string; state: string; photoUrl?: string };
  stagePast?: boolean;
  canEdit?: boolean;
  // When provided, the swap button calls this instead of toasting —
  // lets the parent open a real picker drawer (add/swap/remove). Falls
  // back to a toast for places that haven't wired the drawer yet.
  onSwap?: () => void;
}) {
  const { toast } = useProto();
  const stateMeta = (() => {
    const s = (talent.state || "").toLowerCase();
    if (s === "accepted" || s === "confirmed" || s === "booked") {
      return { label: stagePast ? "Worked together" : "Confirmed", bg: COLORS.successSoft, fg: COLORS.success };
    }
    if (s === "pending" || s === "invited") {
      return { label: "Pending acceptance", bg: `${COLORS.amber}18`, fg: COLORS.amber };
    }
    return { label: "Standby", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
  })();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", marginBottom: 6,
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
      fontFamily: FONTS.body,
    }}>
      <Avatar size={36} tone="auto" hashSeed={talent.name} initials={talent.initials} photoUrl={talent.photoUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: COLORS.ink,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{talent.name}</div>
        <div style={{
          marginTop: 3,
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 10, fontWeight: 700,
          padding: "2px 7px", borderRadius: 999,
          background: stateMeta.bg, color: stateMeta.fg,
          textTransform: "uppercase", letterSpacing: 0.4,
        }}>{stateMeta.label}</div>
      </div>
      <button type="button" onClick={() => toast(`Open ${talent.name}'s profile`)} style={{
        flexShrink: 0,
        padding: "5px 10px", borderRadius: 999,
        border: `1px solid ${COLORS.border}`, background: "transparent",
        color: COLORS.ink, cursor: "pointer",
        fontSize: 11, fontWeight: 600, fontFamily: FONTS.body,
      }}>View</button>
      {canEdit && !stagePast && (
        <button type="button" onClick={() => onSwap ? onSwap() : toast(`Request swap for ${talent.name}`)} aria-label={`Swap ${talent.name}`} style={{
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 8,
          border: "none", background: "transparent",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h8l-2-2M12 10H4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ── TALENT view — personal job card; coordinators see the lineup too ──
function TalentDetailsView({ inquiry }: { inquiry: InquiryRecord; isCoordinator: boolean }) {
  const coord = inquiry.coordinators[0];
  const { toast } = useProto();
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* The job */}
      <DetailSection title="The job">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.4 }}>{inquiry.title}</div>
        {inquiry.client.name && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>For {inquiry.client.name}</div>
        )}
      </DetailSection>

      {/* Brief — surfaces the client's actual ask. The summary lives on
          inquiry.brief.summary; notes captures wardrobe / usage / mood
          context. Skip the section if nothing meaningful was provided. */}
      {(inquiry.brief.summary && inquiry.brief.summary !== inquiry.title) || inquiry.brief.notes ? (
        <DetailSection title="Brief">
          {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
            <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55 }}>{inquiry.brief.summary}</div>
          )}
          {inquiry.brief.notes && (
            <div style={{
              fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.55,
              marginTop: inquiry.brief.summary ? 8 : 0,
              padding: "8px 10px", background: COLORS.surfaceAlt,
              borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
            }}>{inquiry.brief.notes}</div>
          )}
        </DetailSection>
      ) : null}

      {/* Schedule — talent's most-asked question */}
      <DetailSection title="Schedule">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
          {inquiry.schedule.start}
          {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
        </div>
        {inquiry.schedule.callTime && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>Call time: {inquiry.schedule.callTime}</div>
        )}
      </DetailSection>

      {/* Location — upgraded to a static-map tile so talent gets a real
          spatial signal at-a-glance, not just an "Open in Maps" link. */}
      {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) && (
        <DetailSection title="Location">
          <LocationMapTile
            venue={inquiry.location.venue}
            address={inquiry.location.address}
            city={inquiry.location.city}
            onOpenMaps={() => toast("Open map")}
          />
        </DetailSection>
      )}

      {/* Coordinator card */}
      {coord && (
        <DetailSection title="Your coordinator">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
              <Avatar size={32} tone="auto" hashSeed={coord.name} initials={coord.initials} />
              <PresenceDot name={coord.name} size={8} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: COLORS.ink,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {coord.name}
                </span>
                <CoordRoleBadge role={coord.role} />
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted }}>{coord.role === "owner" ? "Workspace owner" : "Coordinator"}</div>
            </div>
            <button type="button" onClick={() => toast(`Messaging ${coord.name}…`)} style={{
              padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
            }}>Message</button>
          </div>
        </DetailSection>
      )}

      {/* Who's on this job — visible to ALL talent (was previously gated
          to coordinator-talent, which left non-coord talent in the dark
          about their teammates). Status badges (Accepted / Pending /
          Declined) ride next to each name so the lineup health is
          visible without opening the workspace drawer.

          Hidden when there's only one talent (e.g. c9 Lyra solo
          hostess) — the section reads as redundant chrome there. */}
      {inquiry.talent.length > 1 && (
        <DetailSection title="Who's on this job">
          {inquiry.talent.map(t => (
            <RosterMemberRow
              key={t.talentId}
              talent={t}
              isMe={t.talentId === currentTalentId() || t.name === MY_TALENT_PROFILE.name}
              stagePast={inquiry.status === "wrapped" || inquiry.status === "cancelled"}
            />
          ))}
        </DetailSection>
      )}
    </div>
  );
}

// ── Roster member row — avatar + name + state pill, used in the
// Details rail's "Who's on this job" card. Premium decision: show ALL
// teammates with state, not just the user's own row. The lineup is the
// most-asked question after "where + when?". ──
function RosterMemberRow({ talent, isMe, stagePast }: { talent: { talentId: string; name: string; initials: string; state: string; photoUrl?: string }; isMe?: boolean; stagePast?: boolean }) {
  const stateMeta = (() => {
    const s = (talent.state || "").toLowerCase();
    if (s === "accepted" || s === "confirmed" || s === "booked") {
      return { label: "Accepted", bg: COLORS.successSoft, fg: COLORS.success };
    }
    if (s === "declined" || s === "rejected" || s === "withdrew") {
      return { label: "Declined", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
    }
    return { label: "Pending", bg: `${COLORS.amber}18`, fg: COLORS.amber };
  })();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "5px 0",
      // Subtle background for "you" row so the user spots themselves
      // at-a-glance — no chevron noise, just a tinted strip.
      ...(isMe ? {
        margin: "1px -8px",
        padding: "5px 8px",
        background: "rgba(91,107,160,0.06)",
        borderRadius: 8,
      } : {}),
    }}>
      <Avatar size={26} tone="auto" hashSeed={talent.name} initials={talent.initials} photoUrl={talent.photoUrl} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: isMe ? 700 : 500, color: COLORS.ink, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {talent.name}
        {isMe && (
          <span style={{
            marginLeft: 6, fontSize: 9.5, fontWeight: 700,
            padding: "1px 6px", borderRadius: 999,
            background: COLORS.indigoDeep, color: "#fff",
            letterSpacing: 0.3, textTransform: "uppercase",
            verticalAlign: "middle",
          }}>You</span>
        )}
      </span>
      {/* Past stage: drop the live-pipeline state pills (Pending / etc.
          stop being relevant once the job is wrapped) and surface a
          neutral "Worked together" cue instead. */}
      {stagePast ? (
        <span style={{
          fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
          background: "rgba(11,11,13,0.04)", color: COLORS.inkMuted,
          textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0,
        }}>Worked together</span>
      ) : (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
          background: stateMeta.bg, color: stateMeta.fg,
          textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0,
        }}>{stateMeta.label}</span>
      )}
    </div>
  );
}

// ── LocationMapTile — premium upgrade from "Open in Maps →" link to a
// static-map preview. Uses a CSS-rendered abstract map (clean sans-serif
// grid + accent pin) that reads as a place without needing a Mapbox key
// in the prototype. Click forwards to whatever the host wires up. ──
function LocationMapTile({
  venue, address, city, onOpenMaps,
}: { venue?: string; address?: string; city?: string; onOpenMaps: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenMaps}
      aria-label="Open in Maps"
      style={{
        position: "relative", width: "100%",
        padding: 0, border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff", borderRadius: 10, overflow: "hidden",
        cursor: "pointer", textAlign: "left",
        transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.boxShadow = "0 1px 0 rgba(11,11,13,0.04), 0 6px 16px -8px rgba(11,11,13,0.10)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Abstract map — soft grid + accent pin. Replace with a real
          static-map render (Mapbox / Google Static) when geo lat/lng
          ships in the inquiry record. */}
      <div aria-hidden style={{
        position: "relative", height: 110,
        background: `
          linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, ${COLORS.surface ?? "#FAFAFA"} 100%),
          radial-gradient(circle at 35% 60%, rgba(91,107,160,0.10) 0%, transparent 60%)
        `,
        backgroundBlendMode: "multiply",
        overflow: "hidden",
      }}>
        {/* grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(11,11,13,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(11,11,13,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
          maskImage: "radial-gradient(ellipse at center, #000 50%, transparent 95%)",
        }} />
        {/* pseudo road */}
        <div style={{
          position: "absolute", left: "10%", right: "12%", top: "62%",
          height: 3, background: "rgba(11,11,13,0.10)", borderRadius: 2,
          transform: "rotate(-6deg)",
        }} />
        <div style={{
          position: "absolute", left: "30%", top: "20%", bottom: "20%",
          width: 3, background: "rgba(11,11,13,0.08)", borderRadius: 2,
          transform: "rotate(8deg)",
        }} />
        {/* pin */}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -100%)",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: COLORS.accent, border: "3px solid #fff",
            boxShadow: "0 4px 10px rgba(11,11,13,0.20), 0 0 0 4px rgba(91,107,160,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.4 4.5 8.5 4.5 8.5s4.5-5.1 4.5-8.5A4.5 4.5 0 0 0 8 1.5zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
            </svg>
          </div>
        </div>
      </div>
      {/* address block */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {venue && (
            <div style={{
              fontSize: 13, fontWeight: 600, color: COLORS.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{venue}</div>
          )}
          {(address || city) && (
            <div style={{
              fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{[address, city].filter(Boolean).join(", ")}</div>
          )}
        </div>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 600, color: COLORS.accent,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          Maps
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </button>
  );
}

// ── ADMIN view — operations console: full participants, source, controls ──
function AdminDetailsView({ inquiry }: { inquiry: InquiryRecord }) {
  const { toast } = useProto();
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title="Brief">
        <DetailField label="Project" value={inquiry.title} />
        {inquiry.client.name && <DetailField label="Client" value={inquiry.client.name} />}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && <DetailField label="Summary" value={inquiry.brief.summary} multiline />}
        {inquiry.brief.notes && <DetailField label="Notes" value={inquiry.brief.notes} multiline />}
      </DetailSection>

      <DetailSection title="Schedule">
        <DetailField label="Start" value={inquiry.schedule.start} />
        {inquiry.schedule.end && <DetailField label="End" value={inquiry.schedule.end} />}
        {inquiry.schedule.callTime && <DetailField label="Call time" value={inquiry.schedule.callTime} />}
      </DetailSection>

      <DetailSection title="Location">
        <DetailField label="Mode" value={inquiry.location.mode === "tbc" ? "TBC" : inquiry.location.mode.replace("_", " ")} />
        {inquiry.location.city && <DetailField label="City" value={inquiry.location.city} />}
        {inquiry.location.venue && <DetailField label="Venue" value={inquiry.location.venue} />}
      </DetailSection>

      <DetailSection title="Participants">
        {inquiry.coordinators.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <Avatar size={28} tone="auto" hashSeed={c.name} initials={c.initials} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{c.name}</div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted }}>
                {c.role === "owner" ? "Workspace owner · Coordinator" : "Coordinator"}
                {c.alsoTalentId && " · Also booked as talent"}
              </div>
            </div>
          </div>
        ))}
        {inquiry.talent.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkDim, marginTop: 8, marginBottom: 4 }}>
              Talent
            </div>
            {inquiry.talent.map(t => (
              <div key={t.talentId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <Avatar size={26} tone="auto" hashSeed={t.name} initials={t.initials} />
                <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink }}>{t.name}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                  background:
                      t.state === "confirmed" ? COLORS.successSoft
                    : t.state === "hold"      ? COLORS.amberSoft
                    : t.state === "declined"  ? COLORS.coralSoft
                    : "rgba(11,11,13,0.05)",
                  color:
                      t.state === "confirmed" ? COLORS.successDeep
                    : t.state === "hold"      ? COLORS.amberDeep
                    : t.state === "declined"  ? COLORS.coralDeep
                    : COLORS.inkMuted,
                                  }}>{t.state}</span>
              </div>
            ))}
          </>
        )}
        <AdminParticipantsActions inquiry={inquiry} />
      </DetailSection>

      <DetailSection title="Source">
        <DetailField label="Channel" value={inquiry.source.kind.replace("_", " ")} />
        <DetailField label="Created" value={inquiry.createdAt} />
        <DetailField label="By" value={inquiry.createdBy.name} />
      </DetailSection>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <h3 style={{
        margin: "0 0 8px", fontFamily: FONTS.display,
        fontSize: 12, fontWeight: 700,         color: COLORS.inkMuted,
      }}>{title}</h3>
      {children}
    </section>
  );
}
function DetailField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{
      display: multiline ? "block" : "flex",
      gap: 12,
      padding: "5px 0",
      borderBottom: `1px dashed ${COLORS.borderSoft}`,
    }}>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, minWidth: 80, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5, flex: 1 }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// InquiryComposer — unified entry point that replaces the two parallel
// drawers (client-send-inquiry + workspace new-inquiry). Different modes
// only toggle defaults + visibility; the output is one InquiryRecord.
//
// Modes:
//   - client : the requester locks to themselves, budget strongly suggested
//   - admin  : full control, can pick any client; coord defaults to current admin
//   - hub    : client picks coordinator (or app does); rest like client
//
// Sections: Client → Schedule → Location → Talent → Brief → Budget
// Mobile: each section is a collapsible card; sticky bottom Send.
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// MOBILE PAGE HEADER SYSTEM — three reusable variants. Replaces the
// stacked eyebrow/title/subtitle pattern that was eating ~140px of
// vertical space on mobile before any content. On desktop these still
// render as compact chrome. The principle: header = navigation/context,
// not a hero section. The shell is the hero.
//
//   <PageTopUtility>     simple back-row pages (Calendar, Files, Search)
//   <PageTopCollection>  list pages (My jobs, Messages, Projects)
//   <PageTopThread>      thread/record pages (one inquiry, one booking)
//
// All three are mobile-first: compact, single-row where possible,
// collapse aggressively on small screens.
// ════════════════════════════════════════════════════════════════════

export function PageTopUtility({
  back, title, meta, action,
}: {
  back?: { label: string; onClick: () => void };
  title: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 0 10px",
      fontFamily: FONTS.body,
    }}>
      {back && (
        <button type="button" onClick={back.onClick} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
          color: COLORS.inkMuted, fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {back.label}
        </button>
      )}
      {!back && (
        <h1 style={{
          margin: 0, flex: 1, minWidth: 0,
          fontFamily: FONTS.display, fontSize: 18, fontWeight: 700,
          color: COLORS.ink, letterSpacing: -0.2,
        }}>{title}</h1>
      )}
      {back && (
        <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink, flex: 1, minWidth: 0 }}>
          {title}
        </span>
      )}
      {meta && (
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted, fontWeight: 500 }}>{meta}</span>
      )}
      {action && (
        <button type="button" onClick={action.onClick} style={{
          padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          border: `1px solid ${COLORS.border}`, background: "transparent",
          color: COLORS.ink, cursor: "pointer",
        }}>{action.label}</button>
      )}
    </header>
  );
}

export function PageTopCollection({
  title, count, action,
}: {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <header style={{
      display: "flex", alignItems: "baseline", gap: 8,
      padding: "10px 0 8px", fontFamily: FONTS.body,
    }}>
      <h1 style={{
        margin: 0, fontFamily: FONTS.display, fontSize: 19, fontWeight: 700,
        color: COLORS.ink, letterSpacing: -0.2,
      }}>{title}</h1>
      {count !== undefined && (
        <span style={{ fontSize: 12, color: COLORS.inkDim, fontWeight: 500 }}>
          {count}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {action && (
        <button type="button" onClick={action.onClick} style={{
          padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          border: "none", background: COLORS.accent, color: "#fff", cursor: "pointer",
        }}>{action.label}</button>
      )}
    </header>
  );
}

/**
 * Premium thread header — single-line layout (Linear/Things style):
 *   ‹ Projects · Mango                                    [Inquiry]
 *   Spring lookbook · Madrid
 *
 * Back-link + separator + title sit inline so the eye travels left-to-right
 * once. Status chip pinned to the right. Subtitle one line below in muted
 * ink. Status pill uses sentence-case via `textTransform: capitalize`.
 */
export function PageTopThread({
  back, title, meta, statusChip, statusTone,
}: {
  back: { label: string; onClick: () => void };
  title: string;
  meta?: string;
  statusChip?: string;
  statusTone?: { bg: string; fg: string };
}) {
  const tone = statusTone ?? { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
  return (
    <header style={{ padding: "4px 0 8px", fontFamily: FONTS.body }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        minWidth: 0,
      }}>
        {/* Back link (inline, not its own row) */}
        <button type="button" onClick={back.onClick} aria-label={`Back to ${back.label}`} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
          color: COLORS.inkMuted, fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ display: "none" }}>{back.label}</span>
        </button>
        <span style={{ color: COLORS.inkDim, fontSize: 13 }}>{back.label}</span>
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 12 }}>·</span>
        {/* Title takes remaining width; truncates if too long */}
        <h1 style={{
          margin: 0, flex: 1, minWidth: 0,
          fontFamily: FONTS.display, fontSize: 18, fontWeight: 700,
          color: COLORS.ink, letterSpacing: -0.25, lineHeight: 1.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{title}</h1>
        {statusChip && (
          <span style={{
            fontSize: 10.5, fontWeight: 600,
            padding: "2px 9px", borderRadius: 999,
            background: tone.bg, color: tone.fg, flexShrink: 0,
            textTransform: "capitalize",
          }}>{statusChip}</span>
        )}
      </div>
      {meta && (
        <div style={{
          fontSize: 12, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.4,
          // Indent so it lines up under the title, not under the back-arrow.
          paddingLeft: 0,
        }}>{meta}</div>
      )}
    </header>
  );
}

export type ComposerMode = "client" | "admin" | "hub";

/**
 * In-memory inquiry store. Production reads/writes the DB; in the
 * prototype we keep a process-local list so submitting from the composer
 * actually produces a real `InquiryRecord` that surfaces in lists. Both
 * entry points (client form + admin manual) push to the same store.
 */
const __inquiryStore: InquiryRecord[] = [];
export function getProtoInquiries(): InquiryRecord[] { return __inquiryStore.slice(); }

/**
 * Lift a composer draft into the canonical Inquiry shape. Defaults are
 * source-aware so a client form submission lands as a "client_form"
 * inquiry with `submitted` status while an admin manual entry lands as
 * "workspace_manual" already in `coordinating` (someone owns it).
 */
function draftToInquiry(draft: ComposerDraft, mode: ComposerMode): InquiryRecord {
  const now = new Date();
  const sourceKind: "client_form" | "workspace_manual" | "hub" =
      mode === "client" ? "client_form"
    : mode === "hub"    ? "hub"
    : "workspace_manual";
  const status: import("./_state").InquiryStatus =
      mode === "admin" ? "coordinating" : "submitted";
  const id = `IQ-${Math.floor(Math.random() * 9000 + 1000)}`;
  const amount = parseInt(draft.budgetAmount.replace(/\D/g, ""), 10);
  return {
    id,
    source: { kind: sourceKind },
    status,
    createdBy: { id: "me", name: draft.clientName || "Me" },
    createdAt: now.toISOString().slice(0, 10),
    title: draft.briefSummary || "Untitled inquiry",
    client: {
      id: (draft.clientName || "client").toLowerCase().replace(/\s+/g, "-"),
      name: draft.clientName || "—",
      contactName: draft.contactName || undefined,
      email: draft.contactEmail || undefined,
      phone: draft.contactPhone || undefined,
    },
    coordinators: [],
    talent: draft.talent.map((t, i) => ({
      talentId: t.id || `t-${i}`,
      name: t.name,
      initials: t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      state: "invited",
    })),
    schedule: {
      start: draft.scheduleStart || "TBC",
      end: draft.scheduleEnd || undefined,
    },
    location: draft.locationCity || draft.locationVenue
      ? { mode: "on_site", city: draft.locationCity || undefined, venue: draft.locationVenue || undefined }
      : { mode: "tbc" },
    brief: {
      summary: draft.briefSummary,
      notes: draft.briefNotes || undefined,
      files: [],
    },
    budget: amount > 0
      ? { amount, currency: draft.budgetCurrency, unitType: draft.budgetUnit, perPerson: draft.budgetPerPerson }
      : undefined,
    offerStage: amount > 0 ? "client_budget" : "no_offer",
    threads: { client: `${id}:client`, talentGroup: `${id}:talent` },
    timeline: [{
      id: `${id}-tl-0`,
      ts: now.toLocaleString(),
      actor: draft.clientName || "Me",
      body: `Inquiry created · ${draft.briefSummary || "no brief"}`,
      tone: "info",
    }],
  };
}

export function InquiryComposer({
  mode, defaultClientName, onSubmit, onCancel, embedded,
}: {
  mode: ComposerMode;
  defaultClientName?: string;
  onSubmit: (draft: ComposerDraft) => void;
  onCancel: () => void;
  /** When true, skip the outer header/footer (host drawer provides chrome). */
  embedded?: boolean;
}) {
  const { toast } = useProto();
  const [draft, setDraft] = useState<ComposerDraft>(() => ({
    title: "",
    clientName: mode === "client" ? defaultClientName ?? "" : "",
    contactName: "", contactEmail: "", contactPhone: "",
    scheduleStart: "", scheduleEnd: "",
    locationCity: "", locationVenue: "",
    talent: [],
    briefSummary: "", briefNotes: "",
    budgetAmount: "", budgetUnit: "day", budgetCurrency: "EUR", budgetPerPerson: false,
    sourceChannel: mode === "client" ? "form" : "phone",
    mixedRows: undefined,
  }));
  const update = <K extends keyof ComposerDraft>(k: K, v: ComposerDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const send = () => {
    if (!draft.briefSummary.trim()) {
      toast("Add a brief so the agency can triage");
      return;
    }
    // Lift draft → canonical InquiryRecord and persist to the prototype
    // store. Both entry points (client form + admin manual) write here,
    // so any list view consuming `getProtoInquiries()` sees the new row.
    const record = draftToInquiry(draft, mode);
    __inquiryStore.push(record);
    onSubmit(draft);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONTS.body }}>
      {/* Header — skipped in embedded mode (drawer provides its own) */}
      {!embedded && (
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted }}>
              {mode === "client" ? "New inquiry" : mode === "hub" ? "Hub inquiry" : "Manual inquiry"}
            </div>
            <h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, fontFamily: FONTS.display, color: COLORS.ink }}>
              What do you need?
            </h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" style={{
            padding: "6px 10px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "transparent",
            color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>× Close</button>
        </div>
      )}

      {/* Body — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: embedded ? 0 : "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* #22 — Booking-for Profile selector. On client mode, top-of-form
            "Booking as <Profile>" picker. Producer/multi-Profile users
            need to confirm WHICH Profile this inquiry is on behalf of. */}
        {mode === "client" && (
          <ComposerSection title="Booking as" subtitle="Which profile are you sending this from?">
            <ComposerSelect
              value={draft.clientName || "Martina Beach Club"}
              onChange={v => update("clientName", v)}
              options={[
                { value: "Martina Beach Club", label: "Martina Beach Club · Business" },
                { value: "The Gringo",         label: "The Gringo · Personal" },
              ]}
            />
          </ComposerSection>
        )}

        {/* #21 — Adaptive composer: pick the talent category first.
            Subsequent fields swap based on this choice.
            #28 — Multi-talent group: opt-in. Default is single category.
            Picking "Mixed group" reveals a row-builder for "3 hosts +
            2 models + 1 DJ" style group inquiries. */}
        <ComposerSection title="1. What do you need" subtitle="Pick a category — or build a mixed group.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { id: "models",        label: "Models",        emoji: "👤" },
              { id: "hosts",         label: "Hosts",         emoji: "🎤" },
              { id: "chefs",         label: "Chefs",         emoji: "👨‍🍳" },
              { id: "artists",       label: "Artists",       emoji: "🎨" },
              { id: "djs",           label: "DJs",           emoji: "🎧" },
              { id: "photographers", label: "Photographers", emoji: "📷" },
              { id: "performers",    label: "Performers",    emoji: "✨" },
              { id: "mixed",         label: "Mixed group",   emoji: "✦" },
            ].map(c => {
              const active = (draft.title || "models") === c.id;
              return (
                <button key={c.id} type="button" onClick={() => update("title", c.id)} style={{
                  padding: "7px 12px", borderRadius: 999,
                  border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                  background: active ? "rgba(15,79,62,0.08)" : "#fff",
                  color: active ? COLORS.accentDeep : COLORS.ink,
                  fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <span aria-hidden style={{ fontSize: 13 }}>{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* #28 — Multi-talent row builder. Only renders when "mixed" is
              picked, so the default single-category flow stays clean. */}
          {draft.title === "mixed" && (
            <MixedGroupBuilder
              rows={draft.mixedRows ?? [{ id: "g1", category: "hosts", count: 3 }]}
              onChange={(rows) => update("mixedRows", rows)}
            />
          )}
        </ComposerSection>

        {/* Client (admin/hub mode only — client mode covered above) */}
        {mode !== "client" && (
          <ComposerSection title="2. Who's it for" subtitle="Search or add a new client.">
            <ComposerInput placeholder="Search clients by name, email…" value={draft.clientName} onChange={v => update("clientName", v)} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              <ComposerInput placeholder="Contact name" value={draft.contactName} onChange={v => update("contactName", v)} />
              <ComposerInput placeholder="Contact email" value={draft.contactEmail} onChange={v => update("contactEmail", v)} />
            </div>
          </ComposerSection>
        )}

        {/* Schedule */}
        <ComposerSection title="2. When" subtitle="One-day or range. Use TBC if flexible.">
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <ComposerInput placeholder="Start (e.g. May 6)" value={draft.scheduleStart} onChange={v => update("scheduleStart", v)} />
            <ComposerInput placeholder="End (optional)" value={draft.scheduleEnd} onChange={v => update("scheduleEnd", v)} />
          </div>
        </ComposerSection>

        {/* Location */}
        <ComposerSection title="3. Where" subtitle="City + venue. Address can come later.">
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <ComposerInput placeholder="City" value={draft.locationCity} onChange={v => update("locationCity", v)} />
            <ComposerInput placeholder="Venue / location name" value={draft.locationVenue} onChange={v => update("locationVenue", v)} />
          </div>
        </ComposerSection>

        {/* Talent */}
        <ComposerSection title="4. Who you want" subtitle={mode === "client" ? "Pick from the directory or leave blank — we'll suggest." : "Invite represented talent. Search by code or name."}>
          <ComposerInput placeholder="Search talent…" value={"" /* stub */} onChange={() => {}} />
          <div style={{ marginTop: 8, fontSize: 11.5, color: COLORS.inkDim }}>
            {draft.talent.length === 0 ? "No talent added yet." : `${draft.talent.length} added`}
          </div>
        </ComposerSection>

        {/* Brief */}
        <ComposerSection title="5. The ask" subtitle="One line for triage. Long brief in notes.">
          <ComposerInput
            placeholder={mode === "client" ? "e.g. 3 promo models for a beach club launch" : "Brief headline for triage"}
            value={draft.briefSummary} onChange={v => update("briefSummary", v)}
          />
          <div style={{ marginTop: 8 }}>
            <ComposerTextarea
              placeholder="Notes — timing, dress code, languages, deliverables…"
              value={draft.briefNotes} onChange={v => update("briefNotes", v)}
            />
          </div>
        </ComposerSection>

        {/* Budget */}
        <ComposerSection
          title="6. Budget"
          subtitle={mode === "client"
            ? "Optional but recommended — gives the agency a faster path to your offer."
            : "Optional. Leave empty to let talent propose."}
        >
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "120px 110px 1fr" }}>
            <ComposerInput placeholder="Amount" value={draft.budgetAmount} onChange={v => update("budgetAmount", v)} />
            <ComposerSelect
              value={draft.budgetUnit}
              onChange={v => update("budgetUnit", v as InquiryUnitType)}
              options={[
                { value: "hour", label: "per hour" },
                { value: "day", label: "per day" },
                { value: "contract", label: "total contract" },
                { value: "event", label: "per event" },
              ]}
            />
            <ComposerSelect
              value={draft.budgetCurrency}
              onChange={v => update("budgetCurrency", v)}
              options={[
                { value: "EUR", label: "EUR €" },
                { value: "USD", label: "USD $" },
                { value: "MXN", label: "MXN $" },
                { value: "GBP", label: "GBP £" },
              ]}
            />
          </div>
          <label style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: COLORS.inkMuted, cursor: "pointer",
          }}>
            <input type="checkbox" checked={draft.budgetPerPerson} onChange={e => update("budgetPerPerson", e.target.checked)} />
            Budget is per talent (not group total)
          </label>
        </ComposerSection>
      </div>

      {/* Sticky footer */}
      <div style={{
        position: "sticky", bottom: 0,
        padding: embedded ? "10px 0 0" : "10px 16px",
        borderTop: embedded ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: embedded ? "transparent" : "rgba(255,255,255,0.96)",
        display: "flex", gap: 8, justifyContent: "flex-end",
      }}>
        <button type="button" onClick={onCancel} style={ghostBtn()}>Cancel</button>
        <button type="button" onClick={send} style={primaryBtn(COLORS.accent)}>
          {mode === "client" ? "Send to agency" : "Save inquiry"}
        </button>
      </div>
    </div>
  );
}

export type ComposerDraft = {
  title: string;
  clientName: string; contactName: string; contactEmail: string; contactPhone: string;
  scheduleStart: string; scheduleEnd: string;
  locationCity: string; locationVenue: string;
  talent: { id: string; name: string }[];
  briefSummary: string; briefNotes: string;
  budgetAmount: string; budgetUnit: InquiryUnitType; budgetCurrency: string; budgetPerPerson: boolean;
  sourceChannel: string;
  /** #28 — Mixed group rows (only used when title === "mixed"). */
  mixedRows?: { id: string; category: string; count: number }[];
};

/**
 * #28 — Mixed group row builder. Optional path inside the InquiryComposer
 * that lets a hospitality/event client request multiple talent categories
 * in one inquiry: "3 hosts + 2 models + 1 DJ for Saturday gala". The
 * default single-category flow stays the primary path; this only renders
 * when "Mixed group" is picked.
 */
function MixedGroupBuilder({
  rows, onChange,
}: { rows: { id: string; category: string; count: number }[]; onChange: (r: { id: string; category: string; count: number }[]) => void }) {
  const update = (id: string, patch: Partial<{ category: string; count: number }>) =>
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: `g${rows.length + 1}-${Math.random().toString(36).slice(2, 6)}`, category: "models", count: 1 }]);
  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  const categoryOptions = [
    { value: "models",        label: "Models" },
    { value: "hosts",         label: "Hosts" },
    { value: "chefs",         label: "Chefs" },
    { value: "artists",       label: "Artists" },
    { value: "djs",           label: "DJs" },
    { value: "photographers", label: "Photographers" },
    { value: "performers",    label: "Performers" },
    { value: "promoters",     label: "Promoters" },
  ];
  return (
    <div data-tulala-mixed-builder style={{
      marginTop: 12, padding: "12px 14px", borderRadius: 10,
      background: COLORS.indigoSoft, border: `1px solid rgba(91,107,160,0.18)`,
      fontFamily: FONTS.body,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10, gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.indigoDeep }}>
            Mixed group
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
            One inquiry · multiple categories. Coordinator routes each category to the right talent.
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: "3px 9px", borderRadius: 999,
          background: "#fff", color: COLORS.indigoDeep,
          fontVariantNumeric: "tabular-nums",
        }}>{total} talent</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
          }}>
            <input type="number" min={1} max={99} value={r.count}
              onChange={(e) => update(r.id, { count: parseInt(e.target.value, 10) || 1 })}
              style={{
                width: 50, padding: "6px 8px", borderRadius: 6,
                border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink,
                textAlign: "center", outline: "none", fontVariantNumeric: "tabular-nums",
              }}
            />
            <select value={r.category}
              onChange={(e) => update(r.id, { category: e.target.value })}
              style={{
                flex: 1, padding: "6px 10px", borderRadius: 6,
                border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none", cursor: "pointer",
              }}>
              {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {rows.length > 1 && (
              <button type="button" onClick={() => remove(r.id)} aria-label="Remove" style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, color: COLORS.inkMuted, lineHeight: 1,
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} style={{
        marginTop: 10, padding: "8px 12px", borderRadius: 999,
        border: `1px dashed ${COLORS.indigoDeep}40`, background: "transparent",
        color: COLORS.indigoDeep, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
        cursor: "pointer", width: "100%",
      }}>+ Add another category</button>
    </div>
  );
}

function ComposerSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <div style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{title}</h3>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4 }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
function ComposerInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 7,
        border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
      }}
    />
  );
}
function ComposerTextarea({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <textarea placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      rows={3}
      style={{
        width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 7,
        border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none", resize: "vertical",
      }}
    />
  );
}
function ComposerSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 7,
        border: `1px solid ${COLORS.border}`, background: "rgba(11,11,13,0.025)",
        fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none", cursor: "pointer",
      }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Well-known tab ids. Extra ids are allowed (string-typed) so the same
// shell renders the inquiry config (client | talent | offer | files | details)
// AND the booking config (client | talent | logistics | files | payment | details)
// without TypeScript fighting us.
export type ThreadTabId =
  | "client" | "talent" | "offer" | "files" | "details"
  | "logistics" | "payment"   // booking-only tabs
  | "booking"                  // talent merged details+logistics view
  | (string & {});

type TabState = "active" | "locked";

type TabDef = {
  id: ThreadTabId;
  label: string;
  badge?: number | string;
  state: TabState; // "locked" → render LockedTabOverlay when selected
  lockedReason?: string;
};

function ThreadTabBar({
  tabs, activeId, onSelect,
}: {
  tabs: TabDef[];
  activeId: ThreadTabId;
  onSelect: (id: ThreadTabId) => void;
}) {
  // #4 — Reorder so locked tabs always sit AT THE END (visual hierarchy:
  // active before locked). Stable order otherwise.
  const ordered = useMemo(() => {
    const active = tabs.filter(t => t.state === "active");
    const locked = tabs.filter(t => t.state === "locked");
    return [...active, ...locked];
  }, [tabs]);

  // #5 — Keyboard navigation (arrow keys / Home / End).
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowLeft")  next = (idx - 1 + ordered.length) % ordered.length;
    if (e.key === "ArrowRight") next = (idx + 1) % ordered.length;
    if (e.key === "Home")       next = 0;
    if (e.key === "End")        next = ordered.length - 1;
    const target = ordered[next];
    if (target) {
      onSelect(target.id);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <div data-tulala-thread-tabs role="tablist" aria-orientation="horizontal" style={{
      display: "flex", alignItems: "center", gap: 0,
      borderBottom: `1px solid ${COLORS.borderSoft}`,
      background: "#fff",
      paddingLeft: 4,
      // Sticky so the tab bar stays visible while the content beneath
      // scrolls — crucial when the chat or details list grows long.
      position: "sticky", top: 0, zIndex: 5,
      overflowX: "auto",
      scrollbarWidth: "none",
    }}>
      {/* Mobile: collapse tab labels and lean on icons. Keeps the
          tab strip on a single line at narrow widths instead of
          wrapping "Booking team" onto two lines. The label remains
          available to screen readers via aria-label on the button. */}
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-thread-tabs]{padding-left:0}"
        // Hide all tab labels at mobile by default — the icons carry
        // the meaning. The active tab keeps its label next to the
        // icon so users always know which surface they're on.
        + "[data-tulala-thread-tabs] [data-tulala-tab-label]{display:none}"
        + "[data-tulala-thread-tabs] button[aria-selected=\"true\"] [data-tulala-tab-label]{display:inline!important;margin-left:2px}"
        + "[data-tulala-thread-tabs] button{padding:11px 10px 9px!important;gap:5px!important}"
        + "[data-tulala-thread-tabs] button[aria-selected=\"true\"]{padding:11px 12px 9px!important}"
        + "}"
      }} />
      {ordered.map((t, idx) => {
        const active = t.id === activeId;
        const locked = t.state === "locked";
        return (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[idx] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={t.label}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "12px 12px 10px",
              fontFamily: FONTS.body, fontSize: 13,
              fontWeight: active ? 700 : 500,
              color: active ? COLORS.ink : locked ? COLORS.inkDim : COLORS.inkMuted,
              borderBottom: `2px solid ${active ? COLORS.accent : "transparent"}`,
              marginBottom: -1,
              transition: `color ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
              position: "relative",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {/* Tab icon — used everywhere on mobile (where the text
                label hides), and as a quiet leading mark on desktop. */}
            <span aria-hidden style={{ display: "inline-flex", color: "currentColor" }}>
              {tabIcon(t.id, locked)}
            </span>
            <span data-tulala-tab-label>{t.label}</span>
            {t.badge !== undefined && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                background: active ? COLORS.fill : "rgba(11,11,13,0.08)",
                color: active ? "#fff" : COLORS.inkMuted,
                minWidth: 16, textAlign: "center",
              }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Icon for each thread tab — used on mobile (label hidden) and as a
// quiet leading mark on desktop. Phosphor-inspired: clean 1.5 stroke,
// rounded caps/joins, balanced 16-unit viewBox, distinctive at 14px.
// Lock icon overrides the tab's own icon when locked.
function tabIcon(id: ThreadTabId, locked: boolean): React.ReactNode {
  // Bumped to 18px (was 14) — more legible at thumb scale and as a
  // standalone glyph in the icon-only mobile tab strip. Stroke also
  // bumped to 1.6 for crispness.
  if (locked) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="3.5" y="8" width="11" height="7.5" rx="1.6" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M6 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="9" cy="11.5" r="1" fill="currentColor"/>
      </svg>
    );
  }
  switch (id) {
    case "client":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 8.25c0-2.9 2.7-5 6-5s6 2.1 6 5-2.7 5-6 5c-.62 0-1.22-.08-1.78-.22L4 15l.78-2.85C3.6 11.1 3 9.75 3 8.25z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <circle cx="9" cy="7.4" r="1.25" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M6.5 10.4c.5-1 1.5-1.6 2.5-1.6s2 .6 2.5 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      );
    case "talent":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M2.75 8c0-2.9 2.7-5 6.25-5s6.25 2.1 6.25 5-2.7 5-6.25 5c-.7 0-1.36-.08-1.96-.22L3.4 15l.85-2.95C3.4 11.05 2.75 9.7 2.75 8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <circle cx="6" cy="8" r="1" fill="currentColor"/>
          <circle cx="9" cy="8" r="1" fill="currentColor"/>
          <circle cx="12" cy="8" r="1" fill="currentColor"/>
        </svg>
      );
    case "offer":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 9.5V3.5h6L15 9.5l-5.5 5.5L3 9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <circle cx="6.5" cy="6.5" r="1.25" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
      );
    case "logistics":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="3.5" y="4" width="11" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.6"/>
          <rect x="6.5" y="2.25" width="5" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.6"/>
          <path d="M6.25 8.5l1.1 1.1 2.2-2.2M6.25 12.25l1.1 1.1 2.2-2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M11.25 9h1.75M11.25 12.5h1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    case "files":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 3h6.5L14.5 7v7.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-11A.5.5 0 014 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <path d="M10.5 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <path d="M6.25 10h5.5M6.25 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    case "payment":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2.25" y="4.5" width="13.5" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.6"/>
          <path d="M2.25 7.75h13.5" stroke="currentColor" strokeWidth="1.6"/>
          <rect x="4.25" y="10" width="3" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M10 11.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      );
    case "details":
      // Info "i" — fixed: dot is now properly above the line, both
      // perfectly centered on the vertical axis. Was looking off
      // because the dot radius (0.85) was overlapping the line start.
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6"/>
          <circle cx="9" cy="6" r="1" fill="currentColor"/>
          <path d="M9 8.5v4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      );
    case "booking":
      // Calendar + check — talent-only merged tab at booked stage.
      // Reads as "the day is locked, here's everything you need to
      // show up." Hybrid of the logistics clipboard + details info,
      // single glyph so the talent's tab strip stays visually quiet.
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="3" y="4.25" width="12" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.6"/>
          <path d="M3 7.75h12M6 2.5v3.25M12 2.5v3.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M6.25 11.5l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return null;
  }
}

// ── Locked overlay — stylish frosted "request access" panel ──
function LockedTabOverlay({
  title, subtitle, requestLabel, onRequest, ghostPreview,
}: {
  title: string;
  subtitle: string;
  requestLabel: string;
  onRequest: () => void;
  /** Optional faint preview behind the overlay — gives a sense of what's there */
  ghostPreview?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  return (
    <div style={{ position: "relative", padding: "28px 20px 40px", overflow: "hidden", minHeight: 320 }}>
      {/* Ghost preview faint behind */}
      {ghostPreview && (
        <div aria-hidden style={{
          position: "absolute", inset: 0, padding: "20px 16px",
          opacity: 0.14, filter: "blur(2px)", pointerEvents: "none",
          color: COLORS.ink,
        }}>
          {ghostPreview}
        </div>
      )}
      {/* Foreground card */}
      <div style={{
        position: "relative",
        maxWidth: 380, margin: "32px auto 0",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.md,
        padding: 24,
        boxShadow: "0 12px 32px rgba(11,11,13,0.10)",
        textAlign: "center",
        fontFamily: FONTS.body,
      }}>
        <div aria-hidden style={{
          width: 44, height: 44, borderRadius: "50%",
          background: COLORS.surfaceAlt, color: COLORS.inkMuted,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12,
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
          {subtitle}
        </div>
        {pending ? (
          <div style={{
            marginTop: 16, padding: "10px 14px",
            background: COLORS.successSoft, color: COLORS.success,
            borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            Request sent — coordinator will review
          </div>
        ) : (
          <button type="button" onClick={() => { onRequest(); setPending(true); }} style={{
            marginTop: 16, padding: "9px 16px", borderRadius: 8, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
            transition: `transform ${TRANSITION.micro}, opacity ${TRANSITION.sm}`,
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {requestLabel}
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M2 5.5h7M5.5 2L9 5.5 5.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Mock files list (shared by talent + client tabs) ──
const MOCK_FILES_FOR_CONV: Record<string, Array<{ name: string; size: string; addedBy: string; addedAt: string; thread: "client" | "talent" }>> = {
  c1: [
    { name: "Mango_brief_SS27_lookbook.pdf", size: "2.4 MB", addedBy: "Joana Rivera", addedAt: "Apr 22", thread: "client" },
    { name: "moodboard_4_refs.pdf",          size: "1.2 MB", addedBy: "Sara Mendez",  addedAt: "Apr 28", thread: "talent" },
    { name: "wardrobe_pull_v1.pdf",          size: "48 KB",  addedBy: "Lia Varga",    addedAt: "Apr 27", thread: "talent" },
  ],
  c2: [
    { name: "Bvlgari_jewelry_brief.pdf",     size: "1.8 MB", addedBy: "Sara Mendez", addedAt: "Apr 18", thread: "client" },
    { name: "shotlist_close-ups.pdf",        size: "240 KB", addedBy: "Sara Mendez", addedAt: "Apr 20", thread: "client" },
    { name: "hold_calendar_invite.ics",      size: "8 KB",   addedBy: "System",      addedAt: "Apr 26", thread: "talent" },
  ],
  c3: [
    { name: "Vogue_Italia_Editorial_May14-15.pdf", size: "320 KB", addedBy: "Ana Vega",     addedAt: "Apr 12", thread: "talent" },
    { name: "Vogue_callsheet_v2.pdf",              size: "412 KB", addedBy: "Ana Vega",     addedAt: "5h ago",  thread: "talent" },
    { name: "Wardrobe_direction_8_looks.pdf",      size: "5.2 MB", addedBy: "Francesca B.", addedAt: "Apr 22",  thread: "client" },
    { name: "Train_Madrid_Milan_May13.pdf",        size: "184 KB", addedBy: "Ana Vega",     addedAt: "May 5",   thread: "talent" },
    { name: "Hotel_Magna_Pars_confirmation.pdf",   size: "96 KB",  addedBy: "Ana Vega",     addedAt: "May 5",   thread: "talent" },
    { name: "Polaroids_Marta_x6.zip",              size: "8.4 MB", addedBy: "Marta Reyes",  addedAt: "Apr 14",  thread: "talent" },
  ],
  // c4 — Stella McCartney CANCELLED
  c4: [
    { name: "Stella_SS27_lookbook_brief.pdf",      size: "1.4 MB", addedBy: "Anna Bernard", addedAt: "Apr 18",  thread: "client" },
  ],
  // c5 — Loewe WRAPPED
  c5: [
    { name: "Loewe_capsule_brief.pdf",             size: "920 KB", addedBy: "Rocío Castro", addedAt: "Apr 8",   thread: "client" },
    { name: "Loewe_callsheet_apr18.pdf",           size: "210 KB", addedBy: "Sara Mendez",  addedAt: "Apr 15",  thread: "talent" },
    { name: "Loewe_selects_4_frames.zip",          size: "32 MB",  addedBy: "Rocío Castro", addedAt: "Apr 22",  thread: "client" },
    { name: "Receipt_Loewe_3600EUR.pdf",           size: "62 KB",  addedBy: "System",       addedAt: "Apr 25",  thread: "talent" },
  ],
  // c6 — Martina Beach Club INQUIRY
  c6: [
    { name: "Martina_BeachClub_brief_Sunday-models.pdf", size: "1.1 MB", addedBy: "Rafa Aragón",  addedAt: "1h ago",  thread: "client" },
    { name: "reference_5_looks.pdf",                     size: "3.6 MB", addedBy: "Sara Mendez",  addedAt: "1h ago",  thread: "talent" },
  ],
  // c7 — Solstice Festival BOOKED (Marta as coord)
  c7: [
    { name: "Solstice_crew_bios.pdf",              size: "1.8 MB", addedBy: "Marta Reyes",  addedAt: "May 26",  thread: "client" },
    { name: "Solstice_insurance_rider.pdf",        size: "220 KB", addedBy: "Bea Velasco",  addedAt: "May 28",  thread: "client" },
    { name: "Solstice_set_cuelist.pdf",            size: "142 KB", addedBy: "Anouk Naseri", addedAt: "May 28",  thread: "talent" },
  ],
  // c8 — Adidas REJECTED
  c8: [
    { name: "Adidas_dance_spec_brief.pdf",         size: "640 KB", addedBy: "Riku Vesa",    addedAt: "Apr 14",  thread: "client" },
    { name: "Counter_offer_v2_history.pdf",        size: "32 KB",  addedBy: "Sara Mendez",  addedAt: "Apr 18",  thread: "talent" },
  ],
  // c9 — Lyra Skincare EXPIRED (no files exchanged)
  c9: [
    { name: "Offer_v1_Lyra_pop-up_4h.pdf",         size: "44 KB",  addedBy: "Sara Mendez",  addedAt: "Apr 19",  thread: "client" },
  ],
  // c11 — Aesop NEW INQUIRY (just landed, never opened by Marta)
  c11: [
    { name: "Aesop_brief_skincare_editorial.pdf", size: "1.2 MB", addedBy: "Eun-jin Im", addedAt: "25m ago", thread: "client" },
    { name: "Aesop_visual_reference_4_looks.pdf", size: "3.4 MB", addedBy: "Sara Mendez", addedAt: "20m ago", thread: "talent" },
  ],
  // c12 — Lacoste NEW INQUIRY (just landed, never opened by Marta)
  c12: [
    { name: "Lacoste_SS27_brief_lookbook.pdf", size: "880 KB", addedBy: "Joana Rivera", addedAt: "10m ago", thread: "client" },
  ],
  // c10 — Atelier Noir BOOKED (Marta as coord, NDA workflow)
  c10: [
    { name: "Atelier_Noir_SS27_Booking.pdf",       size: "180 KB", addedBy: "Valeria Moss", addedAt: "Jun 10", thread: "client" },
    { name: "Atelier_Noir_NDA_v2.pdf",             size: "280 KB", addedBy: "Valeria Moss", addedAt: "Jun 14", thread: "client" },
    { name: "Marta_Reyes_NDA_signed.pdf",          size: "290 KB", addedBy: "Marta Reyes",  addedAt: "Jun 14", thread: "talent" },
    { name: "Nadia_Kohler_NDA_signed.pdf",         size: "285 KB", addedBy: "Nadia Köhler", addedAt: "Jun 15", thread: "talent" },
    { name: "Atelier_Noir_NDA_signed_bundle.zip",  size: "580 KB", addedBy: "Marta Reyes",  addedAt: "Jun 15", thread: "client" },
    { name: "Convento_da_Cartuxa_call_sheet.pdf",  size: "320 KB", addedBy: "Valeria Moss", addedAt: "Jun 28", thread: "talent" },
  ],
};

// ── Offer model ──────────────────────────────────────────────────────────
// One offer per inquiry. Has:
//   - clientBudget (what the client said they'd pay — amount + type)
//   - coordinators (up to 2)
//   - lineup rows (one per talent). Each row is private to that talent
//     unless you're admin or a coordinator.
//   - timeline (system events — also surfaced in Activity)
//
// Stage progression covers the full lifecycle from the spec:
//   no_offer → client_budget → awaiting_talent → talent_submitted →
//   coordinator_review → sent → reviewing → countered →
//   accepted | rejected | expired
//
type UnitType = "hour" | "day" | "contract" | "event";
type LineupRowStatus = "pending" | "submitted" | "approved" | "countered" | "declined";

type LineupRow = {
  id: string;
  talentId: string;
  talentName: string;
  initials: string;
  role: string;
  unitType: UnitType;
  units: number;
  costRate: number;       // what the talent gets
  clientRate: number;     // what the client pays for this row
  notes?: string;
  status: LineupRowStatus;
};

type CoordinatorRef = {
  id: string;
  name: string;
  initials: string;
  // If this coordinator is also one of the talents on the lineup, link them
  // so the UI can render "Talent + Coordinator" badge in their row.
  alsoTalentId?: string;
};

type ClientBudget = {
  amount: number;
  unitType: UnitType;
  currency: string;
  // Free-form note (e.g. "negotiable", "incl. travel"), surfaces under the budget.
  note?: string;
};

type OfferStage =
  | "no_offer"            // client hasn't named a budget yet
  | "client_budget"       // client posted budget, no offer drafted yet
  | "awaiting_talent"     // talent rates pending
  | "talent_submitted"    // talent has submitted; coordinator hasn't shaped final yet
  | "coordinator_review"  // coordinator finalizing
  | "sent"                // sent to client
  | "reviewing"           // client opened, hasn't acted
  | "countered"           // someone countered (talent or client)
  | "accepted"            // accepted
  | "rejected"
  | "expired";

type TimelineEvent = {
  id: string;
  ts: string;             // "Apr 28 · 14:30"
  actor: string;          // who did it
  body: string;           // what happened (plain copy)
  tone?: "default" | "success" | "warn" | "info";
};

type Offer = {
  conversationId: string;
  stage: OfferStage;
  clientBudget?: ClientBudget;   // optional — client may not have named one yet
  agencyFee: number;             // workspace fee on top of talent costs
  coordinatorPct: number;        // % the coordinator(s) keep from agency fee
  coordinators: CoordinatorRef[];// 1–2 coordinators
  rows: LineupRow[];
  timeline: TimelineEvent[];
  expiresInHours?: number;
};

const MOCK_OFFER_FOR_CONV: Record<string, Offer> = {
  c1: {
    conversationId: "c1",
    stage: "coordinator_review",
    clientBudget: { amount: 2500, unitType: "day", currency: "EUR", note: "Cap per talent · negotiable on usage" },
    agencyFee: 600,
    coordinatorPct: 50,
    expiresInHours: 24,
    coordinators: [
      { id: "co-sara", name: "Sara Bianchi", initials: "SB" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead model · Spring lookbook",
        unitType: "day", units: 1, costRate: 2400, clientRate: 2900,
        notes: "Full editorial, 1 day Madrid", status: "submitted" },
      { id: "r2", talentId: "t-tomas", talentName: "Tomás Núñez", initials: "TN",
        role: "Supporting model",
        unitType: "day", units: 1, costRate: 2200, clientRate: 2600,
        status: "submitted" },
      { id: "r3", talentId: "t-zara", talentName: "Zara Hadid", initials: "ZH",
        role: "Beauty close-ups",
        unitType: "day", units: 1, costRate: 1800, clientRate: 2100,
        notes: "Rate not yet confirmed", status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 28 · 10:14", actor: "Joana (client)", body: "Submitted inquiry · €2,500/day cap", tone: "info" },
      { id: "t2", ts: "Apr 28 · 11:02", actor: "System",         body: "Sara assigned as coordinator" },
      { id: "t3", ts: "Apr 28 · 14:30", actor: "Marta",          body: "Submitted rate · €2,400/day", tone: "success" },
      { id: "t4", ts: "Apr 28 · 16:11", actor: "Tomás",          body: "Submitted rate · €2,200/day", tone: "success" },
    ],
  },
  c2: {
    conversationId: "c2",
    stage: "awaiting_talent",
    clientBudget: { amount: 5000, unitType: "contract", currency: "EUR", note: "3-day total contract · jewelry editorial" },
    agencyFee: 800,
    coordinatorPct: 40,
    coordinators: [
      { id: "co-sara", name: "Sara Bianchi", initials: "SB" },
      { id: "co-marco", name: "Marco Pellegrini", initials: "MP" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Editorial · Bvlgari jewelry",
        unitType: "contract", units: 1, costRate: 0, clientRate: 0,
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 26 · 09:00", actor: "Joana (client)", body: "Hold opened · €5,000 total contract" },
      { id: "t2", ts: "Apr 26 · 09:14", actor: "System",         body: "Marta invited · awaiting rate" },
    ],
  },
  // c3 — Vogue Italia · BOOKED. Marta is the talent (NOT coord;
  // Ana Vega coordinates this from Acme Models). Offer accepted Apr 12,
  // contract signed same day, polaroids approved Apr 14, on set
  // May 14–15. Two-talent shoot — Emma Ricci is on the lineup too.
  c3: {
    conversationId: "c3",
    stage: "accepted",
    clientBudget: { amount: 10000, unitType: "contract", currency: "EUR", note: "2-day editorial · cover + spread · 12mo EU usage" },
    agencyFee: 1200,
    coordinatorPct: 40,
    coordinators: [
      { id: "co-ana", name: "Ana Vega", initials: "AV" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · cover + editorial spread",
        unitType: "contract", units: 1, costRate: 4000, clientRate: 5800,
        notes: "2 days on set · Madrid → Milan travel covered",
        status: "approved" },
      { id: "r2", talentId: "t-emma", talentName: "Emma Ricci", initials: "ER",
        role: "Co-talent · editorial spread",
        unitType: "contract", units: 1, costRate: 3000, clientRate: 4200,
        notes: "Praline London representation",
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 8 · 14:00",  actor: "Francesca (Vogue)", body: "Inquiry opened · €10k total · 2-day editorial", tone: "info" },
      { id: "t2", ts: "Apr 9 · 11:30",  actor: "Ana Vega",          body: "Marta + Emma proposed · rates submitted" },
      { id: "t3", ts: "Apr 10 · 16:00", actor: "Vogue Italia",      body: "Approved both talents · contract drafted" },
      { id: "t4", ts: "Apr 12 · 14:01", actor: "System",            body: "Booking accepted · contract signed", tone: "success" },
    ],
  },

  // c4 — Stella McCartney · CANCELLED (campaign moved to Q3). Hold
  // released Apr 30, never reached "sent" stage. Kept on the books so
  // the talent can review what was offered when it re-opens in Q3.
  c4: {
    conversationId: "c4",
    stage: "expired",
    clientBudget: { amount: 2200, unitType: "day", currency: "EUR", note: "Single day · SS27 lookbook · Paris" },
    agencyFee: 350,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-anna", name: "Anna Bernard", initials: "AB" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lookbook · single day",
        unitType: "day", units: 1, costRate: 1800, clientRate: 2200,
        status: "submitted" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 18 · 10:00", actor: "Stella's team", body: "Hold opened · May 14 · €2,200/day cap", tone: "info" },
      { id: "t2", ts: "Apr 18 · 11:30", actor: "Marta Reyes",   body: "Held · ready to confirm on lock" },
      { id: "t3", ts: "Apr 22 · 09:18", actor: "Anna Bernard",  body: "Stella's team finalising wardrobe + creative" },
      { id: "t4", ts: "1d 12h ago",     actor: "System",        body: "Stella McCartney cancelled · campaign moved to Q3", tone: "warn" },
    ],
  },

  // c5 — Loewe · WRAPPED. Single-day capsule editorial at ESTUDIO ROCA,
  // 2 talents (Marta + Diego). Paid in full Apr 25. Past stage doesn't
  // surface this tab to talent (Booking + Payment cover it) but admin
  // and coords can audit.
  c5: {
    conversationId: "c5",
    stage: "accepted",
    clientBudget: { amount: 7000, unitType: "contract", currency: "EUR", note: "1 day · capsule editorial · 2 talent" },
    agencyFee: 900,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-rocio", name: "Rocío Castro", initials: "RC" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · capsule editorial",
        unitType: "day", units: 1, costRate: 3200, clientRate: 4000,
        status: "approved" },
      { id: "r2", talentId: "t-diego", talentName: "Diego Albarracín", initials: "DA",
        role: "Co-talent · capsule editorial",
        unitType: "day", units: 1, costRate: 2400, clientRate: 3000,
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 4 · 11:00",  actor: "Loewe team",   body: "Direct booking · 2 talents · €7k contract", tone: "info" },
      { id: "t2", ts: "Apr 5 · 09:30",  actor: "Rocío Castro", body: "Marta + Diego proposed · standard ESTUDIO ROCA setup" },
      { id: "t3", ts: "Apr 7 · 14:00",  actor: "Loewe team",   body: "Approved · contract sent" },
      { id: "t4", ts: "Apr 8 · 11:00",  actor: "System",       body: "Booking accepted · call sheet shared", tone: "success" },
      { id: "t5", ts: "Apr 18 · 17:30", actor: "System",       body: "Wrapped · selects approved Apr 22", tone: "success" },
      { id: "t6", ts: "Apr 25 · 09:14", actor: "System",       body: "Invoice cleared · €3,200 transferred to Marta", tone: "success" },
    ],
  },

  // c6 — Martina Beach Club · INQUIRY. New Tulala Hub client. Brief
  // landed an hour ago — Marta hasn't quoted yet. The "submit my rate"
  // CTA sits on the Offer tab until she puts a number in.
  c6: {
    conversationId: "c6",
    stage: "awaiting_talent",
    clientBudget: { amount: 2800, unitType: "day", currency: "EUR", note: "Sunday models · sunset series · 4 dates" },
    agencyFee: 420,
    coordinatorPct: 50,
    expiresInHours: 48,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · Sunday models · sunset",
        unitType: "day", units: 1, costRate: 0, clientRate: 0,
        notes: "Hotel covered (1 night) · golden-hour shoot · first of 4 dates",
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "1h ago", actor: "Martina González", body: "Inquiry submitted via Tulala Hub · €2,800/day cap", tone: "info" },
      { id: "t2", ts: "1h ago", actor: "System",           body: "Routed to Acme Models · Sara assigned" },
      { id: "t3", ts: "1h ago", actor: "Sara Mendez",      body: "Marta invited · awaiting rate" },
    ],
  },

  // c7 — Solstice Festival · BOOKED. Marta is COORDINATOR (Reyes
  // Movement Studio). Three dancers — Marta + Tariq + Anouk — for the
  // closing performance. Multi-row offer reflects the crew. Marta's
  // workspace keeps the full margin (her own studio).
  c7: {
    conversationId: "c7",
    stage: "accepted",
    clientBudget: { amount: 7500, unitType: "contract", currency: "EUR", note: "8-min closing set · 3 dancers · main stage" },
    agencyFee: 900,
    coordinatorPct: 100,
    coordinators: [
      { id: "co-marta", name: "Marta Reyes", initials: "MR", alsoTalentId: currentTalentId() },
      { id: "co-cleo",  name: "Cleo Vega",   initials: "CV" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead dancer + coordinator",
        unitType: "event", units: 1, costRate: 2400, clientRate: 2800,
        notes: "Coord margin captured separately via Reyes Movement Studio",
        status: "approved" },
      { id: "r2", talentId: "t-tariq", talentName: "Tariq Joubert", initials: "TJ",
        role: "Fire dancer · poi",
        unitType: "event", units: 1, costRate: 2100, clientRate: 2400,
        status: "approved" },
      { id: "r3", talentId: "t-anouk", talentName: "Anouk Naseri", initials: "AN",
        role: "Fire dancer · choreography lead",
        unitType: "event", units: 1, costRate: 2100, clientRate: 2300,
        notes: "Choreo finalised · cue list shared",
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "May 25 · 11:04", actor: "Bea Velasco (Solstice)", body: "Direct booking · €7,500 · 3 dancers · Cala Llonga main stage", tone: "info" },
      { id: "t2", ts: "May 25 · 12:30", actor: "Marta Reyes",            body: "Crew proposed · Marta + Tariq + Anouk · €7,500 covers all" },
      { id: "t3", ts: "May 26 · 18:20", actor: "Marta Reyes",            body: "Crew bios + 30s clips uploaded for festival approval" },
      { id: "t4", ts: "May 28 · 09:00", actor: "Solstice",               body: "Approved all 3 · insurance + rider attached", tone: "success" },
      { id: "t5", ts: "May 28 · 09:01", actor: "System",                 body: "Booking locked · Sat Jun 21 · 22:30 stage time", tone: "success" },
    ],
  },

  // c8 — Adidas Originals · CANCELLED (counter rejected). Negotiation
  // sequence: Sara quoted €2,400, Riku countered €1,500, Sara
  // re-countered €1,800, Adidas held at €1,400 + buyout. Closed after
  // 3 rounds. Offer history kept so Marta sees the full trail when
  // she re-opens.
  c8: {
    conversationId: "c8",
    stage: "rejected",
    clientBudget: { amount: 1400, unitType: "day", currency: "EUR", note: "Final cap · global usage · 12mo" },
    agencyFee: 240,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Featured dancer · spec reel",
        unitType: "day", units: 1, costRate: 1800, clientRate: 2400,
        notes: "Counter v3 · held the line on global usage; Adidas declined",
        status: "declined" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 14 · 09:00", actor: "Riku Vesa (Adidas)", body: "Inquiry · 3–4 dancers · global digital + paid social", tone: "info" },
      { id: "t2", ts: "Apr 14 · 13:00", actor: "Sara Mendez",        body: "v1 quote · €2,400/day · global 12mo usage" },
      { id: "t3", ts: "Apr 16 · 14:30", actor: "Riku Vesa",          body: "Counter · €1,500/day · budget tighter than expected", tone: "warn" },
      { id: "t4", ts: "Apr 16 · 14:45", actor: "Sara Mendez",        body: "v2 counter · €1,800/day · holding global" },
      { id: "t5", ts: "Apr 18 · 10:00", actor: "Riku Vesa",          body: "v3 cap · €1,400 + buyout · final from Adidas", tone: "warn" },
      { id: "t6", ts: "4d ago",         actor: "System",             body: "Closed · €1,400 doesn't pencil for global · they went elsewhere", tone: "warn" },
    ],
  },

  // c9 — Lyra Skincare · EXPIRED. Cold email, unverified brand, never
  // responded after Sara's quote. Auto-closed after 14d silence.
  c9: {
    conversationId: "c9",
    stage: "expired",
    clientBudget: { amount: 600, unitType: "event", currency: "EUR", note: "4h hostess slot · BCN pop-up" },
    agencyFee: 100,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Hostess · 4h pop-up",
        unitType: "event", units: 1, costRate: 500, clientRate: 600,
        notes: "Outside Marta's usual lane but agreed for the right number",
        status: "submitted" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 18 · 16:00", actor: "Lyra (cold)", body: "Inquiry via cold email · brand unverified", tone: "warn" },
      { id: "t2", ts: "Apr 19 · 09:00", actor: "Sara Mendez", body: "v1 quote sent · €600 for 4h · standard rate" },
      { id: "t3", ts: "Apr 26 · 10:00", actor: "System",      body: "Reminder sent · no client reply in 7 days" },
      { id: "t4", ts: "10d ago",        actor: "System",      body: "Auto-closed · no response in 14 days", tone: "warn" },
    ],
  },

  // c11 — Aesop · NEW INQUIRY (just landed). Aesop posted a €3,200/day
  // budget; Marta hasn't quoted yet. The talent row sits in "pending"
  // so the Offer tab renders her per-row Submit-rate button + the
  // empty-state guard falls through (offer exists, just awaiting talent).
  c11: {
    conversationId: "c11",
    stage: "awaiting_talent",
    clientBudget: { amount: 3200, unitType: "day", currency: "EUR", note: "Single day · skincare editorial · full editorial usage" },
    agencyFee: 480,
    coordinatorPct: 50,
    expiresInHours: 36,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · skincare editorial",
        unitType: "day", units: 1, costRate: 0, clientRate: 0,
        notes: "Aesop asked for editorial-trained talent · brand-new client",
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "30m ago", actor: "Eun-jin Im (Aesop)", body: "Inquiry · €3,200/day · single day Berlin · 12mo editorial usage", tone: "info" },
      { id: "t2", ts: "27m ago", actor: "System",             body: "Routed to Acme Models · Sara assigned" },
      { id: "t3", ts: "25m ago", actor: "Sara Mendez",        body: "Marta invited · awaiting rate" },
    ],
  },

  // c12 — Lacoste · NEW INQUIRY (just landed). Direct via the Acme
  // roster page; Lacoste's brand manager Joana set a €2,400/day cap
  // for 2 days. Marta has not submitted a rate yet.
  c12: {
    conversationId: "c12",
    stage: "awaiting_talent",
    clientBudget: { amount: 2400, unitType: "day", currency: "EUR", note: "2 days · SS27 sportswear · €2,400/day per talent" },
    agencyFee: 600,
    coordinatorPct: 50,
    expiresInHours: 72,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · SS27 sportswear lookbook",
        unitType: "day", units: 2, costRate: 0, clientRate: 0,
        notes: "Direct inbound · Lacoste saw your Mango lookbook",
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "10m ago", actor: "Joana Rivera (Lacoste)", body: "Inquiry · €2,400/day · 2 days Lisbon · pre-qualified", tone: "info" },
      { id: "t2", ts: "9m ago",  actor: "Sara Mendez",            body: "Direct route — Marta invited · awaiting rate" },
    ],
  },

  // c10 — Atelier Noir Bridal · BOOKED. Marta is COORDINATOR. Two
  // talents: Marta + Nadia Köhler. Returning client (Atelier shot with
  // Reyes Movement Studio last year) — booked at +5% YoY.
  c10: {
    conversationId: "c10",
    stage: "accepted",
    clientBudget: { amount: 11200, unitType: "contract", currency: "EUR", note: "2 days · 2 talents · €2,800/day each · couture exclusivity" },
    agencyFee: 1400,
    coordinatorPct: 100,
    coordinators: [
      { id: "co-marta", name: "Marta Reyes", initials: "MR", alsoTalentId: currentTalentId() },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · bridal SS27 + coordinator",
        unitType: "day", units: 2, costRate: 2800, clientRate: 3200,
        notes: "Returning rate · +5% year-over-year",
        status: "approved" },
      { id: "r2", talentId: "t-nadia", talentName: "Nadia Köhler", initials: "NK",
        role: "Co-talent · bridal SS27",
        unitType: "day", units: 2, costRate: 2800, clientRate: 3200,
        notes: "Reyes Movement Studio representation · NDA signed Jun 15",
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "Jun 8 · 14:04",  actor: "Valeria Moss (Atelier)", body: "Returning client · 2 days · 2 talents · couture", tone: "info" },
      { id: "t2", ts: "Jun 8 · 16:18",  actor: "Marta Reyes",             body: "Crew proposed · Marta + Nadia · €2,800/day each (+5% YoY)" },
      { id: "t3", ts: "Jun 9 · 10:00",  actor: "Atelier Noir",            body: "Approved both rates · booking confirmation incoming", tone: "success" },
      { id: "t4", ts: "Jun 10 · 11:00", actor: "System",                  body: "Booking accepted · contract signed", tone: "success" },
      { id: "t5", ts: "Jun 15 · 15:30", actor: "Marta Reyes",             body: "NDA bundle uploaded · both talents signed" },
    ],
  },
};

// Workspace RichInquiry IDs (RI-XXX) reuse the same offer fixtures so the
// admin shell renders rich content. Aliasing happens at lookup time so the
// per-id mocks above stay readable.
const RICH_OFFER_ALIAS: Record<string, string> = {
  "RI-201": "c1",  // Mango · Spring lookbook (coordinator review)
  "RI-202": "c2",  // Bvlgari (awaiting talent rates)
  "RI-203": "c3",  // Vogue Italia · BOOKED (offer accepted)
};
function getOffer(id: string): Offer | undefined {
  // Reads through the module-level override store so mutations made
  // by any pov (talent submits rate, client approves, admin sends to
  // client) appear in every other shell that views the same offer.
  const directKey = MOCK_OFFER_FOR_CONV[id] ? id : RICH_OFFER_ALIAS[id];
  if (!directKey) return undefined;
  return getEffectiveOffer(directKey);
}

// ── OfferTab ──
type OfferPov =
  | { kind: "admin" }
  | { kind: "client" }
  | { kind: "talent"; talentId: string; isCoordinator: boolean };

const STAGE_LABEL: Record<OfferStage, { label: string; tone: string; bg: string; clientLabel?: string }> = {
  no_offer:           { label: "No offer yet",         tone: COLORS.inkMuted,    bg: "rgba(11,11,13,0.05)" },
  client_budget:      { label: "Budget submitted",     tone: COLORS.indigoDeep,  bg: COLORS.indigoSoft, clientLabel: "Sent · awaiting team" },
  awaiting_talent:    { label: "Awaiting talent",      tone: COLORS.coral,       bg: COLORS.coralSoft,  clientLabel: "Team building offer" },
  talent_submitted:   { label: "Talent submitted",     tone: COLORS.indigoDeep,  bg: COLORS.indigoSoft, clientLabel: "Team building offer" },
  coordinator_review: { label: "Coordinator review",   tone: COLORS.indigoDeep,  bg: COLORS.indigoSoft, clientLabel: "Team building offer" },
  sent:               { label: "Sent to client",       tone: COLORS.accentDeep,  bg: COLORS.accentSoft, clientLabel: "Awaiting your decision" },
  reviewing:          { label: "Client reviewing",     tone: COLORS.accentDeep,  bg: COLORS.accentSoft, clientLabel: "You're reviewing" },
  countered:          { label: "Counter received",     tone: COLORS.amberDeep,   bg: COLORS.amberSoft,  clientLabel: "Counter sent" },
  accepted:           { label: "Accepted",             tone: COLORS.successDeep, bg: COLORS.successSoft, clientLabel: "Accepted" },
  rejected:           { label: "Rejected",             tone: COLORS.coralDeep,   bg: COLORS.coralSoft,   clientLabel: "Declined" },
  expired:            { label: "Expired",              tone: COLORS.inkMuted,    bg: "rgba(11,11,13,0.05)", clientLabel: "Expired" },
};

const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  hour:     "/hour",
  day:      "/day",
  contract: "total contract",
  event:    "/event",
};

function fmtMoney(n: number, currency: string) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function rowSubtotal(r: LineupRow, side: "cost" | "client") {
  const rate = side === "cost" ? r.costRate : r.clientRate;
  return rate * (r.units || 0);
}

// What's the next single thing this user needs to do? Drives the sticky
// action bar at the top of the Offer tab — "what do I do now?" not
// "every possible field at once" (per spec §11).
function nextActionFor(offer: Offer, pov: OfferPov): { label: string; cta?: string; ctaTone?: "primary" | "success"; secondary?: string; subtle?: boolean } {
  const s = offer.stage;
  // Coord first name powers personalized active-state copy. Falls
  // back to "the coordinator" so messages stay grammatical when no
  // coord is set (rare — most fixtures have one).
  const coord = offer.coordinators[0]?.name?.split(" ")[0] ?? "the coordinator";
  // Pull the freshest closure-tone timeline entry. When the offer is
  // dead, this carries the actual reason ("campaign moved to Q3",
  // "no response in 14 days") so we can show *why* it closed instead
  // of a generic "expired". Strips any leading closure-verb prefix
  // ("Closed · ", "Auto-closed · ", "Cancelled · ") so the next
  // template can re-prepend "Closed · " without duplicating.
  const closureEvt = [...offer.timeline].reverse().find(e => e.tone === "warn");
  const closureWhy = closureEvt
    ? closureEvt.body.replace(
        /^(?:auto-?closed|closed|cancelled|canceled|rejected|expired)\s*[·:—-]?\s*/i,
        "",
      ).trim()
    : null;

  if (pov.kind === "client") {
    if (s === "no_offer")          return { label: "Add a budget so the team can shape your offer.", cta: "Add budget", ctaTone: "primary" };
    if (s === "client_budget")     return { label: "Budget sent — the agency is shaping your offer now.", subtle: true };
    if (s === "awaiting_talent" || s === "talent_submitted" || s === "coordinator_review")
                                   return { label: `${coord} is locking in talent rates · we'll ping when it's ready.`, subtle: true };
    if (s === "sent" || s === "reviewing")
                                   return { label: "Offer's ready for you · approve, request a change, or counter.", cta: "Approve", ctaTone: "success", secondary: "Request change" };
    if (s === "countered")         return { label: "Counter in flight · agency reviewing.", subtle: true };
    if (s === "accepted")          return { label: "Booked · call sheet on its way.", subtle: true };
    if (s === "rejected")          return { label: closureWhy ? `Offer closed · ${closureWhy}` : "Offer closed · the talent didn't accept.", subtle: true };
    if (s === "expired")           return { label: closureWhy ? `Offer closed · ${closureWhy}` : "Offer closed · response window ran out.", subtle: true };
  }

  if (pov.kind === "talent") {
    const myRow = offer.rows.find(r => r.talentId === pov.talentId);
    // ── Terminal stages first ─────────────────────────────────────
    // Once an offer is dead the row's pending/submitted status is
    // stale — the message should explain *why* it closed, not invite
    // a stale action. closureWhy pulls the human reason from the
    // timeline ("campaign moved to Q3", "auto-closed · 14 days").
    if (s === "rejected") {
      const base = myRow?.status === "declined"
        ? "Client wouldn't budge on price"
        : "Client passed on the offer";
      return { label: closureWhy ? `Closed · ${closureWhy}` : `Closed · ${base}.`, subtle: true };
    }
    if (s === "expired") {
      return { label: closureWhy ? `Closed · ${closureWhy}` : "Auto-closed · client never circled back.", subtle: true };
    }
    // ── Active stages, ordered by talent's row state ──────────────
    if (myRow?.status === "pending") {
      // Inquiry has a published cap → "match the cap" wording.
      // Otherwise the talent is opening the negotiation.
      const cap = offer.clientBudget ? "Drop your rate so we can move." : "Open the conversation with your rate.";
      return { label: cap, cta: "Submit my rate", ctaTone: "primary" };
    }
    if (myRow?.status === "submitted" && (s === "talent_submitted" || s === "coordinator_review" || s === "awaiting_talent")) {
      return { label: `Rate received · ${coord} is finalizing before showing the client.`, subtle: true };
    }
    if (myRow?.status === "submitted" && (s === "sent" || s === "reviewing")) {
      return {
        label: offer.expiresInHours !== undefined && offer.expiresInHours <= 24
          ? `Client has the offer · they have ${offer.expiresInHours}h to decide.`
          : "Client has the offer · expecting a decision soon.",
        subtle: true,
      };
    }
    if (myRow?.status === "submitted") return { label: "Rate is in · standing by.", subtle: true };
    if (myRow?.status === "approved")  return { label: "Booked · contract signed and locked.", subtle: true };
    if (myRow?.status === "countered") {
      return {
        label: "Client wants to negotiate · review their counter and decide.",
        cta: "Review counter", ctaTone: "primary",
        secondary: "Hold firm",
      };
    }
    if (myRow?.status === "declined")  return { label: "You declined this offer · job's closed on your end.", subtle: true };
    if (pov.isCoordinator)             return { label: "Shape the final offer and send it to the client.", cta: "Send to client", ctaTone: "primary" };
  }

  // ── Admin / coordinator workspace pov ──
  if (s === "no_offer" || s === "client_budget") return { label: "Invite talent and gather rates to start the offer.", cta: "Add talent", ctaTone: "primary" };
  if (s === "awaiting_talent") {
    const pending = offer.rows.filter(r => r.status === "pending").length;
    return {
      label: pending > 0
        ? `Waiting on ${pending} talent rate${pending === 1 ? "" : "s"} · ping them if it's been a while.`
        : "Waiting on talent rates.",
      cta: pending > 0 ? "Nudge talent" : undefined,
      ctaTone: "primary",
      subtle: pending === 0,
    };
  }
  if (s === "talent_submitted" || s === "coordinator_review")
                                                 return { label: "All rates in · review margins and send to client.", cta: "Send to client", ctaTone: "primary" };
  if (s === "sent" || s === "reviewing")         return { label: "Offer with client · awaiting their decision.", subtle: true };
  if (s === "countered")                         return { label: "Client countered · review with talent and respond.", cta: "Review counter", ctaTone: "primary" };
  if (s === "accepted")                          return { label: "Accepted · build the call sheet to lock the booking.", cta: "Call sheet", ctaTone: "success" };
  if (s === "rejected")                          return { label: closureWhy ? `Closed · ${closureWhy}` : "Closed · client rejected.", subtle: true };
  if (s === "expired")                           return { label: closureWhy ? `Closed · ${closureWhy}` : "Closed · response window ran out.", subtle: true };
  return { label: "—", subtle: true };
}

function OfferTab({ conv, pov }: { conv: Conversation; pov: OfferPov }) {
  const { toast } = useProto();
  const baseOffer = getOffer(conv.id);
  const isClient = pov.kind === "client";
  const isAdmin = pov.kind === "admin";
  const isTalent = pov.kind === "talent";
  const canSeeFullCommerce = isAdmin || (isTalent && pov.isCoordinator);
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
    if (isTalent) {
      return (
        <div style={{ padding: 18, fontFamily: FONTS.body }}>
          <div style={{
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: RADIUS.md, padding: 16,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>Submit your rate</div>
            <div style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              The coordinator is waiting on your number. You'll see the agency
              fee + platform fee deducted before take-home — quote what you
              actually need to walk out with, plus a small margin for usage.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => toast("No client budget yet — sending rate request to coordinator…")} style={primaryBtn(COLORS.accent)}>
                Ask coordinator to set the brief
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding: 24, textAlign: "center", color: COLORS.inkDim, fontFamily: FONTS.body, fontSize: 13 }}>
        No offer yet for this inquiry.
        {isAdmin && (
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => toast("Offer drafting…")} style={primaryBtn(COLORS.accent)}>
              Start drafting offer
            </button>
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
  const stageLabel = isClient && stage.clientLabel ? stage.clientLabel : stage.label;
  const next = nextActionFor(offer, pov);
  const currency = offer.clientBudget?.currency ?? "EUR";

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
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
          <span style={{ fontSize: 11, color: COLORS.coral, fontWeight: 600 }}>
            ⏱ {offer.expiresInHours}h
          </span>
        )}
        <span style={{ fontSize: 12, color: next.subtle ? COLORS.inkMuted : COLORS.ink, flex: 1, minWidth: 140 }}>
          {next.label}
        </span>
        {next.secondary && (
          <button type="button" onClick={() => toast(`${next.secondary} sent`)} style={ghostBtn()}>
            {next.secondary}
          </button>
        )}
        {next.cta && (
          <button
            type="button"
            onClick={() => {
              // Talent rate-related CTAs open the real sheet instead
              // of toasting. Everything else still uses the toast stub.
              if (isTalent && (next.cta === "Submit my rate" || next.cta === "Review counter")) {
                setRateSheetMode(next.cta === "Review counter" ? "edit" : "submit");
                setRateSheetOpen(true);
                return;
              }
              toast(`${next.cta}`);
            }}
            style={primaryBtn(next.ctaTone === "success" ? COLORS.success : COLORS.accent)}
          >
            {next.cta}
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
        onEditBudget={() => toast("Edit budget")}
      />

      {/* ── B. Participants ──────────────────────────────────── */}
      <SectionHeader title="Who's running this" subtitle={isClient ? "Your point of contact." : `${offer.coordinators.length} coordinator${offer.coordinators.length === 1 ? "" : "s"} · ${offer.rows.length} talent${offer.rows.length === 1 ? "" : "s"}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {offer.coordinators.map(c => (
          <ParticipantRow
            key={c.id}
            initials={c.initials}
            name={c.name}
            role="Coordinator"
            tone="royal"
            note={c.alsoTalentId ? "Also booked as talent" : undefined}
          />
        ))}
        {isAdmin && offer.coordinators.length < 2 && (
          <button type="button" onClick={() => toast("Add coordinator")} style={dashedBtn("Add coordinator (max 2)")}>
            + Add coordinator
          </button>
        )}
      </div>

      {/* ── C. Lineup & rates — privacy-aware ─────────────────── */}
      <SectionHeader
        title="Lineup &amp; rates"
        subtitle={
          isClient
            ? "Talent we're proposing for your booking."
            : isTalent && !pov.isCoordinator
              ? "Your private rate. Other talent rates are not visible to you."
              : "Per-talent rates. Each talent sets their own — only coordinators see the full lineup."
        }
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            onWithdraw={() => {
              // Module-level override → visible everywhere immediately:
              // status pill flips to "Declined", per-row actions
              // collapse, sticky-bar copy advances, and the inbox /
              // header rate fall back to "—" since the row's costRate
              // is gone (well, kept for reference but status declined
              // suppresses display).
              setRowOverride(conv.id, r.id, {
                status: "declined",
                notes: "Withdrew offer · coordinator notified",
              });
              toast("Rate withdrawn · coordinator notified");
            }}
          />
        ))}
        {isAdmin && (
          <button type="button" onClick={() => toast("Invite talent")} style={dashedBtn("Invite talent")}>
            + Invite talent
          </button>
        )}
      </div>

      {/* ── Agency fee — admin/coordinator only ──────────────── */}
      {canSeeFullCommerce && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: COLORS.surfaceAlt, fontSize: 12.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: COLORS.inkMuted }}>Agency fee</span>
            <span style={{ fontWeight: 600, color: COLORS.ink }}>{fmtMoney(offer.agencyFee, currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: COLORS.inkMuted }}>Coordinator share ({offer.coordinatorPct}% of fee)</span>
            <span style={{ fontWeight: 600, color: COLORS.ink }}>{fmtMoney(offer.agencyFee * offer.coordinatorPct / 100, currency)}</span>
          </div>
        </div>
      )}

      {/* #20 — Pricing transparency for client. Premium feel: when an
          offer is on the table, client sees a clean breakdown of what
          they're paying for. Talent rates collapse to a single line
          (privacy intact) but the rest is itemized. Builds trust. */}
      {isClient && offer.stage !== "no_offer" && offer.stage !== "client_budget" && (
        <>
          <SectionHeader title="What you're paying for" subtitle="Transparent breakdown — no surprises." />
          <div style={{
            background: "#fff", borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            padding: "14px 16px", fontFamily: FONTS.body, fontSize: 13,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: COLORS.inkMuted }}>Talent fees ({offer.rows.length} {offer.rows.length === 1 ? "talent" : "talent"})</span>
              <span style={{ fontWeight: 600, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(offer.rows.reduce((s, r) => s + rowSubtotal(r, "client"), 0), currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: COLORS.inkMuted }}>Agency service fee</span>
              <span style={{ fontWeight: 600, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(offer.agencyFee, currency)}
              </span>
            </div>
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: COLORS.ink, fontWeight: 600 }}>Total</span>
              <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, color: COLORS.accent, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(totalRevenue, currency)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 4, lineHeight: 1.5 }}>
              Includes coordination, scheduling, contract handling, and post-shoot support. Tax/VAT shown on final invoice.
            </div>
          </div>
        </>
      )}

      {/* ── D. Activity timeline ─────────────────────────────── */}
      <SectionHeader title="Activity" subtitle="Same events surface in the chat thread." />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {offer.timeline.map((e, i) => (
          <TimelineRow key={e.id} event={e} last={i === offer.timeline.length - 1} />
        ))}
      </div>

      {/* Privacy footer for non-coordinator talent */}
      {isTalent && !pov.isCoordinator && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: COLORS.indigoSoft, color: COLORS.indigoDeep,
          fontSize: 11.5, lineHeight: 1.5,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </span>
          You only see your own offer. Other talents' rates and the agency's commercial breakdown are private.
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
            // tile, and the offer tab itself. Survives tab switches.
            const myRow = offer.rows.find(r => r.talentId === pov.talentId);
            if (!myRow) return;
            setRowOverride(conv.id, myRow.id, {
              costRate: data.amount,
              units: data.units,
              unitType: data.unitType,
              notes: data.notes || myRow.notes,
              status: "submitted",
            });
          }}
        />
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: 4 }}>
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

// ── DealSummaryCard ──
// Single hero summary that replaces the prior 3-tile grid. Tells a
// coherent money-story per POV:
//
//   talent (non-coord): "Your take-home: €X" + tiny context strip
//   talent (coord):     "Total offer: €X · your slice €Y" + budget
//   client:             "Proposed total: €X" + cap context
//   admin:              "Total / Cost / Margin" all visible
//
// Layout: hero number (huge, color-themed) + status chip + 2-col
// "deal context" rows underneath. One card. One story. No ambiguity.
function DealSummaryCard({
  offer, pov, totalCost, totalRevenue, totalMargin, currency, onEditBudget,
}: {
  offer: Offer;
  pov: OfferPov;
  totalCost: number;
  totalRevenue: number;
  totalMargin: number;
  currency: string;
  onEditBudget: () => void;
}) {
  const isClient = pov.kind === "client";
  const isAdmin = pov.kind === "admin";
  const isTalent = pov.kind === "talent";
  const isOfferLive = offer.stage !== "no_offer" && offer.stage !== "client_budget";

  // Resolve hero data per POV. The "hero" is the single number this
  // viewer cares about most — splash it big and let everything else
  // be context underneath.
  const myRow = isTalent ? offer.rows.find(r => r.talentId === pov.talentId) : null;
  type HeroSpec = { label: string; value: string; unit: string; tone: "accent" | "success" | "ink"; subtitle?: string };
  const hero: HeroSpec = (() => {
    if (isTalent && myRow) {
      const myTotal = rowSubtotal(myRow, "cost");
      return {
        label: "Your take-home",
        value: myRow.costRate ? fmtMoney(myTotal, currency) : "Not set",
        unit: myRow.costRate ? `${myRow.units} × ${UNIT_TYPE_LABEL[myRow.unitType]}` : "Submit your rate to see this",
        tone: "accent",
        subtitle: myRow.costRate
          ? (offer.stage === "accepted" ? "Confirmed · paid 14d after wrap"
            : offer.stage === "sent" ? "Sent to client · awaiting decision"
            : offer.stage === "countered" ? "Client countered · review the offer"
            : offer.stage === "talent_submitted" ? "Submitted · coordinator finalizing"
            : "Awaiting send")
          : undefined,
      };
    }
    if (isClient) {
      return {
        label: "Proposed total",
        value: isOfferLive ? fmtMoney(totalRevenue, currency) : "—",
        unit: offer.clientBudget ? UNIT_TYPE_LABEL[offer.clientBudget.unitType] : "",
        tone: "accent",
        subtitle: !isOfferLive
          ? "Add a budget so the team can build your offer"
          : `${offer.rows.length} talent · ${offer.coordinators.length} coordinator${offer.coordinators.length === 1 ? "" : "s"}`,
      };
    }
    return {
      label: "Offer total",
      value: isOfferLive ? fmtMoney(totalRevenue, currency) : "—",
      unit: offer.clientBudget ? UNIT_TYPE_LABEL[offer.clientBudget.unitType] : "",
      tone: "accent",
      subtitle: isOfferLive ? `${offer.rows.length} talent on the lineup` : "Build the offer to send to client",
    };
  })();

  // Context rows — the "everything else" beneath the hero.
  type ContextRow = { label: string; value: string; tooltip?: string; emphasis?: boolean };
  const contextRows: ContextRow[] = (() => {
    const rows: ContextRow[] = [];
    if (offer.clientBudget) {
      rows.push({
        label: "Client budget",
        value: `${fmtMoney(offer.clientBudget.amount, offer.clientBudget.currency)} ${UNIT_TYPE_LABEL[offer.clientBudget.unitType]}`,
        tooltip: offer.clientBudget.note,
      });
    }
    if (isAdmin) {
      rows.push({
        label: "Talent cost",
        value: fmtMoney(totalCost, currency),
        tooltip: "What goes to talent · before agency fee",
      });
      rows.push({
        label: "Margin",
        value: fmtMoney(totalMargin, currency),
        emphasis: true,
        tooltip: `Agency fee + lineup margin · ${offer.coordinatorPct}% to coordinator`,
      });
    }
    // Coord-talent: also show the offer total as supporting context
    if (isTalent && pov.isCoordinator && isOfferLive) {
      rows.push({
        label: "Total offer",
        value: `${fmtMoney(totalRevenue, currency)}${offer.clientBudget ? " " + UNIT_TYPE_LABEL[offer.clientBudget.unitType] : ""}`,
      });
    }
    return rows;
  })();

  const heroColor = hero.tone === "accent" ? COLORS.accentDeep
    : hero.tone === "success" ? (COLORS.successDeep ?? COLORS.success)
    : COLORS.ink;

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 14,
      padding: "16px 18px",
      boxShadow: "0 1px 0 rgba(11,11,13,0.02)",
      fontFamily: FONTS.body,
      maxWidth: "100%",
      boxSizing: "border-box",
      overflow: "hidden",
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
        color: COLORS.inkMuted, textTransform: "uppercase",
      }}>{hero.label}</div>
      <div style={{
        marginTop: 4,
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
      }}>
        <span style={{
          fontFamily: FONTS.display,
          fontSize: 32, fontWeight: 700, color: heroColor,
          letterSpacing: -0.6, lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {hero.value}
        </span>
        {hero.unit && (
          <span style={{ fontSize: 12.5, color: COLORS.inkMuted, fontWeight: 500 }}>
            {hero.unit}
          </span>
        )}
      </div>
      {hero.subtitle && (
        <div style={{ marginTop: 6, fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.4 }}>
          {hero.subtitle}
        </div>
      )}

      {contextRows.length > 0 && (
        <>
          <div style={{
            height: 1, background: COLORS.borderSoft,
            margin: "14px 0 10px",
          }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contextRows.map((row, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "baseline",
                justifyContent: "space-between", gap: 12,
                fontSize: 12.5,
              }}>
                <span style={{
                  color: COLORS.inkMuted, fontWeight: 500,
                  flexShrink: 0,
                }} title={row.tooltip}>
                  {row.label}
                </span>
                <span style={{
                  color: COLORS.ink,
                  fontWeight: row.emphasis ? 700 : 600,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {row.value}
                </span>
              </div>
            ))}
            {isClient && offer.clientBudget && (offer.stage === "no_offer" || offer.stage === "client_budget") && (
              <button
                type="button"
                onClick={onEditBudget}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: 0, border: "none", background: "transparent",
                  color: COLORS.accent, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}
              >
                Edit budget →
              </button>
            )}
            {offer.clientBudget?.note && (
              <div style={{
                marginTop: 4,
                fontSize: 11, color: COLORS.inkDim, fontStyle: "italic",
                lineHeight: 1.4,
              }}>
                &ldquo;{offer.clientBudget.note}&rdquo;
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label, primary, secondary, note, editable, onEdit, tone,
}: {
  label: string; primary: string; secondary?: string; note?: string;
  editable?: boolean; onEdit?: () => void;
  tone?: "accent" | "success";
}) {
  const primaryColor = tone === "accent" ? COLORS.accent : tone === "success" ? COLORS.success : COLORS.ink;
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.border}`, background: "#fff",
      position: "relative",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkDim }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 17, fontWeight: 700, color: primaryColor, fontFamily: FONTS.display }}>
        {primary}
      </div>
      {secondary && (
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{secondary}</div>
      )}
      {note && (
        <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 6, fontStyle: "italic" }}>“{note}”</div>
      )}
      {editable && onEdit && (
        <button type="button" onClick={onEdit} aria-label="Edit"
          style={{
            position: "absolute", top: 8, right: 8,
            padding: 4, borderRadius: 6, border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer",
          }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9.5 2.5l2 2L4 12H2v-2l7.5-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function ParticipantRow({
  initials, name, role, tone, note,
}: { initials: string; name: string; role: string; tone: "royal" | "ink"; note?: string }) {
  const palette = tone === "royal"
    ? { bg: COLORS.royalSoft, fg: COLORS.royalDeep }
    : { bg: COLORS.accentSoft, fg: COLORS.accentDeep };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <Avatar size={28} tone="auto" hashSeed={name} initials={initials} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{name}</div>
        {note && <div style={{ fontSize: 11, color: COLORS.inkMuted }}>{note}</div>}
      </div>
      <span style={{
        fontSize: 9.5, fontWeight: 700,         padding: "2px 8px", borderRadius: 999, background: palette.bg, color: palette.fg,
      }}>{role}</span>
    </div>
  );
}

function TimelineRow({ event, last }: { event: TimelineEvent; last: boolean }) {
  const dotColor =
      event.tone === "success" ? COLORS.success
    : event.tone === "warn"    ? COLORS.coral
    : event.tone === "info"    ? COLORS.indigo
    :                            COLORS.inkDim;
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, marginTop: 4 }} />
        {!last && <span style={{ flex: 1, width: 1, background: COLORS.borderSoft, marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 6 }}>
        <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.4 }}>{event.body}</div>
        <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>{event.actor} · {event.ts}</div>
      </div>
    </div>
  );
}

function primaryBtn(bg: string): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999, border: "none",
    background: bg, color: "#fff",
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
  };
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999,
    background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.ink,
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
  };
}
function dashedBtn(_label: string): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10,
    border: `1.5px dashed ${COLORS.border}`, background: "transparent",
    color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", textAlign: "left",
  } as React.CSSProperties;
}

function TotalCell({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkDim }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700, marginTop: 4,
        color: tone ?? (accent ? COLORS.accent : COLORS.ink),
        fontFamily: FONTS.display,
      }}>
        {value}
      </div>
    </div>
  );
}

function LineupRowCard({
  row, offer, pov, showCost, showRevenue, showMargin, onOpenRateSheet, onWithdraw,
}: {
  row: LineupRow; offer: Offer; pov: OfferPov;
  showCost: boolean; showRevenue: boolean; showMargin: boolean;
  /** Called by the per-row Submit / Counter buttons to open the
   *  SubmitRateSheet at the OfferTab level. mode="submit" for first
   *  rate, "edit" for an already-submitted rate the talent wants to
   *  change before the offer reaches the client. */
  onOpenRateSheet?: (mode: "submit" | "edit") => void;
  /** Talent withdraws their submitted rate. Caller writes a row
   *  override flipping status → declined + notes the reason. */
  onWithdraw?: () => void;
}) {
  const { toast } = useProto();
  const subCost = rowSubtotal(row, "cost");
  const subRevenue = rowSubtotal(row, "client");
  const subMargin = subRevenue - subCost;
  const editable =
    pov.kind === "admin"
    || (pov.kind === "talent" && pov.talentId === row.talentId)
    || (pov.kind === "talent" && pov.isCoordinator);
  const isMine = pov.kind === "talent" && pov.talentId === row.talentId;
  // Withdraw confirmation — replaces native window.confirm with a
  // styled bottom sheet that matches the rest of the design system.
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);

  const rowStatusTone =
      row.status === "submitted" ? { bg: COLORS.successSoft, fg: COLORS.successDeep, label: "Submitted" }
    : row.status === "approved"  ? { bg: COLORS.accentSoft,  fg: COLORS.accentDeep,  label: "Approved" }
    : row.status === "countered" ? { bg: COLORS.amberSoft,   fg: COLORS.amberDeep,   label: "Countered" }
    : row.status === "declined"  ? { bg: COLORS.coralSoft,   fg: COLORS.coralDeep,   label: "Declined" }
                                 : { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted, label: "Pending rate" };

  return (
    <div style={{
      border: `1px solid ${COLORS.border}`, borderRadius: 10, background: "#fff",
      padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar size={32} tone="auto" hashSeed={row.talentName} initials={row.initials} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>
              {pov.kind === "talent" && !pov.isCoordinator && !isMine ? "Hidden talent" : row.talentName}
            </span>
            {offer.coordinators.some(c => c.alsoTalentId === row.talentId) && (
              <span aria-label="Coordinator" title="Coordinator" style={{
                fontSize: 9.5, fontWeight: 700,                 padding: "1px 6px", borderRadius: 4,
                background: COLORS.royalSoft, color: COLORS.royalDeep,
              }}>Coord</span>
            )}
            {isMine && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: COLORS.accentSoft, color: COLORS.accentDeep,               }}>You</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 1 }}>{row.role}</div>
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 700,           padding: "2px 8px", borderRadius: 999,
          background: rowStatusTone.bg, color: rowStatusTone.fg,
        }}>{rowStatusTone.label}</span>
      </div>

      {/* Rate grid */}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.borderSoft}`,
        display: "grid", gridTemplateColumns: "1fr 80px 1fr 1fr", gap: 10,
      }}>
        <RateField label="Unit" value={row.unitType} editable={editable && pov.kind === "admin"} />
        <RateField label="Units" value={String(row.units)} editable={editable} />
        {showCost  && <RateField label="Cost rate"   value={fmtMoney(row.costRate, (offer.clientBudget?.currency ?? "EUR"))}   editable={editable && (pov.kind === "admin" || isMine)} />}
        {showRevenue && <RateField label="Client rate" value={fmtMoney(row.clientRate, (offer.clientBudget?.currency ?? "EUR"))} editable={editable && (pov.kind === "admin" || (pov.kind === "talent" && pov.isCoordinator))} />}
      </div>

      {/* Subtotals */}
      <div style={{ marginTop: 8, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 11.5 }}>
        {showCost && (
          <span style={{ color: COLORS.inkMuted }}>
            Cost <strong style={{ color: COLORS.ink, marginLeft: 4 }}>{fmtMoney(subCost, (offer.clientBudget?.currency ?? "EUR"))}</strong>
          </span>
        )}
        {showRevenue && (
          <span style={{ color: COLORS.inkMuted }}>
            {pov.kind === "client" ? "Subtotal" : "Revenue"} <strong style={{ color: COLORS.ink, marginLeft: 4 }}>{fmtMoney(subRevenue, (offer.clientBudget?.currency ?? "EUR"))}</strong>
          </span>
        )}
        {showMargin && (
          <span style={{ color: COLORS.inkMuted }}>
            Margin <strong style={{ color: COLORS.success, marginLeft: 4 }}>{fmtMoney(subMargin, (offer.clientBudget?.currency ?? "EUR"))}</strong>
          </span>
        )}
        {row.notes && (
          <span style={{ color: COLORS.inkDim, fontStyle: "italic", flex: "1 1 100%", marginTop: 4 }}>
            “{row.notes}”
          </span>
        )}
      </div>

      {/* Per-row actions for talent on their own row. Pending → opens
          submit-rate sheet (first time). Submitted → "Edit" reopens
          the same sheet pre-filled so the talent can adjust before the
          coord sends to client. Withdraw is a destructive action and
          stays as its own toast for now. */}
      {isMine && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {row.status === "pending" && (
            <button
              type="button"
              onClick={() => onOpenRateSheet?.("submit") ?? toast("Rate submitted")}
              style={tinyBtn(COLORS.accent, "#fff")}
            >
              Submit my rate
            </button>
          )}
          {row.status === "submitted" && (
            <>
              <button
                type="button"
                onClick={() => onOpenRateSheet?.("edit") ?? toast("Edit rate")}
                style={tinyBtn(COLORS.accentSoft, COLORS.accentDeep, `rgba(15,79,62,0.18)`)}
              >
                Edit rate
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!onWithdraw) { toast("Withdrawn"); return; }
                  setWithdrawConfirmOpen(true);
                }}
                style={tinyBtn("transparent", COLORS.coral, `${COLORS.coral}40`)}
              >
                Withdraw
              </button>
            </>
          )}
          {row.status === "countered" && (
            <button
              type="button"
              onClick={() => onOpenRateSheet?.("edit") ?? toast("Review counter")}
              style={tinyBtn(COLORS.amberSoft, COLORS.amberDeep, `${COLORS.amber}40`)}
            >
              Review counter
            </button>
          )}
          {row.status === "approved" && (
            <span style={{ fontSize: 11.5, color: COLORS.successDeep }}>✓ You're booked at this rate.</span>
          )}
        </div>
      )}
      <ConfirmSheet
        open={withdrawConfirmOpen}
        onClose={() => setWithdrawConfirmOpen(false)}
        onConfirm={() => onWithdraw?.()}
        title="Withdraw your rate?"
        body="The coordinator will be notified and your row will be removed from the offer. You can resubmit later if the coordinator re-invites you."
        confirmLabel="Withdraw"
        tone="danger"
      />
    </div>
  );
}

function tinyBtn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 999,
    background: bg, color,
    border: border ? `1px solid ${border}` : "none",
    fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
  };
}

// ── SubmitRateSheet ──
// Real submit-rate flow that ties to the inquiry's pricing. Replaces
// the prior `toast("Submit your rate…")` stub. Shows:
//   • Inquiry context (client + brief + dates)
//   • Client budget banner (the cap they posted) — drives unit-type
//     default so the talent's quote lines up cleanly with the cap
//   • Unit-type picker (hour / day / contract / event)
//   • Units count + rate input — live take-home preview underneath
//     deducts the agency fee + 5% platform fee from the gross
//   • Notes field for any conditions ("usage clearance", "travel covered")
//   • Submit → toasts the result + closes; in production this writes
//     to offer.rows[mine] + emits a timeline event + flips offer.stage
//     to talent_submitted (or coordinator_review when last to submit).
//
// Mode: "submit" (first time) | "edit" (already submitted, change rate
// before client sees). Visual difference: "edit" pre-fills the existing
// numbers and labels the CTA "Update rate".
function SubmitRateSheet({
  open, onClose, conv, offer, mode = "submit", onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conversation;
  offer: Offer;
  mode?: "submit" | "edit";
  /** Called after the user hits Submit. Caller writes the rate into
   *  its local override state so the row appears as "submitted" in
   *  the offer tab (instead of staying "pending" forever). */
  onSubmit?: (data: { unitType: UnitType; units: number; amount: number; notes: string }) => void;
}) {
  const { toast } = useProto();
  const myTalentId = currentTalentId();
  const myRow = offer.rows.find(r => r.talentId === myTalentId);
  const budget = offer.clientBudget;
  const currency = budget?.currency ?? "EUR";

  // Default unit type — match the client's budget unit so the talent's
  // number lines up with the cap (€/day vs €/day, not €/day vs €/hour).
  // If editing, keep what the row already has. If submitting fresh, use
  // the budget's unit type. Falls back to "day" — the most common.
  const initialUnit: UnitType = (myRow?.costRate && mode === "edit"
    ? myRow.unitType
    : budget?.unitType) ?? "day";
  const initialUnits = myRow?.units ?? 1;
  // Default amount — for fresh submits, suggest the budget cap × 0.85
  // (an "I'll quote slightly under the cap to leave room for usage").
  // For edits, pre-fill the talent's existing rate.
  const suggestedAmount = mode === "edit" && myRow?.costRate
    ? myRow.costRate
    : budget
      ? Math.round(budget.amount * 0.85 / 50) * 50
      : 0;

  const [unitType, setUnitType] = useState<UnitType>(initialUnit);
  const [units, setUnits] = useState<number>(initialUnits);
  const [amount, setAmount] = useState<number>(suggestedAmount);
  const [notes, setNotes] = useState<string>(myRow?.notes ?? "");

  // Reset form when sheet (re)opens — handles closing + reopening for
  // a different conv without leaking state across submissions.
  useEffect(() => {
    if (open) {
      setUnitType(initialUnit);
      setUnits(initialUnits);
      setAmount(suggestedAmount);
      setNotes(myRow?.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conv.id]);

  // Live take-home preview. Mirrors the math the talent shell uses
  // elsewhere: gross × (1 − 0.15 agency commission − 0.05 platform).
  // Agency commission rate is a workspace setting in production —
  // hardcoded 15% here to match the breakdown shown in the header
  // take-home pill (single source of truth for the demo).
  const gross = (amount || 0) * (units || 0);
  const agencyFee = gross * 0.15;
  const platformFee = gross * 0.05;
  const takeHome = gross - agencyFee - platformFee;

  // Compare the gross against the client cap. When the talent quotes
  // above the cap we surface a soft warning so they know they're
  // entering negotiation territory.
  const overBudget = budget && budget.amount > 0 && amount > budget.amount;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submit your rate"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(11,11,13,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "tulala-rate-fade .18s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html:
        "@keyframes tulala-rate-fade{from{opacity:0}to{opacity:1}}"
        + "@keyframes tulala-rate-up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}"
        + "@media (min-width: 720px){.tulala-rate-sheet{margin-bottom:auto!important;margin-top:auto!important;border-radius:14px!important;max-width:480px!important;}}"
      }} />
      <div
        className="tulala-rate-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          borderRadius: "16px 16px 0 0",
          padding: "16px 18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
          fontFamily: FONTS.body,
          overflowY: "auto",
          marginBottom: 0,
          animation: "tulala-rate-up .24s cubic-bezier(.32,.72,0,1)",
          boxShadow: "0 -10px 40px rgba(11,11,13,0.18)",
        }}
      >
        {/* Header — title + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>
              {mode === "edit" ? "Edit your rate" : "Submit your rate"}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginTop: 2, lineHeight: 1.25 }}>
              {conv.client} · {conv.brief}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {[conv.date, conv.location?.split(" · ")[0]].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: "50%",
              border: "none", background: "rgba(11,11,13,0.05)",
              color: COLORS.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Client budget banner — the cap they posted, shown so the
            talent quotes against a known reference. Includes the
            client's note if they left one ("negotiable on usage", etc.). */}
        {budget && (
          <div style={{
            padding: "10px 12px", borderRadius: 10,
            background: COLORS.indigoSoft,
            border: `1px solid rgba(91,107,160,0.18)`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.indigoDeep }}>
              Client budget cap
            </div>
            <div style={{
              fontSize: 16, fontWeight: 700, color: COLORS.ink, marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtMoney(budget.amount, currency)}{" "}
              <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.inkMuted }}>
                {UNIT_TYPE_LABEL[budget.unitType]}
              </span>
            </div>
            {budget.note && (
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4, fontStyle: "italic" }}>
                "{budget.note}"
              </div>
            )}
          </div>
        )}

        {/* Role — read-only, set by the coordinator on the lineup row */}
        {myRow?.role && (
          <div>
            <FieldLabel>Your role on this booking</FieldLabel>
            <div style={{
              padding: "9px 11px", borderRadius: 8,
              background: COLORS.surfaceAlt,
              fontSize: 13, color: COLORS.ink, fontWeight: 500,
            }}>
              {myRow.role}
            </div>
          </div>
        )}

        {/* Unit-type picker — defaults to client's. Talent can switch
            (e.g. quote in days when client's cap was per-hour) but the
            mismatch shows in the comparison label. */}
        <div>
          <FieldLabel>Unit type</FieldLabel>
          <div style={{
            display: "grid", gap: 6,
            gridTemplateColumns: "repeat(4, 1fr)",
          }}>
            {(["hour", "day", "contract", "event"] as UnitType[]).map(u => {
              const active = unitType === u;
              const matchesBudget = budget?.unitType === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitType(u)}
                  style={{
                    padding: "8px 6px", borderRadius: 8,
                    border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                    background: active ? COLORS.accentSoft : "#fff",
                    color: active ? COLORS.accentDeep : COLORS.ink,
                    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", textAlign: "center",
                    textTransform: "capitalize",
                    position: "relative",
                  }}
                >
                  {u === "contract" ? "Contract" : u}
                  {matchesBudget && (
                    <span style={{
                      position: "absolute", top: 3, right: 4,
                      width: 5, height: 5, borderRadius: "50%",
                      background: COLORS.indigoDeep,
                    }} title="Matches client budget unit" />
                  )}
                </button>
              );
            })}
          </div>
          {budget && unitType !== budget.unitType && (
            <div style={{ fontSize: 11, color: COLORS.amber, marginTop: 6 }}>
              ⚠ Different unit than the client's cap ({UNIT_TYPE_LABEL[budget.unitType]}). The coordinator will need to convert before sending.
            </div>
          )}
        </div>

        {/* Units count + rate amount — side-by-side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
          <div>
            <FieldLabel>{unitType === "contract" ? "Length" : "Quantity"}</FieldLabel>
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
              background: "#fff", overflow: "hidden",
            }}>
              <button
                type="button"
                onClick={() => setUnits(Math.max(1, units - 1))}
                aria-label="Decrease"
                style={{
                  width: 36, height: 38, border: "none", background: "transparent",
                  color: COLORS.inkMuted, cursor: "pointer",
                  fontSize: 16, fontWeight: 600,
                }}
              >−</button>
              <input
                type="number" min={1} value={units}
                onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value || "1", 10)))}
                style={{
                  flex: 1, minWidth: 0, height: 38,
                  border: "none", outline: "none", background: "transparent",
                  textAlign: "center", fontSize: 14, fontWeight: 700, color: COLORS.ink,
                  fontFamily: FONTS.body, fontVariantNumeric: "tabular-nums",
                }}
              />
              <button
                type="button"
                onClick={() => setUnits(units + 1)}
                aria-label="Increase"
                style={{
                  width: 36, height: 38, border: "none", background: "transparent",
                  color: COLORS.inkMuted, cursor: "pointer",
                  fontSize: 16, fontWeight: 600,
                }}
              >+</button>
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.inkDim, marginTop: 4, textAlign: "center" }}>
              × {UNIT_TYPE_LABEL[unitType]}
            </div>
          </div>
          <div>
            <FieldLabel>Your rate ({currency === "EUR" ? "€" : currency === "USD" ? "$" : "£"} per unit)</FieldLabel>
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              border: `1.5px solid ${overBudget ? COLORS.amber : COLORS.border}`, borderRadius: 10,
              background: "#fff", paddingLeft: 12,
              transition: "border-color .12s",
            }}>
              <span style={{ color: COLORS.inkMuted, fontSize: 14, fontWeight: 600 }}>
                {currency === "EUR" ? "€" : currency === "USD" ? "$" : "£"}
              </span>
              <input
                type="number" min={0} step={50} value={amount}
                onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))}
                placeholder="0"
                style={{
                  flex: 1, minWidth: 0, height: 38,
                  border: "none", outline: "none", background: "transparent",
                  paddingLeft: 6,
                  fontSize: 18, fontWeight: 700, color: COLORS.ink,
                  fontFamily: FONTS.body, fontVariantNumeric: "tabular-nums",
                }}
              />
            </div>
            {overBudget && budget && (
              <div style={{ fontSize: 10.5, color: COLORS.amber, marginTop: 4, fontWeight: 600 }}>
                ⚠ Over the client's cap by {fmtMoney(amount - budget.amount, currency)} — they may counter
              </div>
            )}
          </div>
        </div>

        {/* Notes — optional usage / conditions */}
        <div>
          <FieldLabel>Conditions <span style={{ fontWeight: 400, color: COLORS.inkMuted }}>(optional)</span></FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 12mo EU usage included · travel covered separately"
            rows={2}
            style={{
              width: "100%", minHeight: 56, padding: 10,
              border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
              background: "#fff", outline: "none", resize: "vertical",
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Live take-home breakdown — gross → fees → net. Always
            visible so the talent sees what they'll actually take home
            BEFORE they submit. */}
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <BreakdownRow label={`Gross · ${units} × ${UNIT_TYPE_LABEL[unitType]}`} value={fmtMoney(gross, currency)} muted />
          <BreakdownRow label="Agency commission · 15%" value={`–${fmtMoney(agencyFee, currency)}`} muted />
          <BreakdownRow label="Platform fee · 5%" value={`–${fmtMoney(platformFee, currency)}`} muted />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 0" }} />
          <BreakdownRow label="Your take-home" value={fmtMoney(takeHome, currency)} bold />
          <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 6 }}>
            Released 14 days after wrap, once the client invoice clears.
          </div>
        </div>

        {/* Submit + cancel */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: "10px 16px", borderRadius: 999,
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            }}
          >Cancel</button>
          <button
            type="button"
            disabled={amount <= 0}
            onClick={() => {
              // Hand the form data back to the caller so the local
              // override store can flip the row to "submitted" with
              // these numbers — without onSubmit it's just a toast,
              // but with onSubmit the offer tab updates immediately.
              onSubmit?.({ unitType, units, amount, notes });
              toast(mode === "edit"
                ? `Rate updated · ${fmtMoney(gross, currency)} ${UNIT_TYPE_LABEL[unitType]} sent to coordinator`
                : `Rate submitted · ${fmtMoney(gross, currency)} ${UNIT_TYPE_LABEL[unitType]}. Coordinator notified.`);
              onClose();
            }}
            style={{
              flex: 1,
              padding: "10px 16px", borderRadius: 999,
              background: amount > 0 ? COLORS.accent : "rgba(11,11,13,0.10)",
              border: "none",
              color: amount > 0 ? "#fff" : COLORS.inkDim,
              cursor: amount > 0 ? "pointer" : "default",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 700,
            }}
          >
            {mode === "edit" ? "Update rate" : "Submit to coordinator"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmSheet ──
// Single-question confirmation dialog. Replaces native window.confirm
// for actions like Withdraw rate. Same visual register as ApproveOfferSheet.
function ConfirmSheet({
  open, onClose, onConfirm, title, body, confirmLabel, tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
}) {
  if (!open) return null;
  const confirmBg = tone === "danger" ? COLORS.coral : COLORS.accent;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(11,11,13,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "tulala-rate-fade .18s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html:
        "@media (min-width: 720px){.tulala-confirm-sheet{margin-bottom:auto!important;margin-top:auto!important;border-radius:14px!important;max-width:420px!important;}}"
      }} />
      <div
        className="tulala-confirm-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 480,
          borderRadius: "16px 16px 0 0",
          padding: "18px 20px 20px",
          display: "flex", flexDirection: "column", gap: 12,
          fontFamily: FONTS.body,
          marginBottom: 0,
          animation: "tulala-rate-up .24s cubic-bezier(.32,.72,0,1)",
          boxShadow: "0 -10px 40px rgba(11,11,13,0.18)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, lineHeight: 1.3 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: "10px 16px", borderRadius: 999,
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={() => { onConfirm(); onClose(); }}
            style={{
              flex: 1,
              padding: "10px 16px", borderRadius: 999,
              background: confirmBg, color: "#fff",
              border: "none", cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 700,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted,
      letterSpacing: 0.4, textTransform: "uppercase",
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

// ── ClientActionSheet ──
// Styled sheet for the client's primary actions: Approve offer, Sign
// booking, Pay invoice, Verify card. Mirrors SubmitRateSheet visually
// (bottom sheet on mobile, centered modal on desktop) but the body
// shows what the client is about to confirm rather than a form.
//
// On confirm, calls applyOfferOverride to advance the offer stage
// AND appends a timeline event so all 3 povs see the action propagate.
type ClientActionKind = "approve" | "sign" | "pay" | "verify-card";
function ClientActionSheet({
  open, onClose, conv, kind, offer,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conversation;
  kind: ClientActionKind;
  offer?: Offer;
}) {
  const { toast } = useProto();
  if (!open) return null;

  // Per-action copy + outcome bundle. Production wires real flows
  // (Stripe payment, DocuSign, Stripe Identity); the prototype surfaces
  // the shape + flips stage so the demo feels real.
  const meta = (() => {
    if (kind === "approve") {
      const total = offer ? offer.rows.reduce((s, r) => s + r.costRate * r.units, 0) + offer.agencyFee : 0;
      const currency = offer?.clientBudget?.currency ?? "EUR";
      return {
        eyebrow: "Approve offer",
        headline: offer ? `${fmtMoney(total, currency)} · ${offer.rows.length} talent` : "Approve",
        body: "Approving locks the lineup, the rates, and the dates. The agency starts call-sheet prep immediately. You'll be invoiced 50% deposit on approval, balance 14 days after wrap.",
        confirmLabel: "Approve & lock",
        confirmTone: COLORS.success,
        toastMsg: "Offer approved · contract drafting",
        nextStage: "accepted" as Offer["stage"],
        timelineActor: "Client",
        timelineBody: offer ? `Client approved · ${fmtMoney(total, currency)} locked` : "Client approved",
      };
    }
    if (kind === "sign") {
      return {
        eyebrow: "Sign booking",
        headline: "Sign the booking confirmation",
        body: "DocuSign envelope opens in a new tab. Once you sign, the agency proceeds with call-sheet + travel. Locked stages no longer accept counters.",
        confirmLabel: "Open DocuSign",
        confirmTone: COLORS.accent,
        toastMsg: "Booking signed · agency notified",
        nextStage: undefined,
        timelineActor: "Client",
        timelineBody: "Client signed booking confirmation",
      };
    }
    if (kind === "pay") {
      return {
        eyebrow: "Pay invoice",
        headline: "Settle the deposit",
        body: "Stripe checkout opens with your card on file. 50% deposit · €1,200 holds the booking. The balance auto-charges 14 days after wrap.",
        confirmLabel: "Pay €1,200 deposit",
        confirmTone: COLORS.success,
        toastMsg: "Payment confirmed · receipt emailed",
        nextStage: undefined,
        timelineActor: "Client",
        timelineBody: "Client paid deposit · €1,200",
      };
    }
    return {
      eyebrow: "Verify card",
      headline: "Add a card to unlock profiles",
      body: "Basic-tier clients verify a card before the agency sends talent profiles. No charge — Stripe runs a $0 verification. Cards on file unlock booking + invoice flow.",
      confirmLabel: "Verify card",
      confirmTone: COLORS.accent,
      toastMsg: "Card verified · profiles unlocking",
      nextStage: undefined,
      timelineActor: "Client",
      timelineBody: "Client verified card on file",
    };
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meta.eyebrow}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(11,11,13,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "tulala-rate-fade .18s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html:
        "@media (min-width: 720px){.tulala-action-sheet{margin-bottom:auto!important;margin-top:auto!important;border-radius:14px!important;max-width:480px!important;}}"
      }} />
      <div
        className="tulala-action-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          borderRadius: "16px 16px 0 0",
          padding: "16px 18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
          fontFamily: FONTS.body,
          overflowY: "auto",
          marginBottom: 0,
          animation: "tulala-rate-up .24s cubic-bezier(.32,.72,0,1)",
          boxShadow: "0 -10px 40px rgba(11,11,13,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>
              {meta.eyebrow}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, marginTop: 2, lineHeight: 1.25 }}>
              {meta.headline}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {conv.client} · {conv.brief}
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: "50%",
              border: "none", background: "rgba(11,11,13,0.05)",
              color: COLORS.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div style={{
          padding: "12px 14px", borderRadius: 12,
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55,
        }}>
          {meta.body}
        </div>

        {/* Per-row recap when approving an offer — gives the client a
            last-look at exactly what they're locking. */}
        {kind === "approve" && offer && (
          <div style={{
            padding: "10px 12px", borderRadius: 10,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.inkMuted, marginBottom: 6 }}>
              You're approving
            </div>
            {offer.rows.map(r => (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                fontSize: 12.5, padding: "3px 0",
              }}>
                <span style={{ color: COLORS.ink, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.talentName} <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>· {r.role}</span>
                </span>
                <span style={{ color: COLORS.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {fmtMoney(r.clientRate * r.units, offer.clientBudget?.currency ?? "EUR")}
                </span>
              </div>
            ))}
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 0" }} />
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              fontSize: 13, fontWeight: 700, color: COLORS.ink,
            }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(
                  offer.rows.reduce((s, r) => s + r.clientRate * r.units, 0) + offer.agencyFee,
                  offer.clientBudget?.currency ?? "EUR",
                )}
              </span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: "10px 16px", borderRadius: 999,
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={() => {
              // Push offer-level override + timeline event so every
              // shell viewing this conv sees the action immediately.
              if (offer && (meta.nextStage || meta.timelineBody)) {
                applyOfferOverride(conv.id, {
                  ...(meta.nextStage ? { stage: meta.nextStage } : {}),
                  appendedTimeline: [{
                    id: `local-${conv.id}-${Date.now()}`,
                    ts: "Just now",
                    actor: meta.timelineActor,
                    body: meta.timelineBody,
                    tone: kind === "approve" ? "success" : "info",
                  }],
                });
              }
              toast(meta.toastMsg);
              onClose();
            }}
            style={{
              flex: 1,
              padding: "10px 16px", borderRadius: 999,
              background: meta.confirmTone, color: "#fff",
              border: "none", cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 700,
            }}
          >
            {meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateField({ label, value, editable }: { label: string; value: string; editable?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.inkDim, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        padding: "6px 10px", borderRadius: 7,
        border: `1px solid ${editable ? COLORS.border : "transparent"}`,
        background: editable ? "#fff" : "rgba(11,11,13,0.03)",
        fontSize: 12.5, fontWeight: 600, color: editable ? COLORS.ink : COLORS.inkMuted,
      }}>{value}</div>
    </div>
  );
}

// RI-XXX ↔ cN — admin shell uses RICH_INQUIRIES (RI ids) but the talent
// shell + file fixtures key off Conversation ids (c1-c10). Same job,
// two id schemes during the prototype era. This resolver gives every
// lookup a fallback so admin sees the same files the talent does.
const RI_TO_CONV_ALIAS: Record<string, string> = {
  "RI-201": "c1",   // Mango
  "RI-202": "c3",   // Vogue Italia (RI-202.client = Vogue Italia)
  "RI-203": "c2",   // Bvlgari
};
function resolveFileKey(id: string): string {
  return RI_TO_CONV_ALIAS[id] ?? id;
}

function FilesTab({ conv, povCanSeeTalentFiles }: { conv: Conversation; povCanSeeTalentFiles: boolean }) {
  const { toast } = useProto();
  const all = MOCK_FILES_FOR_CONV[resolveFileKey(conv.id)] ?? [];
  // Per-thread visibility: client only sees client-thread files (call
  // sheets, briefs, contract). Coordinator + talent see both client
  // thread files AND the booking-team's internal files (counter
  // history, polaroids, etc.). Sort newest first by addedAt heuristic.
  const visible = povCanSeeTalentFiles ? all : all.filter(f => f.thread === "client");
  const clientFiles = visible.filter(f => f.thread === "client");
  const talentFiles = visible.filter(f => f.thread === "talent");
  // Crude "freshness" heuristic — files with "ago" or recent dates
  // sort to top of their group. Real production would parse + sort
  // by an ISO timestamp.
  const sortByFresh = (arr: typeof visible) => [...arr].sort((a, b) => {
    const aAgo = /ago|h$/i.test(a.addedAt) ? 1 : 0;
    const bAgo = /ago|h$/i.test(b.addedAt) ? 1 : 0;
    return bAgo - aAgo;
  });
  const sortedClient = sortByFresh(clientFiles);
  const sortedTalent = sortByFresh(talentFiles);

  // Extension-aware file icon + image-thumbnail render. Lifts the
  // file row from "all files look identical" to "I can spot the
  // call sheet vs the polaroids zip vs the contract at a glance".
  // Image files render a tinted square with photo glyph (mock); a
  // future iteration can swap the glyph for an actual thumbnail
  // pulled from the file CDN.
  const fileVisual = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["jpg", "jpeg", "png", "heic", "webp", "gif"].includes(ext);
    const isZip = ["zip", "rar", "7z", "tar", "gz"].includes(ext);
    const isSheet = ["csv", "xlsx", "xls", "numbers"].includes(ext);
    const isCal = ["ics"].includes(ext);
    const palette = isImage ? { bg: "rgba(91,107,160,0.14)", fg: "#3B4A7C" }
      : isZip               ? { bg: "rgba(214,158,46,0.16)", fg: "#9C6B14" }
      : isSheet             ? { bg: "rgba(46,125,91,0.14)",  fg: "#1F5C40" }
      : isCal               ? { bg: "rgba(176,48,58,0.10)",  fg: COLORS.coralDeep }
      : { bg: COLORS.surfaceAlt, fg: COLORS.inkMuted };
    const glyph = isImage ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="5" cy="6" r="1" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2 11l3.5-3 2.5 2 2-2 2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ) : isZip ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 1.5h6l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M6 2v2h1v1h-1v1h1v1h-1v1h1v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ) : isSheet ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2 5.5h10M2 8.5h10M5 2v10M9 2v10" stroke="currentColor" strokeWidth="1.1"/>
      </svg>
    ) : isCal ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="3" width="11" height="9.5" rx="1.4" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1.5 6h11M5 1.5v3M9 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 1.5h6l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1zM9 1.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    );
    return (
      <div aria-hidden style={{
        width: 36, height: 36, borderRadius: 8,
        background: palette.bg, color: palette.fg,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {glyph}
      </div>
    );
  };

  // File-card row. Extracted so the two threads can render the same
  // visual for each file with a thread chip when relevant.
  const fileCard = (f: typeof visible[number], showThreadChip: boolean) => (
    <div key={f.name} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
      fontFamily: FONTS.body,
    }}>
      {fileVisual(f.name)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 600, color: COLORS.ink,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
          {showThreadChip && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
              background: f.thread === "client" ? COLORS.indigoSoft : COLORS.surfaceAlt,
              color: f.thread === "client" ? COLORS.indigoDeep : COLORS.inkMuted,
              letterSpacing: 0.3, textTransform: "uppercase",
            }}>{f.thread === "client" ? "Client" : "Team"}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
          {f.size} · {f.addedBy} · {f.addedAt}
        </div>
      </div>
      <button type="button" onClick={() => toast(`Downloading ${f.name}`)} aria-label="Download" title="Download" style={{
        padding: 7, borderRadius: 7, border: "none", background: "transparent",
        color: COLORS.inkMuted, cursor: "pointer",
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5v9M3.5 7.5L7 11l3.5-3.5M2 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );

  // Group header — small uppercase eyebrow above each thread's files
  // when BOTH threads have content. Single-thread views skip the
  // eyebrow (no need to disambiguate when there's one group).
  const groupTitle = (label: string) => (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
      textTransform: "uppercase", color: COLORS.inkMuted,
      marginTop: 8, marginBottom: 2,
    }}>{label}</div>
  );

  const showGroupHeaders = povCanSeeTalentFiles && sortedClient.length > 0 && sortedTalent.length > 0;

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Add-file affordance — at top so the talent can upload polaroids,
          signed contracts, references without leaving this tab. */}
      <button
        type="button"
        onClick={() => toast("Choose a file to upload")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 12px", marginBottom: 4,
          background: "transparent",
          border: `1.5px dashed ${COLORS.border}`, borderRadius: 10,
          color: COLORS.ink, cursor: "pointer",
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accentDeep; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        Add file
        <span style={{ marginLeft: 8, color: COLORS.inkMuted, fontWeight: 400, fontSize: 11 }}>
          polaroids, signed contracts, references
        </span>
      </button>

      {visible.length === 0 ? (
        <div style={{ padding: "24px 12px", textAlign: "center", color: COLORS.inkDim, fontSize: 12, fontFamily: FONTS.body }}>
          No files attached yet · drop one above to share with the team.
        </div>
      ) : (
        <>
          {showGroupHeaders && groupTitle(`From client · ${sortedClient.length}`)}
          {sortedClient.map(f => fileCard(f, !showGroupHeaders && povCanSeeTalentFiles))}
          {showGroupHeaders && groupTitle(`Booking team · ${sortedTalent.length}`)}
          {sortedTalent.map(f => fileCard(f, !showGroupHeaders))}
        </>
      )}
    </div>
  );
}

// Render text with @mentions highlighted in accent color.
function renderWithMentions(body: string, mine: boolean): React.ReactNode {
  const parts = body.split(/(@[A-Z][\w-]*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      return (
        <span key={i} style={{
          color: mine ? "#9ED6C2" : COLORS.accent,
          fontWeight: 600,
        }}>{p}</span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

// Extract day prefix from a `ts` like "Apr 28 · 10:18" → "Apr 28".
function dayKey(ts: string): string {
  const sep = ts.indexOf(" · ");
  return sep >= 0 ? ts.slice(0, sep) : ts;
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
      <span style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
      <span style={{
        fontSize: 10.5, fontWeight: 600,         color: COLORS.inkDim, padding: "2px 8px",
      }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
    </div>
  );
}

// ── ConversationActionPin — sticky in-thread callout for the current
// most-urgent action. One pin at a time so the surface stays calm.
//   - hold stage  → red/amber "Hold expires in {h}h" with Manage button
//   - inquiry pending → indigo "Coordinator invited you" with Accept/Decline
//   - everything else → no pin
// Lives at the top of ConversationTab so it's pinned-feeling and remains
// visible while the talent scrolls older messages.
// ── TeamStrip — compact horizontal lineup at the top of every chat.
// Replaces the prior stack of pinned notes (action pin + coordinator
// note + cross-thread bridge) which ate too much vertical space.
//
// Shows: avatar stack (overlapping) · count summary · open chevron.
// Click → opens LineupDrawer for view/edit. Permission rules:
//   - Admin / coordinator / talent_coord / client → can edit
//   - Regular talent → read-only (still gets the drawer but no actions)
// ──
function TeamStrip({
  lineup, canEdit, povLabel, onOpen,
}: {
  lineup: Array<{ talentId: string; name: string; initials: string; state: string; photoUrl?: string }>;
  canEdit: boolean;
  /** Subtle role marker shown on the right ("Edit" or "View"). */
  povLabel: "edit" | "view";
  onOpen: () => void;
}) {
  if (lineup.length === 0) return null;
  const accepted = lineup.filter(t => {
    const s = (t.state || "").toLowerCase();
    return s === "accepted" || s === "confirmed" || s === "booked";
  }).length;
  const pending = lineup.filter(t => {
    const s = (t.state || "").toLowerCase();
    return s === "pending" || s === "invited";
  }).length;
  const declined = lineup.filter(t => {
    const s = (t.state || "").toLowerCase();
    return s === "declined" || s === "rejected" || s === "withdrew" || s === "withdrawn";
  }).length;
  // Show up to 6 faces in the strip — premium messaging apps
  // (Notion, Linear, Slack huddle) lead with people, not text.
  const visible = lineup.slice(0, 6);
  const overflow = Math.max(0, lineup.length - visible.length);
  const allConfirmed = accepted === lineup.length;
  // Smart single-person copy — for solo lineups show the talent's
  // name (or "Just you") instead of the awkward "1/1 person".
  const isSolo = lineup.length === 1;
  const soloIsMe = isSolo && (
    lineup[0]?.talentId === currentTalentId() ||
    lineup[0]?.name === MY_TALENT_PROFILE.name
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open lineup"
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 10,
        width: "100%",
        // Locked banners get a feather-soft success tint so the eye
        // immediately knows "deal complete". Active lineups stay white.
        padding: "5px 10px 5px 6px",
        minHeight: 42,
        background: allConfirmed && lineup.length > 1
          ? `linear-gradient(90deg, ${COLORS.successSoft} 0%, #FFFFFF 60%)`
          : "#fff",
        border: `1px solid ${allConfirmed && lineup.length > 1 ? `${COLORS.success}30` : COLORS.borderSoft}`,
        borderRadius: 999,
        cursor: "pointer", textAlign: "left",
        fontFamily: FONTS.body,
        transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
        // Prevent inner wrapping — Locked pill was bouncing to a
        // second line on long lineups, causing inconsistent heights.
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = allConfirmed && lineup.length > 1 ? `${COLORS.success}55` : COLORS.border;
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(11,11,13,0.14)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = allConfirmed && lineup.length > 1 ? `${COLORS.success}30` : COLORS.borderSoft;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Avatar stack — the hero. Tight overlap (-10px) makes the row
          read as ONE pill of faces. Status-tinted ring on each avatar
          carries the lineup-health signal that used to need a side rail
          + counts row. Premium messaging-app convention. */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {visible.map((t, i) => {
          const s = (t.state || "").toLowerCase();
          const ring = (s === "accepted" || s === "confirmed" || s === "booked") ? COLORS.success
            : (s === "pending" || s === "invited") ? COLORS.amber
            : (s === "declined" || s === "rejected" || s === "withdrew" || s === "withdrawn") ? "rgba(11,11,13,0.18)"
            : "rgba(11,11,13,0.18)";
          return (
            <div key={t.talentId} style={{
              // inline-flex collapses phantom line-box space the
              // inline-block Avatar otherwise creates (was 36px tall
              // for a 28px avatar, leaving an awkward gap below).
              display: "inline-flex",
              marginLeft: i > 0 ? -10 : 0,
              borderRadius: "50%",
              boxShadow: `0 0 0 2px #fff, 0 0 0 3px ${ring}`,
              position: "relative",
              zIndex: visible.length - i,
            }}>
              <Avatar size={28} tone="auto" hashSeed={t.name} initials={t.initials} photoUrl={t.photoUrl} />
            </div>
          );
        })}
        {overflow > 0 && (
          <span style={{
            marginLeft: -10,
            width: 28, height: 28, borderRadius: "50%",
            background: COLORS.surfaceAlt, color: COLORS.inkMuted,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 10.5, fontWeight: 700,
            boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(11,11,13,0.10)",
            fontFamily: FONTS.body,
          }}>+{overflow}</span>
        )}
      </div>
      {/* Tight summary — single line. Smart copy per cardinality:
          - solo + me     → "Just you"
          - solo + other  → name only
          - group         → "X/Y"
          + Locked pill when fully confirmed (group only). */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "inline-flex", alignItems: "center", gap: 6,
        flexWrap: "nowrap",
        fontSize: 12, color: COLORS.ink, fontWeight: 600,
        letterSpacing: -0.05,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {isSolo ? (
          <span style={{ fontWeight: 700, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis" }}>
            {soloIsMe ? "Just you" : (lineup[0]?.name ?? "")}
          </span>
        ) : (
          <>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {accepted}/{lineup.length}
            </span>
            <span style={{ color: COLORS.inkMuted, fontWeight: 500 }}>
              on the lineup
            </span>
          </>
        )}
        {allConfirmed && lineup.length > 1 && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 9.5, fontWeight: 700,
            color: COLORS.success,
            padding: "1px 6px", borderRadius: 999,
            background: "#fff",
            textTransform: "uppercase", letterSpacing: 0.4,
            border: `1px solid ${COLORS.success}30`,
            flexShrink: 0,
          }}>
            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4.2l1.7 1.6L6.5 2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Locked
          </span>
        )}
      </div>
      {/* Right-side affordance:
          - coord/admin/client (canEdit) → small pencil icon = "edit"
          - regular talent → simple chevron = "view"
          The icon difference makes permissions readable at a glance
          without adding text chrome. */}
      <span aria-hidden style={{
        flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        color: COLORS.inkMuted,
        background: povLabel === "edit" ? "rgba(11,11,13,0.05)" : "transparent",
        marginRight: 2,
      }}>
        {povLabel === "edit" ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M8 2l2 2-6 6H2v-2l6-6zM7 3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      {/* Screen-reader edit/view cue */}
      <span style={{
        position: "absolute", width: 1, height: 1, padding: 0,
        margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap", border: 0,
      }}>{povLabel === "edit" ? "Edit lineup" : "View lineup"}</span>
    </button>
  );
}

// ── LineupDrawer — modal sheet for viewing + managing the lineup.
// Mobile: bottom sheet · Desktop: centered modal. Reuses the
// notifications-bell popover pattern but as a fixed-overlay dialog. ──
function LineupDrawer({
  open, onClose, conv, inquiry, canEdit, povCanSeeOffers, povCanSeeCoordNote,
  pickerPov = "talent_coord", planTier,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conversation;
  inquiry: InquiryRecord;
  canEdit: boolean;
  povCanSeeOffers: boolean;
  povCanSeeCoordNote: boolean;
  // Forwarded to AddTalentPicker so the tab labels read "Favorites /
  // Recent / All Tulala" for clients vs "Saved / Circle / All" for
  // coords + admins. Defaults to coord/admin framing.
  pickerPov?: "client" | "admin" | "talent_coord";
  /** Workspace plan tier — forwarded to AddTalentPicker so it can
   *  hide/show tier-specific tabs (Free hides Circle; Network adds
   *  Network roster). */
  planTier?: "free" | "studio" | "agency" | "network" | "hub-network";
}) {
  const { toast } = useProto();
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Lineup" style={{
      position: "fixed", inset: 0, zIndex: 9999,
      fontFamily: FONTS.body,
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(11,11,13,0.45)",
      }} />
      {/* Panel — desktop: centered modal; mobile: bottom sheet. */}
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-lineup-panel]{"
        + "left:0!important;right:0!important;top:auto!important;bottom:0!important;"
        + "transform:none!important;max-height:85vh!important;width:auto!important;"
        + "border-radius:16px 16px 0 0!important;"
        + "}"
        + "}"
      }} />
      <aside data-tulala-lineup-panel style={{
        position: "absolute",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 480, maxWidth: "calc(100vw - 32px)", maxHeight: "85vh",
        background: "#fff", borderRadius: 14,
        boxShadow: "0 32px 80px -16px rgba(11,11,13,0.40), 0 8px 24px rgba(11,11,13,0.10)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 700,
              color: COLORS.ink, letterSpacing: -0.2,
            }}>Lineup</h2>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 3 }}>
              {conv.client} · {conv.brief}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: 8,
            border: "none", background: "transparent",
            color: COLORS.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        {/* Coordinator note (only when relevant) */}
        {povCanSeeCoordNote && conv.pinned?.coordinatorNote && (
          <div style={{
            padding: "10px 16px",
            background: COLORS.royalSoft,
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            fontSize: 11.5, color: COLORS.royalDeep, lineHeight: 1.5,
          }}>
            <span style={{ fontWeight: 700, marginRight: 4 }}>Note from {conv.leader.name}:</span>
            <span style={{ fontStyle: "italic" }}>"{conv.pinned.coordinatorNote}"</span>
          </div>
        )}
        {/* Body — scrollable list of members */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: 12,
        }}>
          {pickerOpen ? (
            <AddTalentPicker
              onCancel={() => setPickerOpen(false)}
              onAdd={(name) => { toast(`${name} added to lineup`); setPickerOpen(false); }}
              pov={pickerPov}
              planTier={planTier}
            />
          ) : (
            <>
              {inquiry.talent.map(t => (
                <LineupMemberRow
                  key={t.talentId}
                  talent={t}
                  canEdit={canEdit}
                  povCanSeeOffers={povCanSeeOffers}
                  conv={conv}
                />
              ))}
              {/* Coordinator card — single-source contact, separate
                  visual register from the lineup rows. */}
              {inquiry.coordinators[0] && (
                <CoordinatorRow
                  coordinator={inquiry.coordinators[0]}
                  conv={conv}
                />
              )}
            </>
          )}
        </div>
        {/* Footer — add talent / done */}
        {canEdit && !pickerOpen && (
          <div style={{
            padding: 12,
            borderTop: `1px solid ${COLORS.borderSoft}`,
            display: "flex", gap: 8,
          }}>
            <button type="button" onClick={() => setPickerOpen(true)} style={{
              flex: 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "9px 14px", borderRadius: 999,
              border: "none", background: COLORS.fill, color: "#fff",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Add talent
            </button>
            <button type="button" onClick={onClose} style={{
              padding: "9px 16px", borderRadius: 999,
              border: `1px solid ${COLORS.border}`, background: "transparent",
              color: COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>Done</button>
          </div>
        )}
      </aside>
    </div>
  );
}

// ── LineupMemberRow — full row inside the drawer. Avatar + name +
// role + state pill + (optionally) offer amount + per-row actions. ──
function LineupMemberRow({
  talent, canEdit, povCanSeeOffers, conv,
}: {
  talent: { talentId: string; name: string; initials: string; state: string; photoUrl?: string };
  canEdit: boolean;
  povCanSeeOffers: boolean;
  conv: Conversation;
}) {
  const { toast } = useProto();
  const isMe = talent.talentId === currentTalentId() || talent.name === MY_TALENT_PROFILE.name;
  const stateMeta = (() => {
    const s = (talent.state || "").toLowerCase();
    if (s === "accepted" || s === "confirmed" || s === "booked") return { label: "Confirmed", bg: COLORS.successSoft, fg: COLORS.success };
    if (s === "pending" || s === "invited") return { label: "Pending", bg: `${COLORS.amber}18`, fg: COLORS.amber };
    if (s === "declined" || s === "rejected" || s === "withdrawn") return { label: "Declined", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
    return { label: "Standby", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
  })();
  const offer = povCanSeeOffers ? getOffer(conv.id) : null;
  const myRow = offer?.rows.find(r => r.talentName === talent.name);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", marginBottom: 6,
      background: isMe ? "rgba(91,107,160,0.04)" : "#fff",
      border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
    }}>
      <Avatar size={36} tone="auto" hashSeed={talent.name} initials={talent.initials} photoUrl={talent.photoUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 700, color: COLORS.ink,
        }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {talent.name}
          </span>
          {isMe && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
              background: COLORS.indigoDeep, color: "#fff",
              textTransform: "uppercase", letterSpacing: 0.3,
            }}>You</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
            background: stateMeta.bg, color: stateMeta.fg,
            textTransform: "uppercase", letterSpacing: 0.4,
          }}>{stateMeta.label}</span>
          {myRow && (
            <span style={{ fontSize: 11, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>
              · €{(myRow.clientRate * (myRow.units || 1)).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <button type="button" onClick={() => toast(`Open ${talent.name}'s profile`)} style={{
        flexShrink: 0,
        padding: "5px 10px", borderRadius: 999,
        border: `1px solid ${COLORS.border}`, background: "transparent",
        color: COLORS.ink, fontSize: 11, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>View</button>
      {canEdit && !isMe && (
        <button type="button" onClick={() => toast(`Remove ${talent.name} from lineup`)} aria-label={`Remove ${talent.name}`} style={{
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 8,
          border: "none", background: "transparent",
          color: COLORS.coral, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 4h8M5 4V2.5h4V4M4 4l.5 8h5L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// Coordinator row — visually distinct from talent rows. Always at the
// bottom of the lineup for context.
function CoordinatorRow({ coordinator, conv }: {
  coordinator: { id: string; name: string; initials: string; role?: string };
  conv: Conversation;
}) {
  const { toast } = useProto();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", marginBottom: 6,
      background: COLORS.indigoSoft,
      border: `1px solid ${COLORS.indigoDeep}20`, borderRadius: 10,
    }}>
      <Avatar size={36} tone="ink" hashSeed={coordinator.name} initials={coordinator.initials} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{coordinator.name}</div>
        <div style={{ fontSize: 11, color: COLORS.indigoDeep, marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Coordinator · {conv.agency}
        </div>
      </div>
      <button type="button" onClick={() => toast(`Messaging ${coordinator.name}…`)} style={{
        flexShrink: 0,
        padding: "5px 10px", borderRadius: 999,
        border: `1px solid ${COLORS.border}`, background: "#fff",
        color: COLORS.ink, fontSize: 11, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>Message</button>
    </div>
  );
}

// ── AddTalentPicker — mini search/picker for adding talent from your
// saved roster or your circle. Renders inside the LineupDrawer body
// (replaces the lineup list while open).
//
// Pov-aware tab labels: clients see "Favorites / Recent / All Tulala"
// (the language of someone who hires talent); coordinators / admins see
// "Saved / Circle / All" (the language of someone who manages talent).
// Same shape underneath — only the framing changes. ──
function AddTalentPicker({ onCancel, onAdd, pov = "talent_coord", planTier }: {
  onCancel: () => void;
  onAdd: (name: string) => void;
  pov?: "client" | "admin" | "talent_coord";
  /** Workspace plan tier — drives which tabs render in the picker.
   *  Free → hides Circle (no team to have a circle with).
   *  Studio/Agency → standard 3 tabs.
   *  Network → adds a 4th "Network roster" tab with cross-agency talent. */
  planTier?: "free" | "studio" | "agency" | "network" | "hub-network";
}) {
  // Tier-aware tab set — built before useState so the initial tab
  // selection respects what's available.
  const isFree = planTier === "free";
  const isNetwork = planTier === "network" || planTier === "hub-network";
  type PickerTab = "saved" | "circle" | "all" | "network";
  const availableTabs: PickerTab[] = isFree
    ? ["saved", "all"]                            // Free: no Circle
    : isNetwork
      ? ["saved", "circle", "all", "network"]     // Network: + Network roster
      : ["saved", "circle", "all"];               // Studio/Agency: standard
  const [tab, setTab] = useState<PickerTab>("saved");
  const [query, setQuery] = useState("");
  // Mock candidates per category. Production reads from your roster +
  // circle (people you've worked with before) for coord, or favorites
  // (talent you've bookmarked) + recent collaborators for client.
  const candidates: Record<PickerTab, Array<{ id: string; name: string; initials: string; meta: string }>> = pov === "client" ? {
    // Client POV — favorites = bookmarked talent; circle = people they
    // already booked at least once; all = the full Tulala hub.
    saved: [
      { id: "fav1", name: "Sara Mendez",     initials: "SM", meta: "Favorited · last booked Mar 2026" },
      { id: "fav2", name: "Diego Ferrer",    initials: "DF", meta: "Favorited · 3 past projects" },
      { id: "fav3", name: "Lyra Costa",      initials: "LC", meta: "Favorited · single hostess" },
    ],
    circle: [
      { id: "rec1", name: "Anouk Naseri",    initials: "AN", meta: "You worked together · Atelier Roma" },
      { id: "rec2", name: "Camille Roux",    initials: "CR", meta: "You worked together · Mango" },
      { id: "rec3", name: "Tomás Bianchi",   initials: "TB", meta: "You worked together · Loewe" },
    ],
    all: [
      { id: "h1", name: "Hana Matsumoto",    initials: "HM", meta: "Tulala Hub · 4.9★" },
      { id: "h2", name: "Riku Vesa",         initials: "RV", meta: "Tulala Hub · Berlin" },
      { id: "h3", name: "Sofia Andrade",     initials: "SA", meta: "Tulala Hub · Lisbon" },
    ],
    // Network — only renders on Network tier. Cross-workspace federation
    // talent: the meta line carries the home-agency name so admins know
    // which workspace each talent belongs to before adding them.
    network: [
      { id: "n1", name: "Aiko Tanaka",       initials: "AT", meta: "via Vela Hub · Tokyo · 4.8★" },
      { id: "n2", name: "Liam O'Sullivan",   initials: "LO", meta: "via North Coast Talent · Dublin" },
      { id: "n3", name: "Priya Iyengar",     initials: "PI", meta: "via Vela Hub · Mumbai · 4.9★" },
    ],
  } : {
    saved: [
      { id: "s1", name: "Cleo Vega",       initials: "CV", meta: "Co-coordinator · trusted backup" },
      { id: "s2", name: "Yael Soto",       initials: "YS", meta: "Talent · Madrid · saved 2x" },
      { id: "s3", name: "Tariq Joubert",   initials: "TJ", meta: "Fire dancer · Solstice crew" },
    ],
    circle: [
      { id: "c1", name: "Anouk Naseri",    initials: "AN", meta: "Worked together · 3 jobs" },
      { id: "c2", name: "Lucia Ortiz",     initials: "LO", meta: "Worked together · Loewe" },
      { id: "c3", name: "Camille Roux",    initials: "CR", meta: "Worked together · Mango" },
    ],
    all: [
      { id: "a1", name: "Hana Matsumoto",  initials: "HM", meta: "Tulala Hub · 4.9★" },
      { id: "a2", name: "Riku Vesa",       initials: "RV", meta: "Tulala Hub · Berlin" },
      { id: "a3", name: "Sofia Andrade",   initials: "SA", meta: "Tulala Hub · Lisbon" },
    ],
    network: [
      { id: "n1", name: "Aiko Tanaka",     initials: "AT", meta: "Vela Hub · Tokyo · 4.8★" },
      { id: "n2", name: "Liam O'Sullivan", initials: "LO", meta: "North Coast Talent · Dublin" },
      { id: "n3", name: "Priya Iyengar",   initials: "PI", meta: "Vela Hub · Mumbai · 4.9★" },
    ],
  };
  // Tab labels per pov + tier. Agency renames "Saved" to "Workspace
  // roster" because the saved bucket IS the agency's roster at that
  // tier. Network's 4th tab calls itself "Network roster".
  const tabLabel = (t: PickerTab) => {
    if (t === "network") return "Network roster";
    if (pov === "client") return t === "saved" ? "Favorites" : t === "circle" ? "Recent" : "All Tulala";
    if (planTier === "agency" || isNetwork) return t === "saved" ? "Workspace roster" : t === "circle" ? "Circle" : "All Tulala";
    return t === "saved" ? "Saved" : t === "circle" ? "Circle" : "All talent";
  };
  const emptyHint = (t: PickerTab) => {
    if (t === "network") return "the network roster";
    if (pov === "client") return t === "saved" ? "your favorites" : t === "circle" ? "talent you've worked with" : "all Tulala talent";
    if (planTier === "agency" || isNetwork) return t === "saved" ? "your workspace roster" : t === "circle" ? "your circle" : "all Tulala talent";
    return t === "saved" ? "your saved" : t === "circle" ? "your circle" : "all talent";
  };
  const filtered = candidates[tab].filter(c =>
    !query.trim() || c.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={onCancel} aria-label="Back" style={{
          width: 26, height: 26, borderRadius: 7,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>Add talent</div>
      </div>
      {/* Tabs */}
      <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {availableTabs.map(t => (
          <button key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "6px 10px", borderRadius: 8,
              border: `1px solid ${tab === t ? COLORS.accent : COLORS.borderSoft}`,
              background: tab === t ? COLORS.fill : "transparent",
              color: tab === t ? "#fff" : COLORS.inkMuted,
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              textTransform: "capitalize", fontFamily: FONTS.body,
            }}>
            {tabLabel(t)}
          </button>
        ))}
      </div>
      {/* Search */}
      <input
        type="text"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          padding: "8px 12px", borderRadius: 8,
          border: `1px solid ${COLORS.borderSoft}`, background: COLORS.surfaceAlt,
          fontSize: 12.5, color: COLORS.ink, fontFamily: FONTS.body,
          outline: "none",
        }}
      />
      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: COLORS.inkMuted }}>
            No matches in {emptyHint(tab)}.
          </div>
        )}
        {filtered.map(c => (
          <button key={c.id}
            type="button"
            onClick={() => onAdd(c.name)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
          >
            <Avatar size={30} tone="auto" hashSeed={c.name} initials={c.initials} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
              <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 1 }}>{c.meta}</div>
            </div>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: COLORS.accent }}>
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationActionPin({ conv }: { conv: Conversation }) {
  const { toast } = useProto();
  // Look at the most recent action message in the thread to figure out
  // what's actually being asked. Beats stage-based heuristics — the
  // pin reflects the conversation, not just the funnel position.
  const messages = MOCK_THREAD[`${conv.id}:talent`] ?? MOCK_THREAD[conv.id] ?? [];
  const lastAction = [...messages].reverse().find(m =>
    (m.kind === "action-rate" || m.kind === "action-confirm" || m.kind === "action-transport" || m.kind === "polaroid-request" || m.kind === "contract-sign") &&
    !("resolved" in m && m.resolved)
  );

  // COORD-SIDE — Marta is the coordinator and there's an outstanding
  // ask from the client that needs to be dispatched to the team. Used
  // when the booking-team thread carries a "client wants X by Y" cue
  // and Marta hasn't closed the loop yet (e.g. c7 crew assets, c10
  // pending NDAs). Surfaces in BOTH threads so the coord can act from
  // wherever they are.
  if (conv.iAmCoordinator && conv.stage === "booked") {
    if (conv.id === "c7") {
      return (
        <ActionPinShell tone="amber" icon="📝"
          title="Crew assets due Jun 14"
          body="Solstice needs updated bios + portrait shots for the festival program. Tariq and Anouk haven't dropped them in Files yet."
          primary={{ label: "Nudge crew", onClick: () => toast("Reminder sent to Tariq + Anouk") }}
          secondary={{ label: "Upload mine", onClick: () => toast("Asset uploader") }}
        />
      );
    }
  }

  // HOLD — deadline countdown takes priority over generic actions.
  if (conv.stage === "hold") {
    return (
      <ActionPinShell tone="amber" icon="⏰"
        title="Hold expires in 4h"
        body="Confirm now to keep this slot, or release it for the next talent."
        primary={{ label: "Confirm hold", onClick: () => toast("Hold confirmed") }}
        secondary={{ label: "Release", onClick: () => toast("Hold released") }}
      />
    );
  }

  // BOOKED — surface unresolved action-confirm (e.g. call sheet).
  if (conv.stage === "booked" && lastAction?.kind === "action-confirm") {
    return (
      <ActionPinShell tone="indigo" icon="📋"
        title={lastAction.label || "Action needed"}
        body="Coordinator is waiting for your sign-off before set day."
        primary={{ label: "Confirm", onClick: () => toast(`${lastAction.label || "Action"} confirmed`) }}
        secondary={{ label: "Question", onClick: () => toast("Reply to coordinator") }}
      />
    );
  }

  // INQUIRY — pick the right ask based on the freshest action.
  if (conv.stage === "inquiry") {
    if (lastAction?.kind === "action-rate") {
      return (
        <ActionPinShell tone="indigo" icon="💸"
          title="Submit your rate"
          body={`${conv.leader?.name?.split(" ")[0] ?? "The coordinator"} is waiting on your number to send the offer to the client.`}
          primary={{ label: "Submit rate", onClick: () => toast("Rate submitted") }}
          secondary={{ label: "Ask coordinator to set", onClick: () => toast("Quote requested") }}
        />
      );
    }
    if (lastAction?.kind === "polaroid-request") {
      return (
        <ActionPinShell tone="indigo" icon="📸"
          title="Polaroids requested"
          body="Send 6 fresh polaroids so the client can pre-approve the look."
          primary={{ label: "Upload polaroids", onClick: () => toast("Polaroid uploader") }}
        />
      );
    }
    return (
      <ActionPinShell tone="indigo" icon="✋"
        title="Coordinator invited you"
        body={`Reply to ${conv.leader?.name ?? "the coordinator"} or accept the inquiry to lock your spot.`}
        primary={{ label: "Accept", onClick: () => toast("Inquiry accepted") }}
        secondary={{ label: "Decline", onClick: () => toast("Inquiry declined") }}
      />
    );
  }
  return null;
}

function ActionPinShell({
  tone, icon, title, body, primary, secondary,
}: {
  tone: "amber" | "indigo" | "coral";
  icon: string;
  title: string;
  body: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  const palette = tone === "amber"
    ? { bg: `${COLORS.amber}14`, border: `${COLORS.amber}40`, fg: COLORS.amber, primaryBg: COLORS.amber }
    : tone === "coral"
    ? { bg: `${COLORS.coral}14`, border: `${COLORS.coral}40`, fg: COLORS.coral, primaryBg: COLORS.coral }
    : { bg: COLORS.indigoSoft, border: `${COLORS.indigo}40`, fg: COLORS.indigoDeep, primaryBg: COLORS.indigoDeep };
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px",
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 10, fontFamily: FONTS.body,
    }}>
      <span aria-hidden style={{
        flexShrink: 0, fontSize: 14, lineHeight: 1,
        width: 24, height: 24, borderRadius: 6,
        background: "rgba(255,255,255,0.6)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: palette.fg, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: COLORS.ink, marginTop: 2, lineHeight: 1.45 }}>{body}</div>
        {(primary || secondary) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {primary && (
              <button type="button" onClick={primary.onClick} style={{
                padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                border: "none", background: palette.primaryBg, color: "#fff", cursor: "pointer",
              }}>{primary.label}</button>
            )}
            {secondary && (
              <button type="button" onClick={secondary.onClick} style={{
                padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
              }}>{secondary.label}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CrossThreadBridge — a low-key sliver that tells non-coord talent:
// "the coord is also negotiating with the client; here's a stage-aware
// snapshot of what's happening over there." Doesn't leak message bodies —
// just the meta-state. Closes the awareness gap. ──
function CrossThreadBridge({ who, clientName, stage }: { who: string; clientName: string; stage: string }) {
  const summary = (() => {
    if (stage === "inquiry") return `${who} is briefing ${clientName}. You'll get a heads-up when the offer is being drafted.`;
    if (stage === "hold") return `${who} is finalizing terms with ${clientName}. Your hold is locked while they review.`;
    if (stage === "booked") return `${who} is the day-of point with ${clientName}.`;
    if (stage === "past") return `${who} closed the loop with ${clientName} after the shoot.`;
    return `${who} is in conversation with ${clientName}.`;
  })();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 11px",
      background: "rgba(11,11,13,0.025)",
      border: `1px dashed ${COLORS.borderSoft}`,
      borderRadius: 8, fontFamily: FONTS.body,
      fontSize: 11.25, color: COLORS.inkMuted, lineHeight: 1.45,
    }}>
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.6 }}>
        <path d="M3 4h6M3 7h4M3 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="11" cy="3" r="1" fill="currentColor"/>
      </svg>
      <span><strong style={{ color: COLORS.ink, fontWeight: 600 }}>Client side</strong> · {summary}</span>
    </div>
  );
}

// ── Chat stream + composer (shared by talent + client tabs) ──
function ConversationTab({
  conv, placeholder, threadKey, crossThreadBridge,
  /** Permissions / shape from the host shell. Drives whether the
   *  TeamStrip lets the user edit the lineup, see fees, etc. */
  povCanEditLineup = false,
  povCanSeeOffers = false,
  povCanSeeCoordNote = true,
}: {
  conv: Conversation;
  placeholder: string;
  threadKey: string;
  /** Non-coord talent doesn't see the client thread — but they should
   *  know it exists. This thin sliver tells them "the coord is also
   *  brokering the client side, you'll be looped in on the outcome."
   *  Now surfaces inside the LineupDrawer rather than a banner. */
  crossThreadBridge?: { who: string; clientName: string };
  povCanEditLineup?: boolean;
  povCanSeeOffers?: boolean;
  povCanSeeCoordNote?: boolean;
}) {
  const { toast } = useProto();
  const [lineupOpen, setLineupOpen] = useState(false);
  const inquiryForLineup = useMemo(() => convToInquiry(conv), [conv]);
  // Subscribe to message-stash updates so newly-sent messages appear
  // immediately. Without this, the composer pushes into the store but
  // React doesn't know to re-render this thread.
  useMessageStashSubscription();
  // Look up the per-thread message bank first (e.g. "c7:talent" /
  // "c7:client" for coord-talent jobs that have BOTH threads). Fall
  // back to the unscoped conv.id bank for jobs where booking-team is
  // the only visible thread. Local stash appends "Just now" messages
  // the talent has sent in this session — no backend, but the demo
  // walkthrough now reads "send → see your bubble".
  const seedMessages = MOCK_THREAD[threadKey] ?? MOCK_THREAD[conv.id] ?? [];
  const stashKey = MOCK_THREAD[threadKey] ? threadKey : conv.id;
  const localMessages = readLocalMessages(stashKey).map(m => ({
    id: m.id, kind: "text" as const, sender: m.sender, body: m.body, ts: m.ts, readBy: [],
  }));
  const messages = [...seedMessages, ...localMessages];
  // In-thread search — small toggle in the header opens a compact
  // search input that filters visible bubbles to those whose body
  // matches. System events are kept (they often anchor the search
  // in a date range, e.g. "show me what happened around the booking").
  const [searchOpen, setSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const allTextMessages = messages.filter(m => m.kind === "text") as Array<Extract<(typeof messages)[number], { kind: "text" }>>;
  const textMessages = threadSearch.trim()
    ? allTextMessages.filter(m => m.body.toLowerCase().includes(threadSearch.toLowerCase()))
    : allTextMessages;
  // System events surface centered between message clusters — same data
  // the Activity timeline shows, so the two views never drift.
  const systemEvents = messages.filter(m => m.kind === "system") as Array<Extract<(typeof messages)[number], { kind: "system" }>>;

  // Suppress 'unused' for crossThreadBridge — kept in the API in case
  // a caller needs to surface it explicitly later. The bridge content
  // is now folded into the LineupDrawer (more durable surface).
  void crossThreadBridge;

  // Stub: simulate the coordinator typing on active threads (presence cue).
  const showTyping = textMessages.length > 0 && (conv.stage === "inquiry" || conv.stage === "hold");

  return (
    <div style={{
      // Premium chat layout: fixed top (pins) → scrollable middle
      // (messages) → fixed bottom (composer). Replaces the prior single
      // scrolling block that pushed the composer + pin off-screen as
      // history grew.
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      fontFamily: FONTS.body,
    }}>
      {/* Fixed top — slim TeamStrip showing all members at a glance.
          Replaces the old stack of pinned notes (action pin + coord
          note + cross-thread bridge), which ate vertical space. The
          coordinator note + the cross-thread "client side" snippet
          now live inside the LineupDrawer that opens on tap. */}
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 0",
        background: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TeamStrip
              lineup={inquiryForLineup.talent}
              canEdit={povCanEditLineup}
              povLabel={povCanEditLineup ? "edit" : "view"}
              onOpen={() => setLineupOpen(true)}
            />
          </div>
          {/* In-thread search toggle. Click reveals a compact search
              input + filters bubbles to those whose body matches. Esc
              clears + closes. */}
          <button type="button"
            onClick={() => { setSearchOpen(o => !o); if (searchOpen) setThreadSearch(""); }}
            aria-label={searchOpen ? "Close thread search" : "Search this thread"}
            title={searchOpen ? "Close search" : "Search this thread"}
            style={{
              flexShrink: 0,
              width: 30, height: 30, borderRadius: 8,
              border: `1px solid ${searchOpen ? COLORS.accent : COLORS.borderSoft}`,
              background: searchOpen ? COLORS.accentSoft : "#fff",
              color: searchOpen ? COLORS.accentDeep : COLORS.inkMuted,
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {searchOpen && (
          <div style={{ marginTop: 8 }}>
            <input
              type="text"
              autoFocus
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setThreadSearch(""); setSearchOpen(false); } }}
              placeholder="Search in this thread…"
              style={{
                width: "100%", padding: "7px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`,
                background: COLORS.surfaceAlt,
                fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
                outline: "none", boxSizing: "border-box",
              }}
            />
            {threadSearch.trim() && (
              <div style={{ marginTop: 4, fontSize: 10.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
                {textMessages.length} match{textMessages.length === 1 ? "" : "es"} for &ldquo;{threadSearch}&rdquo;
              </div>
            )}
          </div>
        )}
        <LineupDrawer
          open={lineupOpen}
          onClose={() => setLineupOpen(false)}
          conv={conv}
          inquiry={inquiryForLineup}
          canEdit={povCanEditLineup}
          povCanSeeOffers={povCanSeeOffers}
          povCanSeeCoordNote={povCanSeeCoordNote}
        />
        {/* First-time conv context banner — surfaces only when this
            client is in our "first encounter" set. Audience defaults
            to talent (the most common ConversationTab consumer);
            client + coord-talent both fall under the same friendly
            framing here. */}
        {isFirstConvWith(conv.client) && (
          <div style={{ marginTop: 8, marginLeft: -14, marginRight: -14 }}>
            <FirstConvBanner clientName={conv.client} audience="talent" />
          </div>
        )}
      </div>
      {/* Scrollable middle — message stream + system events. Only THIS
          area scrolls; the pins and composer stay locked in view. */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "10px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {systemEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
            {systemEvents.map(e => (
              <SystemEventBubble key={e.id} body={e.body} ts={e.ts} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {textMessages.length === 0 ? (
          <ConversationEmptyState />
        ) : textMessages.map((m, idx) => {
          const mine = m.sender === "you";
          const lastMine = mine && idx === textMessages.length - 1;
          const prevDay = idx > 0 ? dayKey(textMessages[idx - 1]!.ts) : null;
          const thisDay = dayKey(m.ts);
          const showDay = thisDay !== prevDay;
          // Workspace bubble = the System User. Resolves to the
          // workspace identity registered for conv.agency, falling
          // back to a synthesized one. Shown with the workspace name +
          // logo + a "Workspace" role label so recipients know this
          // is the agency speaking, not an individual coord.
          const wsIdentity = m.sender === "workspace" ? getWorkspaceIdentity(conv.agency) : null;
          const senderName =
              m.sender === "coordinator" ? conv.leader.name
            : m.sender === "client" ? conv.client
            : m.sender === "agency" ? conv.agency
            : m.sender === "workspace" ? wsIdentity!.name
            : "You";
          const senderInitials =
              m.sender === "coordinator" ? conv.leader.initials
            : m.sender === "client" ? conv.clientInitials
            : m.sender === "agency" ? conv.agency.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
            : m.sender === "workspace" ? wsIdentity!.initials
            : "ME";
          const roleLabel = m.sender === "you" ? null
            : m.sender === "workspace" ? "workspace"
            : m.sender;
          return (
            <React.Fragment key={m.id}>
            {showDay && <DaySeparator label={thisDay} />}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
              {!mine && (
                <Avatar
                  size={26}
                  tone={m.sender === "coordinator" || m.sender === "workspace" ? "ink" : "auto"}
                  hashSeed={senderName}
                  initials={senderInitials}
                  photoUrl={m.sender === "workspace" ? wsIdentity?.logoUrl : undefined}
                />
              )}
              <div style={{
                maxWidth: "78%",
                background: mine ? COLORS.fill : COLORS.surfaceAlt,
                color: mine ? "#fff" : COLORS.ink,
                padding: "9px 12px",
                borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                fontSize: 13, lineHeight: 1.45,
              }}>
                {!mine && (
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted, marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span>{senderName}{roleLabel ? <span style={{ fontWeight: 500 }}> · {roleLabel}</span> : null}</span>
                    {m.sender === "workspace" && (
                      <span title="Workspace System User — the agency speaking, not an individual" style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "0 5px", borderRadius: 999,
                        background: COLORS.indigoSoft, color: COLORS.indigoDeep,
                        fontSize: 8.5, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
                          <path d="M2 1.5h4l1 1.5v3l-1 1.5H2l-1-1.5v-3l1-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                        </svg>
                        System
                      </span>
                    )}
                    {/* Phase 5 — Network multi-workspace attribution.
                        When the conv came in via an agency referral
                        AND this is a workspace-sent bubble, surface
                        the referring agency alongside the sender's
                        workspace so both parties' identities are
                        visible in the federated context. */}
                    {m.sender === "workspace"
                      && conv.source?.kind === "agency-referral"
                      && (conv.source as { via?: string }).via
                      && (conv.source as { via?: string }).via !== conv.agency && (
                      <span title={`Referred via ${(conv.source as { via?: string }).via}`} style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "0 5px", borderRadius: 999,
                        background: "rgba(46,125,91,0.14)", color: "#1F5C40",
                        fontSize: 8.5, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
                          <circle cx="2.5" cy="4" r="1" stroke="currentColor" strokeWidth="0.9"/>
                          <circle cx="5.5" cy="4" r="1" stroke="currentColor" strokeWidth="0.9"/>
                          <path d="M3.5 4h1" stroke="currentColor" strokeWidth="0.9"/>
                        </svg>
                        ↔ {(conv.source as { via?: string }).via}
                      </span>
                    )}
                  </div>
                )}
                {renderWithMentions(m.body, mine)}
                <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.55)" : COLORS.inkDim, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {m.ts}
                  {mine && (
                    <span aria-hidden style={{ display: "inline-flex" }}>
                      <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4.8L3.5 7L7 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 4.8L7.5 7L11 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
                  {lastMine && (
                    <span style={{ marginLeft: 4, fontWeight: 500 }}>· Read</span>
                  )}
                </div>
              </div>
            </div>
            </React.Fragment>
          );
        })}
        {showTyping && <TypingIndicator who={conv.leader.name.split(" ")[0]} />}
        </div>
      </div>
      {/* Fixed composer — locked at the bottom of the visible area so
          users can always reply without scrolling. Closed convs
          (cancelled / past) replace the composer with a closure
          notice — typing into a dead conversation makes no sense and
          would mislead the demo into "I sent something but nothing
          happened" confusion. */}
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 14px",
        background: "#fff",
        borderTop: `1px solid ${COLORS.borderSoft}`,
      }}>
        {(conv.stage === "cancelled" || conv.stage === "past") ? (
          <div style={{
            padding: "10px 14px",
            borderRadius: 999,
            background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted,
          }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
            {conv.stage === "past"
              ? "Conversation wrapped · the project is paid + closed."
              : conv.outcome === "client_cancelled"
                ? "Closed · the client cancelled this project."
                : conv.outcome === "client_rejected"
                  ? "Closed · the client passed on the offer."
                  : conv.outcome === "client_no_response"
                    ? "Closed · auto-expired (no client response in the window)."
                    : "Conversation closed."}
          </div>
        ) : (
          <DraftComposer
            threadKey={threadKey}
            placeholder={placeholder}
            onSend={(text) => {
              appendLocalMessage(stashKey, text);
              toast("Message sent");
            }}
            workspaceName={conv.agency}
            canSendAsWorkspace={povCanSeeOffers}
            onSendAsWorkspace={(text) => {
              appendLocalMessage(stashKey, text, "workspace");
              toast(`Sent as ${conv.agency}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ConversationEmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "32px 16px", color: COLORS.inkDim, fontFamily: FONTS.body, textAlign: "center",
    }}>
      <span aria-hidden style={{
        width: 36, height: 36, borderRadius: "50%",
        background: COLORS.surfaceAlt, color: COLORS.inkMuted,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginBottom: 4,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H7l-3 2.5V12H3c-.6 0-1-.4-1-1V5c0-.6.4-1 1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
      </span>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>No messages yet</div>
      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, maxWidth: 240 }}>
        Start the conversation below — your message will go to the right people in this thread.
      </div>
    </div>
  );
}

function TypingIndicator({ who }: { who: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 12px", color: COLORS.inkMuted,
      fontFamily: FONTS.body, fontSize: 11, fontStyle: "italic",
    }}>
      <span style={{ display: "inline-flex", gap: 2 }}>
        {[0, 1, 2].map(i => (
          <span key={i} aria-hidden style={{
            width: 5, height: 5, borderRadius: "50%", background: COLORS.inkMuted,
            opacity: 0.6,
            animation: `tulalaTypingDot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }} />
        ))}
      </span>
      {who} is typing…
      <style>{`
        @keyframes tulalaTypingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

// Composer that persists drafts per (inquiry, thread) so switching tabs
// doesn't lose typed text. Uses an in-memory map keyed by `threadKey`.
// Includes: voice note button, AI smart-reply chip, draft persistence.
const __draftStore: Map<string, string> = new Map();

const SMART_REPLIES_FOR_LAST: Record<string, string[]> = {
  inquiry: ["Got it — pulling options", "When do you need it by?", "On it."],
  hold:    ["Confirming with talent", "Sending revised offer", "Will update by EOD"],
  offer:   ["Approved — proceeding", "Can we adjust dates?", "Need budget breakdown"],
  default: ["Sounds good", "Let me check", "Confirming shortly"],
};

function DraftComposer({
  threadKey, placeholder, onSend, smartReplyContext = "default",
  // Phase 4 of System User direction — when both `workspaceName` is
  // provided AND the caller has permission (coord+ in a paid tier),
  // a small "Send as" toggle appears letting the user post as the
  // workspace identity rather than themselves. The composer doesn't
  // enforce permissions itself; callers gate availability via the
  // `canSendAsWorkspace` flag.
  workspaceName,
  canSendAsWorkspace = false,
  onSendAsWorkspace,
}: {
  threadKey: string;
  placeholder: string;
  onSend: (text: string) => void;
  smartReplyContext?: string;
  workspaceName?: string;
  canSendAsWorkspace?: boolean;
  onSendAsWorkspace?: (text: string) => void;
}) {
  const { toast } = useProto();
  const [val, setVal] = useState(() => __draftStore.get(threadKey) ?? "");
  const [hasSent, setHasSent] = useState(false);
  // Send-as state — defaults to "you" so accidental posts don't
  // attribute to the workspace.
  const [sendAs, setSendAs] = useState<"you" | "workspace">("you");
  const wsAvailable = canSendAsWorkspace && !!workspaceName && !!onSendAsWorkspace;
  // Smart replies are now hidden by default — they were eating
  // composer real-estate every thread. A small sparkle button toggles
  // them. Auto-collapse when the user starts typing or sends.
  const [smartOpen, setSmartOpen] = useState(false);
  useEffect(() => {
    if (val) __draftStore.set(threadKey, val); else __draftStore.delete(threadKey);
    if (val) setSmartOpen(false); // typing closes the suggestions
  }, [val, threadKey]);
  useEffect(() => {
    setVal(__draftStore.get(threadKey) ?? "");
    setHasSent(false);
    setSmartOpen(false); // switching threads collapses the panel
  }, [threadKey]);
  const replies = SMART_REPLIES_FOR_LAST[smartReplyContext] ?? SMART_REPLIES_FOR_LAST.default;
  const handleSend = (text: string) => {
    if (sendAs === "workspace" && wsAvailable) {
      onSendAsWorkspace!(text);
    } else {
      onSend(text);
    }
    setVal(""); setHasSent(true); setSmartOpen(false);
    // After sending as workspace, snap back to "you" so consecutive
    // sends don't all auto-attribute to the workspace by accident.
    setSendAs("you");
  };
  const canShowSmart = !val && !hasSent && (replies?.length ?? 0) > 0;

  return (
    <div data-tulala-composer-wrap style={{ marginTop: 8 }}>
      {/* Smart-reply chips row — opt-in. Click the sparkle button next
          to the composer to expand. Auto-collapses when the user types
          or sends. Saves ~36px of vertical chrome on every thread. */}
      {smartOpen && canShowSmart && (
        <div data-tulala-smart-replies style={{
          display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap",
          alignItems: "center",
          animation: "tulala-smart-fade .16s cubic-bezier(.4,0,.2,1)",
        }}>
          <style dangerouslySetInnerHTML={{ __html:
            "@keyframes tulala-smart-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}"
          }} />
          {(replies ?? []).map((r, i) => (
            <button key={i} type="button" onClick={() => { setVal(r); setSmartOpen(false); }} style={{
              padding: "5px 11px", borderRadius: 999,
              background: COLORS.royalSoft,
              border: `1px solid rgba(95,75,139,0.18)`,
              color: COLORS.royal,
              fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500,
              cursor: "pointer",
            }}>
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSmartOpen(false)}
            aria-label="Hide smart replies"
            title="Hide suggestions"
            style={{
              marginLeft: "auto",
              width: 22, height: 22, borderRadius: "50%",
              border: "none", background: "transparent",
              color: COLORS.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}
      {/* Send-as picker — only renders when the caller can post as
          the workspace (paid tier + coord+ role). Two pill buttons:
          You / <Workspace>. Selected pill carries the indigo System
          User palette so the user always knows which identity will
          attribute the next send. Resets to "You" after each send. */}
      {wsAvailable && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body, marginRight: 2 }}>
            Send as
          </span>
          <button type="button"
            onClick={() => setSendAs("you")}
            aria-pressed={sendAs === "you"}
            style={{
              padding: "3px 10px", borderRadius: 999,
              border: `1px solid ${sendAs === "you" ? COLORS.fill : COLORS.borderSoft}`,
              background: sendAs === "you" ? COLORS.fill : "#fff",
              color: sendAs === "you" ? "#fff" : COLORS.ink,
              fontSize: 10.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            You
          </button>
          <button type="button"
            onClick={() => setSendAs("workspace")}
            aria-pressed={sendAs === "workspace"}
            title={`Post as ${workspaceName} — System User identity`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: 999,
              border: `1px solid ${sendAs === "workspace" ? COLORS.indigoDeep : COLORS.borderSoft}`,
              background: sendAs === "workspace" ? COLORS.indigoSoft : "#fff",
              color: sendAs === "workspace" ? COLORS.indigoDeep : COLORS.ink,
              fontSize: 10.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
            <svg width="9" height="9" viewBox="0 0 8 8" fill="none" aria-hidden>
              <path d="M2 1.5h4l1 1.5v3l-1 1.5H2l-1-1.5v-3l1-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            {workspaceName}
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button type="button" aria-label="Attach file" onClick={() => toast("Attach a file…")} style={{
          width: 36, height: 36, borderRadius: "50%", border: "none",
          background: "transparent", color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M11 4.5v6a3 3 0 11-6 0V4a2 2 0 014 0v6a1 1 0 11-2 0V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Sparkle toggle — opens the smart-reply panel above. Only
            renders before the user has sent / started typing in this
            thread (post-send, suggestions stop being relevant). */}
        {canShowSmart && (
          <button
            type="button"
            onClick={() => setSmartOpen((v) => !v)}
            aria-expanded={smartOpen}
            aria-label={smartOpen ? "Hide smart replies" : "Show smart replies"}
            title="Smart replies"
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: smartOpen ? COLORS.royalSoft : "transparent",
              color: COLORS.royal, cursor: "pointer", flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "background .12s",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v2.5M6 8.5V11M1 6h2.5M8.5 6H11M2.5 2.5l1.7 1.7M7.8 7.8l1.7 1.7M9.5 2.5L7.8 4.2M4.2 7.8l-1.7 1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        <input
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) handleSend(val); }}
          placeholder={placeholder}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 24,
            background: "rgba(11,11,13,0.04)", border: `1.5px solid ${val ? COLORS.accent : "transparent"}`,
            fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink, outline: "none",
          }}
        />
        {!val && (
          <button type="button" aria-label="Voice note" onClick={() => toast("Voice note recording…")} style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            background: "transparent", color: COLORS.inkMuted, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M3 8a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        <button type="button" disabled={!val.trim()} onClick={() => { if (val.trim()) handleSend(val); }}
          aria-label="Send"
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            cursor: val.trim() ? "pointer" : "default",
            background: val.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: val.trim() ? "#fff" : COLORS.inkDim,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12.5 7H1.5M12.5 7L8 2.5M12.5 7L8 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
