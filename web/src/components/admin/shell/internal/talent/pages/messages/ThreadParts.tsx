"use client";

import { useState, type ReactNode } from "react";
import { useDashboardText } from "../../../dashboard-i18n";
import { ActivityFeedItem, Icon, scrollBehavior } from "../../../primitives";
import { COLORS, FONTS } from "../../../state";
import { MessageBubble } from "./Bubbles";
import { TypingIndicator } from "./Bubbles2";
import { type Msg } from "../../shared/client-conversations-1";
import { type Conversation, type MsgStage } from "../../shared/conversations-1";



// Module-level cache of scroll positions per conversation id. Survives
// conversation switches within the same mount of TalentMessagesPage so
// reopening a thread lands you back where you left off.
export const __threadScrollMap = new Map<string, number>();


// Mock unsent drafts per conversation id. In production this is server-
// persisted (or local-storage-cached). Showing "Draft: …" on the inbox
// row is a tiny UX win that prevents talent from forgetting half-written
// replies. Keys must match Conversation.id.
export const MOCK_DRAFTS: Record<string, string> = {
  "c4": "Sounds good, let me check…",
};


// Mock pre-existing reactions on specific message ids. Demonstrates the
// reactions UX without requiring a real reactions store. Keys must match
// Msg.id values from MOCK_THREAD.
export const MOCK_REACTIONS: Record<string, string[]> = {
  "c1m4": ["👍"],
  "c2m4": ["❤️", "🙏"],
};


/**
 * Activity timeline — shows the lifecycle of this conversation as a
 * timeline (stage transitions, calendar invites accepted, rates quoted,
 * etc.). Mock seeded from the conversation messages — in production this
 * would be a server-side activity log.
 */
export function ThreadActivityTimeline({ conv }: { conv: Conversation }) {
  // Mock activity events derived from the conv state. Real impl would
  // query the activity_log table filtered by conversation_id.
  type TimelineEvent = { actor: string; action: string; target: string; timestamp: string; icon: string };
  const events: TimelineEvent[] = [
    { actor: "System",      action: "created inquiry from",  target: conv.client,           timestamp: "Apr 22 · 10:14", icon: "📩" },
    { actor: "Sara",        action: "assigned as",           target: "coordinator",          timestamp: "Apr 23 · 09:00", icon: "👤" },
    { actor: "Coordinator", action: "quoted rate",           target: "€1,200/day",           timestamp: "Apr 24 · 14:32", icon: "💸" },
    ...(conv.stage === "hold" || conv.stage === "booked" ? [
      { actor: "System",    action: "opened hold for",       target: conv.date ?? "TBD",     timestamp: "Apr 26 · 09:00", icon: "📅" },
    ] : []),
    ...(conv.stage === "booked" ? [
      { actor: "Client",    action: "confirmed booking",     target: "",                     timestamp: "Apr 27 · 11:18", icon: "✅" },
      { actor: "System",    action: "issued contract",       target: "",                     timestamp: "Apr 27 · 11:20", icon: "📑" },
    ] : []),
  ];
  return (
    <div style={{ padding: "16px 18px" }}>
      {/* Vertical timeline line runs behind the ActivityFeedItem icon circles */}
      <div className="relative">
        {events.length > 1 && (
          <div style={{
            position: "absolute",
            top: 24,
            bottom: 24,
            left: 13,
            width: 2,
            background: COLORS.borderSoft,
            borderRadius: 1,
          }} />
        )}
        {events.map((e, i) => (
          <ActivityFeedItem
            key={i}
            actor={e.actor}
            action={e.action}
            target={e.target}
            timestamp={e.timestamp}
            icon={e.icon}
          />
        ))}
      </div>
    </div>
  );
}


/**
 * Inline rate-change request — the talent can always ask for more,
 * even on a locked booking. Submits a structured request to the
 * coordinator (private), who decides whether/how to take it to the
 * client. The submission also drops a system-style message in the
 * chat thread so the request is visible in the timeline.
 */
