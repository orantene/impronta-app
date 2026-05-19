"use client";

import React, { useMemo, useRef, useState } from "react";
import { ThreadSearch, type ThreadSearchMessage, type JumpTarget } from "@/components/thread-search/ThreadSearch";
import { COLORS, FONTS, TRANSITION, RADIUS } from "../../state";
import { Icon } from "../../primitives";
import { disabledBtn } from "./machinery-13";
import type { ChatSubThreadId, TabDef, ThreadTabId } from "./machinery-8";


export function ThreadTabBar({
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
      {/* Mobile: tabs are pills with shrunk text + icon, ALL labels
          visible. The v1 mobile rule hid all non-active labels and
          left icon-only orphans — user feedback was that this loses
          clarity (icons alone don't communicate "Lineup" vs "Event").
          Now labels stay; padding + font-size tighten the strip to
          a single line at 375 viewport. Horizontal scroll handles
          overflow when needed. */}
      <style dangerouslySetInnerHTML={{ __html:
        "@media (max-width: 720px){"
        + "[data-tulala-thread-tabs]{padding-left:0}"
        + "[data-tulala-thread-tabs] button{padding:10px 10px 8px!important;gap:5px!important;font-size:12px!important}"
        + "[data-tulala-thread-tabs] button[aria-selected=\"true\"]{padding:10px 12px 8px!important}"
        + "}"
        + "@media (max-width: 380px){"
        // At very narrow widths shrink the icon a touch so the strip
        // still fits without wrapping.
        + "[data-tulala-thread-tabs] button{font-size:11.5px!important;gap:4px!important}"
        + "[data-tulala-thread-tabs] button svg{width:15px!important;height:15px!important}"
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

/**
 * ThreadSearchTrigger — search icon button + sheet, wired with the
 * current thread's messages + jump-to targets.
 */
export function ThreadSearchTrigger({
  inquiryId, messages, onJumpOffer, onJumpCallSheet, onJumpPayment, onJumpApproval,
}: {
  inquiryId: string;
  messages: Array<{ id: string; body: string; createdAt?: string; created_at?: string; senderName?: string; senderRole?: string; isYou?: boolean }>;
  onJumpOffer?: () => void;
  onJumpCallSheet?: () => void;
  onJumpPayment?: () => void;
  onJumpApproval?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Adapt the message rows to ThreadSearchMessage shape.
  const adaptedMessages: ThreadSearchMessage[] = useMemo(
    () => messages.map((m) => ({
      id: m.id,
      body: m.body || "",
      createdAt: (m.createdAt || m.created_at || "").slice(0, 16).replace("T", " "),
      senderName: m.senderName ?? (m.isYou ? "You" : "Someone"),
      hasAttachment: false,
    })),
    [messages],
  );
  const jumpTargets: JumpTarget[] = useMemo(() => {
    const out: JumpTarget[] = [];
    if (onJumpOffer) out.push({ kind: "offer", label: "Offer", onJump: onJumpOffer });
    if (onJumpCallSheet) out.push({ kind: "call-sheet", label: "Call sheet", onJump: onJumpCallSheet });
    if (onJumpPayment) out.push({ kind: "payment", label: "Payment", onJump: onJumpPayment });
    if (onJumpApproval) out.push({ kind: "approval", label: "Client approval", onJump: onJumpApproval });
    return out;
  }, [onJumpOffer, onJumpCallSheet, onJumpPayment, onJumpApproval]);
  // Reference inquiryId in the closure so it's not dead-prop.
  void inquiryId;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search this conversation"
        title="Search conversation"
        style={{
          width: 32, height: 32,
          padding: 0,
          background: "transparent",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 8,
          cursor: "pointer",
          color: COLORS.inkMuted,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
      <ThreadSearch
        open={open}
        messages={adaptedMessages}
        jumpTargets={jumpTargets}
        onResultClick={() => {/* caller scrolls; we just close */}}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/**
 * ChatSubToggleDropdown — floating absolute segmented switch for the
 * Chat tab. NOT a dropdown — a 3-button pill that hovers below the
 * Chat tab. Click any button to switch threads immediately.
 *
 * Position is `absolute` so it doesn't reserve vertical space — it
 * floats above the conversation pane's top edge. Parent must be
 * `position: relative`. The conversation pane below sits 36px down
 * from the tab bar (the floating switch overlays that gap visually).
 */
export function ChatSubToggleDropdown({
  current,
  onSelect,
  clientUnread,
  groupUnread,
  lockClient = false,
  onLockedClick,
}: {
  current: ChatSubThreadId;
  onSelect: (sub: ChatSubThreadId) => void;
  clientUnread?: number;
  groupUnread?: number;
  lockClient?: boolean;
  onLockedClick?: () => void;
}) {
  const labelOf = (s: ChatSubThreadId): string =>
    s === "client" ? "Client" : s === "group" ? "Group" : "DM";

  const subs: ChatSubThreadId[] = ["client", "group", "dm"];

  return (
    <div
      data-chat-sub-toggle
      style={{
        // Floats down from the Chat tab. Parent must be
        // `position: relative`. Top offset accounts for the ~44px
        // ThreadTabBar height + a 4px gap so the switch sits flush
        // beneath the tab strip without reserving vertical space in
        // the conversation column.
        position: "absolute",
        top: 48,
        left: 10,
        zIndex: 6,
        display: "inline-flex",
        gap: 2,
        padding: 3,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 999,
        boxShadow: "0 6px 14px rgba(11,11,13,0.10)",
      }}
    >
      {subs.map((s) => {
        const active = current === s;
        const locked = s === "client" && lockClient;
        const subUnread = s === "client" ? clientUnread
          : s === "group" ? groupUnread
          : 0;
        return (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (locked) {
                onLockedClick?.();
                return;
              }
              onSelect(s);
            }}
            title={locked ? "Locked — request to join as coordinator" : undefined}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px",
              borderRadius: 999,
              border: "none",
              cursor: locked ? "not-allowed" : "pointer",
              fontFamily: FONTS.body, fontSize: 12,
              fontWeight: active ? 700 : 600,
              color: locked ? COLORS.inkDim : (active ? "#fff" : COLORS.inkMuted),
              background: active ? COLORS.accent : "transparent",
              opacity: locked ? 0.7 : 1,
              transition: "background 100ms, color 100ms",
              whiteSpace: "nowrap",
            }}
          >
            {locked && (
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                <rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M4 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            )}
            {labelOf(s)}
            {(subUnread ?? 0) > 0 && (
              <span style={{
                minWidth: 15, height: 15, padding: "0 4px",
                borderRadius: 999,
                background: active ? "rgba(255,255,255,0.25)" : COLORS.indigoSoft,
                color: active ? "#fff" : COLORS.indigoDeep,
                fontSize: 9.5, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {subUnread}
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
export function tabIcon(id: ThreadTabId, locked: boolean): React.ReactNode {
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
export function LockedTabOverlay({
  title, subtitle, requestLabel, onRequest, disabled, disabledTitle, ghostPreview,
}: {
  title: string;
  subtitle: string;
  requestLabel: string;
  onRequest?: () => void;
  disabled?: boolean;
  disabledTitle?: string;
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
          <button
            type="button"
            disabled={disabled}
            title={disabled ? disabledTitle : undefined}
            onClick={() => {
              if (!onRequest) return;
              onRequest();
              setPending(true);
            }}
            style={disabled ? disabledBtn({
            marginTop: 16, padding: "9px 16px", borderRadius: 8, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
            transition: `transform ${TRANSITION.micro}, opacity ${TRANSITION.sm}`,
          }) : {
            marginTop: 16, padding: "9px 16px", borderRadius: 8, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
            transition: `transform ${TRANSITION.micro}, opacity ${TRANSITION.sm}`,
          }}
          onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
          onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(1)"; }}
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
export const MOCK_FILES_FOR_CONV: Record<string, Array<{ name: string; size: string; addedBy: string; addedAt: string; thread: "client" | "talent" }>> = {
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
export type UnitType = "hour" | "day" | "contract" | "event";
export type LineupRowStatus = "pending" | "submitted" | "approved" | "countered" | "declined";

export type LineupRow = {
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

export type CoordinatorRef = {
  id: string;
  name: string;
  initials: string;
  // If this coordinator is also one of the talents on the lineup, link them
  // so the UI can render "Talent + Coordinator" badge in their row.
  alsoTalentId?: string;
};

export type ClientBudget = {
  amount: number;
  unitType: UnitType;
  currency: string;
  // Free-form note (e.g. "negotiable", "incl. travel"), surfaces under the budget.
  note?: string;
};

export type OfferStage =
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

export type TimelineEvent = {
  id: string;
  ts: string;             // "Apr 28 · 14:30"
  actor: string;          // who did it
  body: string;           // what happened (plain copy)
  tone?: "default" | "success" | "warn" | "info";
};

export type Offer = {
  conversationId: string;
  stage: OfferStage;
  clientBudget?: ClientBudget;   // optional — client may not have named one yet
  agencyFee: number;             // workspace fee on top of talent costs
  // Slice H (Messages consolidation v2 §7.4): talent-coord earns BOTH
  // lanes — talent line item (in `rows`) AND a share of the workspace
  // fee per `coordinatorPct`. The Phase B PR 3 commission engine
  // snapshots both into booking_commission_snapshot.
  coordinatorPct: number;        // % the coordinator(s) keep from agency fee
  coordinators: CoordinatorRef[];// 1–2 coordinators
  rows: LineupRow[];
  timeline: TimelineEvent[];
  expiresInHours?: number;
};

/** Slice H helper: is this person both a talent line item AND a
 *  coordinator on this offer? Used by the offer drafter to badge
 *  talent-coord rows and by the header offer chip to surface the
 *  combined total to talent-coord viewers. */
export function isTalentCoordOnOffer(offer: Offer, talentId: string): boolean {
  const isTalentRow = offer.rows.some((r) => r.talentId === talentId);
  const isCoord = offer.coordinators.some((c) => c.id === talentId);
  return isTalentRow && isCoord;
}

/** Slice H: combined offer total for a talent-coord = talent payout +
 *  their share of the workspace fee (split evenly across coords). */
export function talentCoordCombinedTotal(offer: Offer, talentId: string): number {
  const talentLine = offer.rows.find((r) => r.talentId === talentId);
  if (!talentLine) return 0;
  const talentPayout = talentLine.units * talentLine.costRate;
  const coordShare = (offer.agencyFee * offer.coordinatorPct / 100) / Math.max(1, offer.coordinators.length);
  return talentPayout + coordShare;
}
