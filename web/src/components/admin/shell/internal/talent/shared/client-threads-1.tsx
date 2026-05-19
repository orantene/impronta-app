"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Avatar, Icon } from "../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell, type ClientTrustLevel } from "../../state";
import { IconButton } from "@/lib/ui/a11y-icon-button";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { MessageBubble } from "../pages/messages/Bubbles";
import { TypingIndicator } from "../pages/messages/Bubbles2";
import { Composer } from "../pages/messages/Composer";
import { TalentMessagesPage } from "../pages/messages/MessagesPage";
import { AIThreadSummary, DaySeparator, NewMessagesDivider, __threadScrollMap, buildMsgRenderables, vsb } from "../pages/messages/ThreadParts";
import { ThreadHeader, ThreadInfoSidebar } from "../pages/messages/ThreadSidebar";
import { type Msg } from "./client-conversations-1";
import { useTalentConversations } from "./conversation-adapter-1";
import { type Conversation, type MsgStage, type Participant } from "./conversations-1";



export const STAGE_META: Record<MsgStage, { label: string; tone: string; bg: string }> = {
  inquiry: { label: "Inquiry", tone: COLORS.coral, bg: COLORS.coralSoft },
  hold: { label: "Hold", tone: COLORS.amber, bg: "rgba(176,141,82,0.10)" },
  booked: { label: "Booked", tone: COLORS.green, bg: COLORS.successSoft },
  past: { label: "Past", tone: COLORS.inkDim, bg: "rgba(11,11,13,0.04)" },
  cancelled: { label: "Cancelled", tone: COLORS.coral, bg: COLORS.coralSoft },
};


/**
 * Messages FAB — floating button at bottom-right on every talent page
 * that is NOT the Messages page. Tap → slides up an overlay sheet
 * containing the same Messages experience. Designed for mobile-first
 * but useful on desktop too (quick check without page navigation).
 *
 * Hidden on the Messages page (where it would be redundant).
 */
function TalentMessagesFab() {
  const { state, setTalentPage } = useAdminShell();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const conversations = useTalentConversations();
  // Audit P1-10 — on phone, FAB navigates to the Messages route
  // instead of opening a sheet over the same content. Two parallel
  // entry points (FAB-overlay + page) created confusing IA on phone.
  const isPhone = useIsPhone();
  if (state.talentPage === "messages") return null;
  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);
  return (
    <>
      <button
        type="button"
        aria-label={`Messages · ${totalUnread} unread`}
        onClick={() => {
          if (isPhone) setTalentPage("messages");
          else setOverlayOpen(true);
        }}
        style={{
          position: "fixed",
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 999,
          background: COLORS.fill,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 24px rgba(11,11,13,0.20), 0 1px 3px rgba(11,11,13,0.10)",
          zIndex: 60,
          transition: `transform ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {totalUnread > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              borderRadius: 999,
              background: COLORS.accent,
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 700,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 2px " + COLORS.ink,
              fontVariantNumeric: "tabular-nums",
              fontFamily: FONTS.body,
            }}
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {/* Overlay sheet */}
      {overlayOpen && (
        <MessagesOverlaySheet
          onClose={() => setOverlayOpen(false)}
          onOpenFullPage={() => {
            setOverlayOpen(false);
            setTalentPage("messages");
          }}
        />
      )}
    </>
  );
}


function MessagesOverlaySheet({
  onClose,
  onOpenFullPage,
}: {
  onClose: () => void;
  onOpenFullPage: () => void;
}) {
  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          zIndex: 70,
          animation: "tulala-fade-in .18s ease",
        }}
      />
      {/* Sheet — slides up from bottom on mobile, right on desktop */}
      <aside
        role="dialog"
        aria-label="Messages"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(100vw, 720px)",
          background: "#fff",
          zIndex: 71,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 60px rgba(11,11,13,0.25)",
          animation: "tulala-slide-right .22s cubic-bezier(.4,.0,.2,1)",
          fontFamily: FONTS.body,
        }}
      >
        <style>{`
          @keyframes tulala-fade-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes tulala-slide-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.2, margin: 0, color: COLORS.ink }}>
            Messages
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onOpenFullPage}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 7,
                padding: "5px 11px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                color: COLORS.ink,
              }}
            >
              Open full page →
            </button>
            {/* Adoption — IconButton primitive (size kept at 32px for the
                tight info-panel header layout; see lib/ui/ADOPTION_NOTES.md). */}
            <IconButton
              aria-label="Close"
              onClick={onClose}
              size={32}
              style={{ borderRadius: 8, color: COLORS.inkMuted }}
            >
              <Icon name="x" size={14} />
            </IconButton>
          </div>
        </div>
        {/* Content — reuse the Messages page two-pane */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <TalentMessagesPage />
        </div>
      </aside>
    </>
  );
}


