"use client";

/**
 * MessagesShell — workspace admin Messages tab.
 *
 * Matches the prototype AdminOperationsShell design:
 *   • Left pane (340px): inbox list with filter chips + search
 *   • Right pane (flex): inquiry detail with thread tabs + composer
 *
 * Data: real inquiries + real messages from Supabase.
 * Realtime: subscribes to inquiry_messages for live updates.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  WorkspaceInquiryForMessages,
  WorkspaceMessage,
  ThreadType,
} from "../../_data-bridge";
import { sendMessage, markThreadRead, fetchMessages } from "./actions";

// ─── Design tokens (match all workspace pages) ────────────────────────────────

const C = {
  ink:          "#0B0B0D",
  inkMuted:     "rgba(11,11,13,0.55)",
  inkDim:       "rgba(11,11,13,0.35)",
  border:       "rgba(24,24,27,0.08)",
  borderSoft:   "rgba(24,24,27,0.06)",
  cardBg:       "#ffffff",
  surface:      "rgba(11,11,13,0.02)",
  surfaceAlt:   "#FAFAF7",
  accent:       "#0F4F3E",
  accentSoft:   "rgba(15,79,62,0.07)",
  accentDeep:   "#0B3B2E",
  coral:        "#B04A22",
  coralDeep:    "#8C3318",
  coralSoft:    "rgba(176,74,34,0.10)",
  success:      "#2E7D5B",
  successSoft:  "rgba(46,125,91,0.10)",
  successDeep:  "#1E5C40",
  amber:        "#8A6F1A",
  amberSoft:    "rgba(138,111,26,0.10)",
  fill:         "#0B0B0D",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const RADIUS = { sm: 8, md: 10, lg: 14 } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = diffMs / (1000 * 60 * 60);
  if (hrs < 1) return "now";
  if (hrs < 24) return `${Math.floor(hrs)}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function stageBucketOf(status: string): "inquiry" | "hold" | "booked" | "past" {
  if (status === "draft" || status === "submitted" || status === "coordination") return "inquiry";
  if (status === "offer_pending") return "hold";
  if (status === "approved" || status === "booked") return "booked";
  return "past";
}

function stageStyle(bucket: ReturnType<typeof stageBucketOf>): { bg: string; fg: string } {
  switch (bucket) {
    case "inquiry": return { bg: `${C.coral}18`,   fg: C.coral };
    case "hold":    return { bg: `${C.amber}18`,   fg: C.amber };
    case "booked":  return { bg: C.successSoft,    fg: C.success };
    default:        return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted };
  }
}

function stageWord(status: string): string {
  const map: Record<string, string> = {
    submitted: "Inquiry", coordination: "Coordinating", offer_pending: "Offer",
    approved: "Approved", booked: "Booked", rejected: "Rejected",
    expired: "Expired", draft: "Draft",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function statusLine(inquiry: WorkspaceInquiryForMessages): string {
  switch (inquiry.status) {
    case "draft":         return "Draft · not yet sent";
    case "submitted":     return "New inquiry";
    case "coordination":  return "Coordinating talent";
    case "offer_pending": return "Offer sent · awaiting client";
    case "approved":      return "Client approved · prep production";
    case "booked":        return "Booked · confirmed";
    case "rejected":      return "Client declined";
    case "expired":       return "Expired";
    default:              return inquiry.status;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function initialsOf(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

/** Deterministic color from a string. */
function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const palette = [
    "#3B5E9E", "#0F4F3E", "#8A6F1A", "#B04A22",
    "#5B3C8C", "#2E7D5B", "#1A6882", "#7A3B3B",
  ];
  return palette[Math.abs(h) % palette.length];
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Avatar({
  name, size = 28,
}: { name: string; size?: number }) {
  const bg = hashColor(name);
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%",
        background: bg, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
        fontFamily: FONT, letterSpacing: -0.3,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

function FilterChip({
  label, active, count, onClick,
}: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 999,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSoft : "transparent",
        color: active ? C.accentDeep : C.inkMuted,
        fontSize: 11, fontWeight: active ? 700 : 500,
        cursor: "pointer", fontFamily: FONT,
        whiteSpace: "nowrap", flexShrink: 0,
        letterSpacing: active ? 0.1 : 0,
      }}
    >
      {label}
      {count != null && count > 0 && (
        <span style={{
          minWidth: 14, height: 14, borderRadius: 999,
          background: active ? C.accent : "rgba(11,11,13,0.10)",
          color: active ? "#fff" : C.inkMuted,
          fontSize: 9, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px", boxSizing: "border-box",
        }}>{count}</span>
      )}
    </button>
  );
}

