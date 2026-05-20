"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, ClientTrustBadge, EmptyState, Icon } from "../../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell } from "../../../state";
import { Virtuoso } from "react-virtuoso";
import { BubbleMenuItem } from "./Bubbles";
import { MOCK_DRAFTS } from "./ThreadParts";
import { type Msg } from "../../shared/client-conversations-1";
import { MOCK_THREAD } from "../../shared/client-conversations-2";
import { ConversationThread, ParticipantsStack, STAGE_META, TalentMessagesShellLazy, useKeyboardInset } from "../../shared/client-threads-1";
import { MOCK_CONVERSATIONS, type Conversation } from "../../shared/conversations-1";



export function TalentMessagesPage() {
  useKeyboardInset();
  return <TalentMessagesShellLazy pov="talent" />;
}


// Legacy implementation retained for reference (not routed — `TalentMessagesPage` uses `TalentMessagesShellLazy`).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reference implementation; hooks require PascalCase
function TalentMessagesPageLegacy() {
  const [activeId, setActiveId] = useState<string>(MOCK_CONVERSATIONS[0]!.id);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "inquiry" | "hold" | "booked" | "past">("all");
  const [sentMessagesByThread, setSentMessagesByThread] = useState<Record<string, Msg[]>>({});
  /**
   * Mobile pane state — single-pane stack on small screens.
   *   "list"   = conversation list visible, thread hidden
   *   "thread" = thread visible fullscreen, list hidden + back button
   * On desktop both render side-by-side; CSS toggles which is shown
   * via the [data-mobile-pane] attribute under @media (max-width: 720px).
   * Default = list (so cold-arriving on mobile lands on the index, not
   * a random thread).
   */
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");

  const filteredList = MOCK_CONVERSATIONS.filter((c) => {
    if (filter === "unread" && c.unreadCount === 0) return false;
    if (filter !== "all" && filter !== "unread" && c.stage !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!c.client.toLowerCase().includes(q) && !c.brief.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // j/k keyboard navigation across the inbox. Skips when the user is
  // typing in an input/textarea/contentEditable so the shortcut doesn't
  // hijack message composing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (filteredList.length === 0) return;
      e.preventDefault();
      const idx = filteredList.findIndex((c) => c.id === activeId);
      const nextIdx = (e.key === "j" || e.key === "ArrowDown")
        ? Math.min(filteredList.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      const next = filteredList[nextIdx];
      if (next) {
        setActiveId(next.id);
        setMobilePane("thread");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredList, activeId]);

  const active = MOCK_CONVERSATIONS.find((c) => c.id === activeId) ?? MOCK_CONVERSATIONS[0]!;
  const messages = [
    ...(MOCK_THREAD[active.id] ?? []),
    ...(sentMessagesByThread[active.id] ?? []),
  ];
  const sendLocalMessage = (body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSentMessagesByThread((prev) => ({
      ...prev,
      [active.id]: [
        ...(prev[active.id] ?? []),
        {
          id: `${active.id}-local-${Date.now()}`,
          kind: "text",
          sender: "you",
          body: trimmed,
          ts: "Just now",
          readBy: [],
        },
      ],
    }));
  };

  return (
    <div
      data-tulala-messages-shell
      data-mobile-pane={mobilePane}
      style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
        // Fill available height. When rendered as the page, the talent
        // surface main provides ~tall enough container; when rendered
        // inside the overlay sheet, the sheet's flex column gives 100%.
        height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 52px - 56px), 800px)",
        minHeight: 560,
        fontFamily: FONTS.body,
      }}
    >
      {/* Left rail — conversation list */}
      <ConversationList
        conversations={filteredList}
        activeId={active.id}
        onSelect={(id) => { setActiveId(id); setMobilePane("thread"); }}
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        totalUnread={MOCK_CONVERSATIONS.reduce((sum, c) => sum + c.unreadCount, 0)}
      />
      {/* Right pane — open thread (fullscreen on mobile, returns to
          list via the back button rendered inside ThreadHeader). */}
      <ConversationThread
        conv={active}
        messages={messages}
        onSendMessage={sendLocalMessage}
        onBackToList={() => setMobilePane("list")}
      />
    </div>
  );
}