export function RateChangeRequest({ currentValue }: { currentValue: string }) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState("");
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "transparent",
          border: "none",
          padding: 0,
          marginTop: 8,
          cursor: "pointer",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 600,
          color: COLORS.indigo,
        }}
      >
        {copy.t("Request a change →")}
      </button>
    );
  }
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "rgba(11,11,13,0.03)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
        animation: "tulala-fade-in .15s ease",
      }}
    >
      <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }} className="text-admin-ink-muted">
        {copy.t("Currently")} <strong className="text-admin-ink">{currentValue || "—"}</strong>.{" "}
        {copy.t("Your reply goes private to the coordinator first.")}
      </div>
      <input
        type="text"
        placeholder={copy.t("Proposed (e.g. €4,000)")}
        value={proposed}
        onChange={(e) => setProposed(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.ink,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 6,
          marginBottom: 6,
          boxSizing: "border-box",
        }}
      />
      <textarea
        placeholder={copy.t("Reason (optional) — e.g. scope expanded, extra usage…")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.ink,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 6,
          marginBottom: 8,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => { setOpen(false); setProposed(""); setReason(""); }}
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
          }}
        >
          {copy.t("Cancel")}
        </button>
        <button
          type="button"
          disabled
          title={copy.t("Rate change requests coming soon")}
          style={{
            padding: "5px 10px",
            background: "rgba(11,11,13,0.12)",
            border: "none",
            borderRadius: 6,
            cursor: "not-allowed",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
            color: COLORS.inkMuted,
          }}
        >
          {copy.t("Send request")}
        </button>
      </div>
    </div>
  );
}


export function InfoSection({
  icon,
  label,
  locked,
  children,
}: {
  icon: "map-pin" | "calendar" | "external" | "info" | "user";
  label: string;
  locked?: boolean;
  children: ReactNode;
}) {
  const copy = useDashboardText();
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
        <Icon name={icon} size={11} color={COLORS.inkMuted} stroke={1.7} />
        {label}
        {locked && <span aria-label={copy.t("locked")} style={{ marginLeft: 4 }}>🔒</span>}
      </div>
      {children}
    </div>
  );
}


/**
 * Premium message stream renderer. Groups by day and inserts subtle
 * date separators between blocks. Also handles consecutive-from-same-
 * sender visual grouping (tighter spacing, avatar only on first).
 *
 * The "New messages" divider appears before the (unreadCount)-th
 * latest non-self message — matches WhatsApp/iMessage behaviour.
 */
// ─── WS-13.3: Virtuoso scroll-behavior helper ─────────────────────────────────
/** Maps our scrollBehavior() ("smooth"|"instant") to Virtuoso's narrower
 *  "smooth"|"auto" union.  "instant" → "auto" because Virtuoso treats
 *  "auto" as the non-animated option, matching prefers-reduced-motion. */
export function vsb(): "smooth" | "auto" {
  return scrollBehavior() === "smooth" ? "smooth" : "auto";
}


// ─── WS-13.3: Data-driven renderables for Virtuoso virtualization ─────────────
type MsgRenderable =
  | { kind: "separator"; label: string }
  | { kind: "unread-divider"; count: number }
  | { kind: "message"; msg: Msg; stage: MsgStage; isFirstOfGroup: boolean }
  | { kind: "typing"; typingName: string };


export function buildMsgRenderables(messages: Msg[], stage: MsgStage, typingName: string, unreadCount = 0): MsgRenderable[] {
  const out: MsgRenderable[] = [];
  let lastDay: string | null = null;
  let lastSender: string | null = null;
  let firstUnreadIdx = -1;
  if (unreadCount > 0) {
    const incoming: number[] = [];
    messages.forEach((m, i) => {
      const isSelf = "sender" in m && m.sender === "you";
      if (!isSelf && m.kind !== "system") incoming.push(i);
    });
    if (incoming.length >= unreadCount) {
      firstUnreadIdx = incoming[incoming.length - unreadCount]!;
    }
  }
  messages.forEach((m, i) => {
    const day = extractDay(m.ts);
    if (day !== lastDay) {
      out.push({ kind: "separator", label: day });
      lastDay = day;
      lastSender = null;
    }
    if (i === firstUnreadIdx) {
      out.push({ kind: "unread-divider", count: unreadCount });
      lastSender = null;
    }
    const senderId = m.kind === "system" || !("sender" in m) ? "system" : m.sender;
    const isFirstOfGroup = senderId !== lastSender;
    out.push({ kind: "message", msg: m, stage, isFirstOfGroup });
    lastSender = senderId ?? null;
  });
  if (stage === "inquiry") out.push({ kind: "typing", typingName });
  return out;
}


/** @deprecated Use buildMsgRenderables + Virtuoso instead. Kept only as
 *  a reference of the pre-WS-13.3 render pattern. */