/**
 * Track soft-keyboard offset via visualViewport. The delta between the
 * layout viewport and the visual viewport equals the keyboard height
 * (plus any browser chrome shrink) — write it to a CSS variable so the
 * messages-shell height calc can subtract it (audit P0-2). Mounted once
 * by TalentMessagesPage; cleans up the var on unmount so it doesn't
 * leak into other surfaces.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--proto-kb", `${Math.round(inset)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--proto-kb");
    };
  }, []);
}


/**
 * Reactive phone-width media query. Used for behavior switches that
 * can't be done in CSS (e.g. swap component returned, default state).
 */
function useIsPhone(breakpoint = 720) {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isPhone;
}


// TalentMessagesPage delegates to the unified MessagesShell so all 3
// surfaces share the same list chrome, row component, header, filter
// chips, and mobile responsive pattern. Lazy-loaded via dynamic() to
// avoid the import cycle with `_messages.tsx` (which itself imports
// `Conversation`, `ParticipantsStack`, `MOCK_CONVERSATIONS` from this
// file). See `_messages.tsx` charter for full design decisions.
export const TalentMessagesShellLazy = dynamic(() => import("../../messages").then(m => m.MessagesShell), { ssr: false });


/**
 * Stacked avatars showing who else is on this shoot. Talents are
 * sorted to the front (the user cares most about peers); crew fills
 * the rest. Visible cap = 5; the rest collapse into "+N".
 */