/** Funnel dots: ●─●─○─○ */
function FunnelDots({ status }: { status: string }) {
  const idx = (() => {
    const b = stageBucketOf(status);
    if (b === "inquiry") return 0;
    if (b === "hold") return 1;
    if (b === "booked") return 2;
    return 3;
  })();
  const stages = ["Inquiry", "Offer", "Booked", "Done"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {stages.map((s, i) => {
        const past = i < idx;
        const here = i === idx;
        const bg = past ? C.success : here ? C.accent : "rgba(11,11,13,0.12)";
        return (
          <React.Fragment key={s}>
            <span
              title={s}
              style={{
                width: here ? 8 : 6, height: here ? 8 : 6, borderRadius: "50%",
                background: bg, flexShrink: 0,
              }}
            />
            {i < stages.length - 1 && (
              <span style={{
                width: 12, height: 1.5,
                background: i < idx ? C.success : "rgba(11,11,13,0.10)",
                flexShrink: 0,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── TYPE filter ──────────────────────────────────────────────────────────────

type AdminFilter = "all" | "needs-me" | "unread" | "inquiry" | "hold" | "booked" | "past";

// ─── LEFT PANE: Inbox row ──────────────────────────────────────────────────────

function InquiryRow({
  inquiry, active, onClick,
}: { inquiry: WorkspaceInquiryForMessages; active: boolean; onClick: () => void }) {
  const bucket = stageBucketOf(inquiry.status);
  const sc = stageStyle(bucket);
  const needsMe = inquiry.next_action_by === "coordinator";
  const hasUnread = inquiry.unread_count > 0;

  const rowBg = active ? "rgba(11,11,13,0.045)"
    : hasUnread ? "rgba(176,74,34,0.04)"
    : needsMe  ? "rgba(176,74,34,0.03)"
    : bucket === "booked" ? "rgba(46,125,91,0.035)"
    : "transparent";

  const borderLeft = active ? `3px solid ${C.accent}`
    : hasUnread ? `3px solid ${C.coral}`
    : needsMe   ? `3px solid ${C.coral}88`
    : "3px solid transparent";

  const displayName = inquiry.company
    ? inquiry.company
    : inquiry.contact_name;
  const subtitleParts = [
    inquiry.contact_name !== displayName ? inquiry.contact_name : null,
    inquiry.event_date ? new Date(inquiry.event_date).toLocaleDateString([], { month: "short", day: "numeric" }) : null,
    inquiry.event_location?.split(",")[0] ?? null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        width: "100%", padding: "12px 14px",
        background: rowBg,
        borderLeft,
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        cursor: "pointer", textAlign: "left",
        fontFamily: FONT, position: "relative",
      }}
    >
      {/* Avatar */}
      <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
        <Avatar name={displayName} size={36} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — name + age */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{
            fontSize: 13.5, fontWeight: hasUnread ? 700 : 600, color: C.ink,
            flex: 1, minWidth: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            letterSpacing: -0.1,
          }}>
            {displayName}
          </span>
          {hasUnread && (
            <span style={{
              flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              padding: "2px 6px", borderRadius: 999,
              background: C.coral, color: "#fff",
              textTransform: "uppercase",
            }}>NEW</span>
          )}
          <span style={{ flexShrink: 0, fontSize: 10.5, color: C.inkMuted }}>
            {ageLabel(inquiry.created_at)}
          </span>
        </div>

        {/* Row 2 — subtitle (event details) */}
        {subtitleParts.length > 0 && (
          <div style={{
            fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {subtitleParts.join(" · ")}
          </div>
        )}

        {/* Row 3 — status line + unread badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          {needsMe && (
            <span aria-hidden style={{
              flexShrink: 0, width: 6, height: 6, borderRadius: "50%",
              background: C.coral,
            }} />
          )}
          <span style={{
            flex: 1, minWidth: 0, fontSize: 11.5,
            color: needsMe ? C.coralDeep : hasUnread ? C.ink : C.inkMuted,
            fontWeight: needsMe ? 600 : hasUnread ? 500 : 400,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {statusLine(inquiry)}
          </span>
          {inquiry.unread_count > 0 && (
            <span style={{
              flexShrink: 0,
              minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
              background: C.accent, color: "#fff",
              fontSize: 9.5, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxSizing: "border-box",
            }}>{inquiry.unread_count}</span>
          )}
        </div>

        {/* Row 4 — funnel dots + stage word */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <FunnelDots status={inquiry.status} />
          <span style={{
            fontSize: 10, fontWeight: 700, color: sc.fg,
            letterSpacing: 0.3, textTransform: "uppercase", flexShrink: 0,
          }}>
            {stageWord(inquiry.status)}
          </span>
          {inquiry.quantity != null && inquiry.quantity > 0 && (
            <span style={{
              marginLeft: "auto", flexShrink: 0,
              fontSize: 10.5, color: C.inkMuted,
            }}>
              {inquiry.quantity} talent
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── LEFT PANE: Inbox list ────────────────────────────────────────────────────

function InboxList({
  inquiries, activeId, onSelect, tenantSlug,
}: {
  inquiries: WorkspaceInquiryForMessages[];
  activeId: string | null;
  onSelect: (id: string) => void;
  tenantSlug: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminFilter>("all");

  const needsMe = inquiries.filter(i => i.next_action_by === "coordinator").length;
  const unreadCount = inquiries.filter(i => i.unread_count > 0).length;

  const filtered = useMemo(() => {
    let list = inquiries;
    if (filter === "needs-me") list = list.filter(i => i.next_action_by === "coordinator");
    else if (filter === "unread") list = list.filter(i => i.unread_count > 0);
    else if (filter !== "all") list = list.filter(i => stageBucketOf(i.status) === filter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.contact_name + " " + (i.company ?? "") + " " + (i.event_location ?? ""))
          .toLowerCase().includes(q)
      );
    }
    return list;
  }, [inquiries, filter, search]);

  const chips: { id: AdminFilter; label: string; count?: number }[] = [
    { id: "all",      label: "All",       count: inquiries.length },
    { id: "needs-me", label: "Needs me",  count: needsMe },
    { id: "unread",   label: "Unread",    count: unreadCount },
    { id: "inquiry",  label: "Inquiry" },
    { id: "hold",     label: "Offer" },
    { id: "booked",   label: "Booked" },
    { id: "past",     label: "Past" },
  ];

  return (
    <aside style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${C.borderSoft}`,
      background: C.cardBg,
      minHeight: 0, minWidth: 0,
      overflow: "hidden", flex: 1,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 14px 10px",
        borderBottom: `1px solid ${C.borderSoft}`,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{
            fontFamily: FONT, fontSize: 17, fontWeight: 700,
            color: C.ink, margin: 0, letterSpacing: -0.3,
          }}>Inbox</h3>
          <span style={{ fontSize: 11, color: C.inkMuted }}>
            {inquiries.length} thread{inquiries.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setSearch(""); }}
            placeholder="Search clients, locations…"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "8px 32px 8px 30px", borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: "rgba(11,11,13,0.04)",
              fontFamily: FONT, fontSize: 12.5, color: C.ink,
              outline: "none",
            }}
          />
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke={C.inkDim} strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke={C.inkDim} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 20, height: 20, borderRadius: "50%",
                border: "none", background: "rgba(11,11,13,0.08)",
                color: C.inkMuted, cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{
          display: "flex", gap: 5, overflowX: "auto",
          scrollbarWidth: "none", paddingBottom: 2,
        }}>
          {chips.map(c => (
            <FilterChip
              key={c.id}
              label={c.label}
              active={filter === c.id}
              count={c.count}
              onClick={() => setFilter(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: C.surface, color: C.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {search.trim() ? `No matches for "${search}"` : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4, maxWidth: 220 }}>
              {search.trim()
                ? "Try a different keyword or clear the search."
                : "Try the All filter or clear your search."}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => setSearch("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${C.border}`, background: "transparent",
                color: C.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONT,
              }}>Clear search</button>
            )}
          </div>
        ) : filtered.map(i => (
          <InquiryRow
            key={i.id}
            inquiry={i}
            active={i.id === activeId}
            onClick={() => onSelect(i.id)}
          />
        ))}
      </div>
    </aside>
  );
}

// ─── RIGHT PANE: Message stream ───────────────────────────────────────────────

function MessageBubble({ msg, showSender, isFirst }: {
  msg: WorkspaceMessage;
  showSender: boolean;
  isFirst: boolean;
}) {
  const mine = msg.is_mine;
  return (
    <div style={{
      display: "flex",
      flexDirection: mine ? "row-reverse" : "row",
      alignItems: "flex-end",
      gap: 8,
      marginBottom: 4,
      marginTop: isFirst ? 0 : 2,
    }}>
      {/* Avatar — only on incoming messages when sender changes */}
      {!mine ? (
        <div style={{ flexShrink: 0, marginBottom: 2 }}>
          {showSender
            ? <Avatar name={msg.sender_name} size={26} />
            : <span style={{ width: 26, display: "inline-block" }} />
          }
        </div>
      ) : null}

      <div style={{
        maxWidth: "72%",
        display: "flex", flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        gap: 2,
      }}>
        {showSender && !mine && (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: C.inkMuted, paddingLeft: 2 }}>
            {msg.sender_name}
          </span>
        )}
        <div style={{
          padding: "8px 12px",
          background: mine ? C.accent : C.cardBg,
          color: mine ? "#fff" : C.ink,
          borderRadius: mine
            ? `${RADIUS.md}px ${RADIUS.md}px 4px ${RADIUS.md}px`
            : `${RADIUS.md}px ${RADIUS.md}px ${RADIUS.md}px 4px`,
          border: mine ? "none" : `1px solid ${C.borderSoft}`,
          fontSize: 13,
          lineHeight: 1.55,
          wordBreak: "break-word",
        }}>
          {msg.body}
        </div>
        <span style={{ fontSize: 10, color: C.inkDim, paddingLeft: 2, paddingRight: 2 }}>
          {formatTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

function MessageStream({
  inquiryId,
  threadType,
  tenantSlug,
  initialMessages,
  placeholder,
  closed,
}: {
  inquiryId: string;
  threadType: ThreadType;
  tenantSlug: string;
  initialMessages: WorkspaceMessage[];
  placeholder: string;
  closed?: boolean;
}) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, startSending] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Sync initial messages when inquiry changes
  useEffect(() => {
    setMessages(initialMessages);
  }, [inquiryId, threadType]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`inquiry_messages:${inquiryId}:${threadType}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "inquiry_messages",
        filter: `inquiry_id=eq.${inquiryId}`,
      }, (payload) => {
        const row = payload.new as {
          id: string; sender_user_id: string; body: string;
          created_at: string; thread_type: string;
        };
        if (row.thread_type !== threadType) return;
        setMessages(prev => {
          if (prev.some(m => m.id === row.id)) return prev;
          return [...prev, {
            id: row.id,
            sender_user_id: row.sender_user_id,
            sender_name: row.sender_user_id.slice(0, 8),
            body: row.body,
            created_at: row.created_at,
            is_mine: false, // will be corrected on next load
          }];
        });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [inquiryId, threadType]);

  const handleSend = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    // Optimistic
    const optimisticId = `opt-${Date.now()}`;
    const optimistic: WorkspaceMessage = {
      id: optimisticId,
      sender_user_id: "me",
      sender_name: "You",
      body: trimmed,
      created_at: new Date().toISOString(),
      is_mine: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setBody("");
    // Auto-resize textarea
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    startSending(async () => {
      const result = await sendMessage(tenantSlug, inquiryId, threadType, trimmed);
      if ("error" in result) {
        // Rollback optimistic message
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        setBody(trimmed);
      } else {
        // Replace optimistic with real id.
        // Also remove any realtime-sourced duplicate (which could arrive before
        // this response if the Realtime event beat the server action reply).
        setMessages(prev => {
          const opt = prev.find(m => m.id === optimisticId);
          if (!opt) return prev; // already removed (edge case)
          return [
            ...prev.filter(m => m.id !== optimisticId && m.id !== result.id),
            { ...opt, id: result.id, created_at: result.created_at },
          ];
        });
      }
    });
  }, [body, sending, tenantSlug, inquiryId, threadType]);

  // Group messages by date for headers
  const grouped = useMemo(() => {
    const out: Array<{ type: "header"; date: string } | { type: "msg"; msg: WorkspaceMessage; showSender: boolean; isFirst: boolean }> = [];
    let lastDate = "";
    let lastSender = "";
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const dateKey = new Date(msg.created_at).toDateString();
      if (dateKey !== lastDate) {
        out.push({ type: "header", date: formatDateGroup(msg.created_at) });
        lastDate = dateKey;
        lastSender = "";
      }
      const showSender = msg.sender_user_id !== lastSender && !msg.is_mine;
      out.push({ type: "msg", msg, showSender, isFirst: i === 0 });
      lastSender = msg.sender_user_id;
    }
    return out;
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Messages scroll area */}
      <div style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        padding: "16px 16px 8px",
        display: "flex", flexDirection: "column",
      }}>
        {messages.length === 0 ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 8, padding: 24,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: C.surface, color: C.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3V5a1 1 0 011-1z"
                  stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>No messages yet</div>
            <div style={{ fontSize: 12, color: C.inkMuted, textAlign: "center", lineHeight: 1.5 }}>
              Start the conversation by sending a message below.
            </div>
          </div>
        ) : (
          <>
            {grouped.map((item, idx) =>
              item.type === "header" ? (
                <div key={`hdr-${idx}`} style={{
                  textAlign: "center", padding: "8px 0 12px",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: "uppercase", color: C.inkMuted,
                }}>
                  {item.date}
                </div>
              ) : (
                <MessageBubble
                  key={item.msg.id}
                  msg={item.msg}
                  showSender={item.showSender}
                  isFirst={item.isFirst}
                />
              )
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Compose or closed notice */}
      {closed ? (
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.borderSoft}`,
          background: C.surface,
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: C.inkMuted, fontFamily: FONT,
        }}>
          <span aria-hidden style={{ fontSize: 14 }}>🔒</span>
          This thread is closed.
        </div>
      ) : (
        <div style={{
          borderTop: `1px solid ${C.borderSoft}`,
          padding: "10px 12px",
          display: "flex", gap: 10, alignItems: "flex-end",
          background: C.cardBg,
        }}>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => {
              setBody(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={placeholder}
            rows={1}
            style={{
              flex: 1, resize: "none", outline: "none",
              border: `1px solid ${C.border}`,
              borderRadius: RADIUS.sm,
              padding: "8px 12px",
              fontFamily: FONT, fontSize: 13, color: C.ink,
              background: "rgba(11,11,13,0.025)",
              lineHeight: 1.5, minHeight: 36,
              overflow: "hidden",
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!body.trim() || sending}
            aria-label="Send message"
            style={{
              flexShrink: 0,
              width: 36, height: 36, borderRadius: 10,
              background: !body.trim() || sending ? "rgba(11,11,13,0.10)" : C.accent,
              color: !body.trim() || sending ? C.inkMuted : "#fff",
              border: "none", cursor: !body.trim() || sending ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "background 120ms",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M18 2L9 11M18 2l-5.5 16-3.5-7-7-3.5L18 2z"
                stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── RIGHT PANE: Inquiry detail with tabs ─────────────────────────────────────

type TabId = "client" | "talent" | "booking";

function InquiryDetail({
  inquiry,
  tenantSlug,
  onBack,
}: {
  inquiry: WorkspaceInquiryForMessages;
  tenantSlug: string;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("client");
  const [clientMsgs, setClientMsgs] = useState<WorkspaceMessage[] | null>(null);
  const [talentMsgs, setTalentMsgs] = useState<WorkspaceMessage[] | null>(null);
  const [loading, setLoading] = useState(false);

  const bucket = stageBucketOf(inquiry.status);
  const sc = stageStyle(bucket);
  const closed = inquiry.status === "rejected" || inquiry.status === "expired";

  // Load messages when inquiry changes
  useEffect(() => {
    setClientMsgs(null);
    setTalentMsgs(null);
    setLoading(true);

    Promise.all([
      fetchMessages(tenantSlug, inquiry.id, "private"),
      fetchMessages(tenantSlug, inquiry.id, "group"),
    ]).then(([priv, grp]) => {
      setClientMsgs(priv);
      setTalentMsgs(grp);
      setLoading(false);
      // Mark client thread as read when opened
      void markThreadRead(tenantSlug, inquiry.id, "private");
    }).catch(() => {
      setClientMsgs([]);
      setTalentMsgs([]);
      setLoading(false);
    });
  }, [inquiry.id, tenantSlug]);

  const displayName = inquiry.company || inquiry.contact_name;
  const tabDefs: { id: TabId; label: string }[] = [
    { id: "client",  label: "Client thread" },
    { id: "talent",  label: "Talent group" },
    { id: "booking", label: "Booking" },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      flex: 1, minHeight: 0,
      fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px 0",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.cardBg,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {/* Back button (mobile) */}
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to inbox"
            style={{
              flexShrink: 0,
              width: 28, height: 28, borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <Avatar name={displayName} size={32} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: C.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              letterSpacing: -0.1,
            }}>
              {displayName}
            </div>
            {inquiry.event_location && (
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>
                {[inquiry.event_date
                    ? new Date(inquiry.event_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                    : null,
                  inquiry.event_location,
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>

          {/* Stage pill */}
          <span style={{
            flexShrink: 0,
            padding: "3px 8px", borderRadius: 999,
            background: sc.bg, color: sc.fg,
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
            textTransform: "uppercase",
          }}>
            {stageWord(inquiry.status)}
          </span>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {tabDefs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "8px 14px",
                border: "none", background: "none",
                borderBottom: `2px solid ${activeTab === t.id ? C.accent : "transparent"}`,
                color: activeTab === t.id ? C.accent : C.inkMuted,
                fontSize: 12, fontWeight: activeTab === t.id ? 700 : 500,
                cursor: "pointer", fontFamily: FONT,
                transition: "color 120ms",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, background: C.surfaceAlt, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div style={{
            height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: C.inkMuted, fontSize: 12,
          }}>
            Loading…
          </div>
        ) : activeTab === "client" ? (
          <MessageStream
            inquiryId={inquiry.id}
            threadType="private"
            tenantSlug={tenantSlug}
            initialMessages={clientMsgs ?? []}
            placeholder={`Reply to ${inquiry.contact_name}…`}
            closed={closed}
          />
        ) : activeTab === "talent" ? (
          <MessageStream
            inquiryId={inquiry.id}
            threadType="group"
            tenantSlug={tenantSlug}
            initialMessages={talentMsgs ?? []}
            placeholder="Message talent group…"
            closed={closed}
          />
        ) : (
          <BookingDetail inquiry={inquiry} />
        )}
      </div>
    </div>
  );
}

// ─── BOOKING TAB: Inquiry details ─────────────────────────────────────────────

function BookingDetail({ inquiry }: { inquiry: WorkspaceInquiryForMessages }) {
  const bucket = stageBucketOf(inquiry.status);
  const sc = stageStyle(bucket);

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Status",    value: <span style={{ color: sc.fg, fontWeight: 700 }}>{stageWord(inquiry.status)}</span> },
    { label: "Client",    value: inquiry.contact_name },
    ...(inquiry.company ? [{ label: "Company", value: inquiry.company }] : []),
    ...(inquiry.event_date ? [{
      label: "Date",
      value: new Date(inquiry.event_date).toLocaleDateString([], { weekday: "short", month: "long", day: "numeric", year: "numeric" }),
    }] : []),
    ...(inquiry.event_location ? [{ label: "Location", value: inquiry.event_location }] : []),
    ...(inquiry.quantity ? [{ label: "Talent",   value: `${inquiry.quantity} talent` }] : []),
    { label: "Next action by", value: inquiry.next_action_by ?? "—" },
  ];

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0, boxSizing: "border-box" }}>
      <div style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
      }}>
        {rows.map((row, i) => (
          <div key={row.label}>
            {i > 0 && <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 16px", fontFamily: FONT,
            }}>
              <span style={{ flexShrink: 0, width: 110, fontSize: 12, color: C.inkMuted }}>
                {row.label}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.ink, minWidth: 0 }}>
                {row.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty right pane ─────────────────────────────────────────────────────────

function EmptyDetail() {
  return (
    <div style={{
      height: "100%",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 10, padding: 24,
      color: C.inkMuted, fontFamily: FONT,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: C.surface,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H7l-4 4V5a1 1 0 011-1z"
            stroke={C.inkDim} strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Select a thread</div>
      <div style={{ fontSize: 12, color: C.inkMuted, textAlign: "center", lineHeight: 1.5, maxWidth: 220 }}>
        Choose an inquiry from the left to view its conversation threads.
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export default function MessagesShell({
  inquiries,
  tenantSlug,
}: {
  inquiries: WorkspaceInquiryForMessages[];
  tenantSlug: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    inquiries[0]?.id ?? null
  );
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");

  const activeInquiry = inquiries.find(i => i.id === activeId) ?? null;

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setMobilePane("thread");
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        [data-messages-shell] {
          display: grid;
          grid-template-columns: 340px 1fr;
          grid-template-rows: minmax(0, 1fr);
          background: #fff;
          border: 1px solid rgba(24,24,27,0.06);
          border-radius: 14px;
          overflow: hidden;
          height: min(calc(100vh - 210px), 820px);
          min-height: 520px;
          font-family: "Inter", system-ui, sans-serif;
        }
        [data-messages-list] {
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        @media (max-width: 720px) {
          [data-messages-shell] {
            grid-template-columns: 1fr;
            position: fixed;
            left: 0; right: 0;
            top: 106px; bottom: 80px;
            height: auto;
            min-height: 0;
            border-radius: 0;
            border-left: none; border-right: none;
            z-index: 10;
          }
          [data-messages-shell][data-pane="list"] > [data-messages-detail] { display: none; }
          [data-messages-shell][data-pane="thread"] > [data-messages-list] { display: none; }
        }
      `}} />
      <div data-messages-shell data-pane={mobilePane}>
        <div data-messages-list>
          <InboxList
            inquiries={inquiries}
            activeId={activeId}
            onSelect={handleSelect}
            tenantSlug={tenantSlug}
          />
        </div>
        <div data-messages-detail style={{
          display: "flex", flexDirection: "column",
          minHeight: 0, background: C.surfaceAlt,
          overflow: "hidden",
        }}>
          {activeInquiry ? (
            <InquiryDetail
              inquiry={activeInquiry}
              tenantSlug={tenantSlug}
              onBack={() => setMobilePane("list")}
            />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </>
  );
}