function ConversationList({
  conversations,
  activeId,
  onSelect,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  totalUnread,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  filter: "all" | "unread" | "inquiry" | "hold" | "booked" | "past";
  onFilterChange: (f: "all" | "unread" | "inquiry" | "hold" | "booked" | "past") => void;
  totalUnread: number;
}) {
  const filterChips: { id: typeof filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: `Unread${totalUnread > 0 ? ` (${totalUnread})` : ""}` },
    { id: "inquiry", label: "Inquiry" },
    { id: "hold", label: "Hold" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
  ];
  return (
    <aside
      data-tulala-list-pane
      style={{
        borderRight: `1px solid ${COLORS.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.2, margin: 0 }} className="text-admin-ink">
            Messages
          </h2>
          <span style={{ fontSize: 11.5 }} className="text-admin-ink-muted">
            {conversations.length} thread{conversations.length === 1 ? "" : "s"}
          </span>
        </div>
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(11,11,13,0.04)",
            borderRadius: 8,
            padding: "7px 10px",
          }}
        >
          <Icon name="search" size={13} color={COLORS.inkMuted} stroke={1.7} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search clients, briefs…"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.ink,
            }}
          />
        </div>
        {/* Filter chips */}
        <div data-tulala-msg-filter-chips style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {filterChips.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onFilterChange(f.id)}
                style={{
                  background: active ? COLORS.fill : "transparent",
                  color: active ? "#fff" : COLORS.inkMuted,
                  border: active ? "none" : `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  padding: "3px 9px",
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List — WS-13.3: Virtuoso for large conversation lists (500+ threads in prod) */}
      {conversations.length === 0 ? (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {filter === "unread" ? (
            <EmptyState
              icon="sparkle"
              title="Inbox zero ✨"
              body="Everything's been answered. Nothing waiting on you right now."
              primaryLabel="Show all threads"
              onPrimary={() => onFilterChange("all")}
              compact
            />
          ) : search.trim() ? (
            <EmptyState
              icon="search"
              title="No matches"
              body={`Nothing for "${search.trim()}". Try fewer words.`}
              primaryLabel="Clear search"
              onPrimary={() => onSearchChange("")}
              compact
            />
          ) : (
            <EmptyState
              icon="mail"
              title="No threads here yet"
              body="When clients reach out, conversations land here."
              primaryLabel="Show all"
              onPrimary={() => onFilterChange("all")}
              compact
            />
          )}
        </div>
      ) : (
        <Virtuoso
          style={{ flex: 1, minHeight: 0 }}
          data={conversations}
          itemContent={(_, c) => (
            <ConversationListRow
              conv={c}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
            />
          )}
        />
      )}
    </aside>
  );
}


/**
 * Right-click / long-press context menu state for a conversation row.
 * Module-level signal so only one menu is open at a time across rows.
 */
function ConversationListRow({
  conv,
  active,
  onClick,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  const stage = STAGE_META[conv.stage];
  const ageLabel = conv.lastMessage.ageHrs < 1
    ? "now"
    : conv.lastMessage.ageHrs < 24
      ? `${conv.lastMessage.ageHrs}h`
      : `${Math.floor(conv.lastMessage.ageHrs / 24)}d`;
  const { toast } = useAdminShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<number | null>(null);
  // Audit P0-3 — when the long-press timer fires, the subsequent
  // tap-release still triggers `onClick`, which would navigate AND
  // open the menu. This flag suppresses the click for one cycle.
  const longPressFiredRef = useRef(false);
  // Audit P0-4 — clamp the menu position to the viewport so it can't
  // open off-screen when a row near the bottom is long-pressed.
  const positionMenu = (x: number, y: number) => {
    const menuW = 240;
    const menuH = 280;
    const pad = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 360;
    const vh = typeof window !== "undefined" ? window.innerHeight : 640;
    return {
      x: Math.max(pad, Math.min(x, vw - menuW - pad)),
      y: Math.max(pad, Math.min(y, vh - menuH - pad)),
    };
  };
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-tulala-row-menu]')) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  return (
    <button
      type="button"
      onClick={(e) => {
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos(positionMenu(e.clientX, e.clientY));
        setMenuOpen(true);
      }}
      onTouchStart={(e) => {
        if (longPressRef.current) window.clearTimeout(longPressRef.current);
        const touch = e.touches[0];
        longPressFiredRef.current = false;
        longPressRef.current = window.setTimeout(() => {
          longPressFiredRef.current = true;
          if (touch) setMenuPos(positionMenu(touch.clientX, touch.clientY));
          setMenuOpen(true);
        }, 500);
      }}
      onTouchEnd={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
      onTouchCancel={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
      onTouchMove={() => { if (longPressRef.current) window.clearTimeout(longPressRef.current); }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "12px 14px",
        background: active ? "rgba(11,11,13,0.05)" : "transparent",
        borderLeft: active ? `3px solid ${COLORS.accent}` : "3px solid transparent",
        borderTop: "none",
        borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
        position: "relative",
        // Audit P0-3 — suppress the iOS native touch-callout (copy/
        // share popup) so long-press surfaces our context menu cleanly.
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "manipulation",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(11,11,13,0.02)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="relative shrink-0">
        <Avatar size={40} tone="auto" hashSeed={conv.client} initials={conv.clientInitials} />
        <ClientTrustBadge level={conv.clientTrust} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span data-tulala-conv-row-name style={{ fontSize: 13, fontWeight: conv.unreadCount > 0 ? 600 : 500, color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {conv.client}
          </span>
          <span data-tulala-conv-row-age style={{ fontSize: 10.5, color: conv.unreadCount > 0 ? COLORS.ink : COLORS.inkDim, fontWeight: conv.unreadCount > 0 ? 600 : 400, flexShrink: 0 }}>
            {ageLabel}
          </span>
        </div>
        <div data-tulala-conv-row-brief style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {conv.brief}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <span
            data-tulala-conv-row-stage
            style={{
              fontSize: 9.5,
              fontWeight: 700,
                            padding: "1px 5px",
              borderRadius: 4,
              background: stage.bg,
              color: stage.tone,
            }}
          >
            {stage.label}
          </span>
          {MOCK_DRAFTS[conv.id] ? (
            <span data-tulala-conv-row-preview style={{
              fontSize: 11,
              fontStyle: "italic",
              color: COLORS.coral,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
            }}>
              <span style={{ fontStyle: "normal", fontWeight: 600, marginRight: 4 }}>Draft:</span>
              {MOCK_DRAFTS[conv.id]}
            </span>
          ) : (
            <span data-tulala-conv-row-preview style={{ fontSize: 11, color: COLORS.inkMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
              {conv.lastMessage.sender === "you" ? "You: " : ""}
              {conv.lastMessage.preview}
            </span>
          )}
          {conv.unreadCount > 0 && (
            <span style={{ minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, color: "#fff", fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums", flexShrink: 0 }} className="bg-admin-accent">
              {conv.unreadCount}
            </span>
          )}
        </div>
        {/* Participants row — stacked avatars of people on this shoot.
            Talents float left (most relevant to the user); crew fills
            the rest. Capped at 5 avatars + "+N" overflow. */}
        {conv.participants && conv.participants.length > 0 && (
          <ParticipantsStack participants={conv.participants} />
        )}
      </div>
      {menuOpen && menuPos && (
        <div
          data-tulala-row-menu
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: menuPos.y,
            left: menuPos.x,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.18)",
            padding: 6,
            zIndex: 200,
            minWidth: 220,
            fontFamily: FONTS.body,
            animation: "tulala-bubble-action-in .14s ease",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, padding: "6px 10px 4px" }} className="text-admin-ink-muted">Quick actions coming soon</div>
          <div style={{ padding: "4px 10px 8px", fontSize: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">
            Snooze, pin, mark read, and archive need a real inbox mutation path before they appear here.
          </div>
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 4px" }} />
          <BubbleMenuItem icon="×" label="Close menu" onClick={() => setMenuOpen(false)} />
        </div>
      )}
    </button>
  );
}