function renderMessagesWithSeparators(messages: Msg[], stage: MsgStage, typingName: string, unreadCount = 0) {
  return buildMsgRenderables(messages, stage, typingName, unreadCount).map((item, i) => {
    if (item.kind === "separator") return <DaySeparator key={`sep-${i}`} label={item.label} />;
    if (item.kind === "unread-divider") return <NewMessagesDivider key={`unread-${i}`} count={item.count} />;
    if (item.kind === "typing") return <TypingIndicator key="typing" name={item.typingName} />;
    return <MessageBubble key={item.msg.id} msg={item.msg} stage={item.stage} isFirstOfGroup={item.isFirstOfGroup} />;
  });
}


export function NewMessagesDivider({ count }: { count: number }) {
  const copy = useDashboardText();
  return (
    <div
      role="separator"
      aria-label={`${count} ${copy.t("new messages")}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "8px 0 4px",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "rgba(194,106,69,0.30)" }} />
      <span style={{
        fontSize: 10.5, fontWeight: 700, background: "rgba(194,106,69,0.08)", padding: "3px 9px", borderRadius: 999 }} className="text-admin-coral">
        {copy.t("New")} · {count}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(194,106,69,0.30)" }} />
    </div>
  );
}


/**
 * AI thread summary card — sticky-ish at top of the message stream.
 * Collapsible. Synthesizes the current state of a thread in 1-3 lines
 * so a returning talent doesn't have to scroll back through 40 messages
 * to remember "where are we with Bvlgari".
 *
 * In production this would come from a server-side LLM digest of the
 * thread; here we mock per-stage copy from the conversation metadata.
 */
export function AIThreadSummary({ conv, open, onToggle }: { conv: Conversation; open: boolean; onToggle: () => void }) {
  const copy = useDashboardText();
  // Mock per-stage summary that pulls in real conv fields so the copy
  // feels written, not templated. Date strings get a CET timezone
  // suffix so cross-timezone talent know how the dates resolve.
  const dateWithZone = conv.date ? `${conv.date} CET` : "";
  const summary =
    conv.stage === "booked"
      ? `Booked · ${conv.brief}${dateWithZone ? ` · ${dateWithZone}` : ""}. Rate locked, transport agreed. Next: callsheet by Friday.`
      : conv.stage === "hold"
        ? `Holding ${dateWithZone || "dates"} for ${conv.brief}. Awaiting confirmation by client. ${conv.unreadCount > 0 ? `${conv.unreadCount} new from coordinator.` : ""}`
        : conv.stage === "inquiry"
          ? `Inquiry: ${conv.brief}. Coordinator collecting info. Rate not yet quoted.`
          : `Past · ${conv.brief}. Archived for reference.`;
  return (
    <div
      data-tulala-ai-summary
      style={{
        background: "linear-gradient(135deg, rgba(15,79,62,0.05) 0%, rgba(60,90,108,0.05) 100%)",
        border: "1px solid rgba(15,79,62,0.15)",
        borderRadius: 12,
        padding: open ? "10px 12px" : "8px 12px",
        marginBottom: 6,
        fontFamily: FONTS.body,
        transition: "all .18s ease",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <span aria-hidden style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "rgba(15,79,62,0.15)",
          color: COLORS.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}>✨</span>
        <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0 }} className="text-admin-accent">{copy.t("AI summary")}</span>
        <span style={{ flex: 1, fontSize: 12, whiteSpace: open ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }} className="text-admin-ink-muted">
          {!open && summary}
        </span>
        <span aria-hidden style={{
          fontSize: 10,
          color: COLORS.inkMuted,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform .2s ease",
          flexShrink: 0,
        }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(15,79,62,0.10)", fontSize: 13, lineHeight: 1.5 }} className="text-admin-ink">
          {summary}
        </div>
      )}
    </div>
  );
}


function extractDay(ts: string): string {
  // ts looks like "Apr 28 · 10:14" or "5h ago" or "Yesterday · 16:42"
  if (ts.includes("ago")) return "Today";
  if (ts.startsWith("Yesterday")) return "Yesterday";
  // "Apr 28 · ..." or "May 1 · ..."
  const match = ts.match(/^([A-Z][a-z]+ \d+)/);
  return match ? match[1]! : ts;
}


export function DaySeparator({ label }: { label: string }) {
  const copy = useDashboardText();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "16px 4px 8px",
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ flex: 1, height: 1, background: "rgba(11,11,13,0.06)" }} />
      <span
        style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {copy.t(label)}
      </span>
      <span style={{ flex: 1, height: 1, background: "rgba(11,11,13,0.06)" }} />
    </div>
  );
}