export function ParticipantsStack({ participants }: { participants: Participant[] }) {
  const sorted = [...participants].sort((a, b) => Number(!!b.isTalent) - Number(!!a.isTalent));
  const visible = sorted.slice(0, 5);
  const overflow = sorted.length - visible.length;
  return (
    <div
      aria-label={`${participants.length} on this shoot`}
      title={participants.map((p) => `${p.name} · ${p.role}`).join("\n")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px dashed rgba(11,11,13,0.06)`,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 10,
          color: COLORS.inkMuted,
          marginRight: 2,
          letterSpacing: 0.4,
        }}
      >
        with
      </span>
      <div style={{ display: "inline-flex", alignItems: "center" }}>
        {visible.map((p, i) => (
          <span
            key={`${p.initials}-${i}`}
            style={{
              marginLeft: i === 0 ? 0 : -6,
              width: 23,
              height: 23,
              boxSizing: "border-box",
              border: "1.5px solid #fff",
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
              position: "relative",
              zIndex: visible.length - i,
              flexShrink: 0,
            }}
          >
            <Avatar size={20} tone="auto" hashSeed={p.name} initials={p.initials} />
          </span>
        ))}
        {overflow > 0 && (
          <span
            style={{
              marginLeft: -6,
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              borderRadius: 999,
              border: "1.5px solid #fff",
              background: "rgba(11,11,13,0.10)",
              color: COLORS.inkMuted,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9.5,
              fontWeight: 700,
              fontFamily: FONTS.body,
              fontVariantNumeric: "tabular-nums",
              position: "relative",
              zIndex: 0,
            }}
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}


export function ConversationThread({
  conv,
  messages,
  onSendMessage,
  onBackToList,
}: {
  conv: Conversation;
  messages: Msg[];
  onSendMessage?: (body: string) => void;
  onBackToList?: () => void;
}) {
  const isLocked = conv.stage === "booked";
  const isReadOnly = conv.stage === "past" || conv.stage === "cancelled";
  // Right info sidebar — open by default on desktop. Designed so the
  // top of the chat stays clean for the highlight; users open this
  // panel for full pinned info, files, action items, leader, etc.
  const [infoOpen, setInfoOpen] = useState(true);
  // AI thread summary — collapsible card at top of the message stream.
  // Default open for unread/active threads, collapsed for past/booked
  // (less surface noise once the thread is locked in). Audit P1-9 —
  // also default closed on phone where vertical space is precious.
  const isPhone = useIsPhone();
  const [summaryOpen, setSummaryOpen] = useState(!isReadOnly && !isLocked);
  // Audit P1-9 — useIsPhone resolves on the next paint after mount, so
  // sync the default once we know we're on phone (close it) without
  // forcing closed if the user explicitly opened it later.
  const phoneSyncedRef = useRef(false);
  useEffect(() => {
    if (isPhone && !phoneSyncedRef.current) {
      phoneSyncedRef.current = true;
      setSummaryOpen(false);
    }
  }, [isPhone]);
  // WS-13.3 — VirtuosoHandle replaces the old HTMLDivElement scrollRef.
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  // Restore scroll position when the open conversation changes. If no
  // saved position exists, jump to bottom (most-recent-message focus).
  useEffect(() => {
    const saved = __threadScrollMap.get(conv.id);
    if (saved != null) {
      virtuosoRef.current?.scrollTo({ top: saved });
    } else {
      // scrollToIndex with index 'LAST' is Virtuoso's idiomatic "bottom".
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: vsb() });
    }
  }, [conv.id]);
  return (
    <div
      data-tulala-thread-grid
      style={{
        display: "grid",
        gridTemplateColumns: infoOpen ? "1fr 320px" : "1fr",
        background: "#fff",
        minHeight: 0,
        transition: `grid-template-columns ${TRANSITION.layout}`,
      }}
    >
      <section
        data-tulala-thread-pane
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* Sticky thread header — highlight only */}
        <ThreadHeader conv={conv} infoOpen={infoOpen} onToggleInfo={() => setInfoOpen((v) => !v)} onBackToList={onBackToList} />

        {/* Read-only banner if past */}
        {isReadOnly && (
          <div
            style={{
              padding: "8px 18px",
              background: "rgba(11,11,13,0.04)",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.inkMuted,
            }}
          >
            🔒 This thread is archived. Read-only.
          </div>
        )}

        {/* Message stream — warm cream background, day separators
            grouped via the renderer, breathable spacing. */}
        {/* WS-13.3 — Virtuoso virtualizes the message stream.
            followOutput auto-scrolls to bottom when new messages arrive
            and the user is already near the bottom (matches chat UX).
            Header renders the AI summary above the first message.     */}
        <Virtuoso
          ref={virtuosoRef}
          style={{
            flex: 1,
            minHeight: 0,
            background: COLORS.surfaceAlt,
            backgroundImage: `radial-gradient(circle at 20% 0%, rgba(15,79,62,0.025), transparent 50%)`,
          }}
          data={buildMsgRenderables(messages, conv.stage, conv.leader.name.split(" ")[0]!, conv.unreadCount)}
          components={{
            Header: () => (
              <AIThreadSummary conv={conv} open={summaryOpen} onToggle={() => setSummaryOpen((v) => !v)} />
            ),
          }}
          followOutput={(isAtBottom) => (isAtBottom ? vsb() : false)}
          onScroll={(e) => { __threadScrollMap.set(conv.id, (e.target as HTMLElement).scrollTop); }}
          itemContent={(_, item) => {
            if (item.kind === "separator") return <div style={{ padding: "0 24px" }}><DaySeparator label={item.label} /></div>;
            if (item.kind === "unread-divider") return <div style={{ padding: "0 24px" }}><NewMessagesDivider count={item.count} /></div>;
            if (item.kind === "typing") return <div style={{ padding: "0 24px 16px" }}><TypingIndicator name={item.typingName} /></div>;
            return <div style={{ padding: "3px 24px" }}><MessageBubble msg={item.msg} stage={item.stage} isFirstOfGroup={item.isFirstOfGroup} /></div>;
          }}
        />

        {/* Composer */}
        {!isReadOnly && (
          <Composer
            conv={conv}
            isLocked={isLocked}
            onSendMessage={onSendMessage}
            onAfterSend={() => {
              // WS-13.3 — scroll to bottom via Virtuoso handle instead of
              // direct DOM scrollTop manipulation.
              virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: vsb() });
            }}
          />
        )}
      </section>

      {/* Right info sidebar — full pinned info + extras. Closes via the
          ⓘ toggle in the thread header. Slides off-screen at <540px. */}
      {infoOpen && <ThreadInfoSidebar conv={conv} isLocked={isLocked} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════
// INBOX
// ════════════════════════════════════════════════════════════════════

// ─── Inbox redesign — Phase B1 ──────────────────────────────────────
//
// Unified row anatomy + filter chips, matching the Calendar discipline.
// Replaces the prior nested "From your agencies" + "Holds & casting calls"
// dual-list with one flat list filtered by status. Same row pattern as
// Today's Needs-reply / Inquiries — talent learns it once, applies
// everywhere.
//
// Filter chips:
//   Action       — needs your reply (offers awaiting + inquiry-pending)
//   Active       — in flight (coordinator working, peer holds, etc.)
//   Confirmed    — accepted / approved / booked
//   Closed       — declined / expired / cancelled
//   All          — everything

export type InboxFilter = "action" | "active" | "confirmed" | "closed" | "all";


export type InboxItem = {
  id: string;
  source: "inquiry" | "request";
  category: InboxFilter;
  client: string;
  clientTrust: ClientTrustLevel;
  brief: string;
  kindLabel: string;
  kindTone: "coral" | "indigo" | "amber" | "success" | "ink";
  microcopy: string;
  ageHrs: number;
  date?: string;
  amount?: string;
  agency: string;
  onOpen: () => void;
};
