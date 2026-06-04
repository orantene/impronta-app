"use client";

import React, { useState, useRef } from "react";
import { COLORS, TRANSITION, FONTS } from "../../state";
import { type Conversation } from "../../talent";
import { applyRowOverrides } from "../conversation-stash";
import { currentTalentId } from "../messages-shared";
import { MOCK_OFFER_FOR_CONV } from "./machinery-10";



// ════════════════════════════════════════════════════════════════════
// 2) TALENT JOB SHELL — assignment-centric, NOT chat-first
// ════════════════════════════════════════════════════════════════════
//
// Detail view is a JOB CARD, not a chat. The hero is the job's facts:
// status, dates, location, your-take-home. Big actions (Accept, Decline,
// Hold). Schedule + Location + Coordinator + Files as detail blocks.
// Conversation is at the bottom — secondary.

export type TalentFilter = "all" | "inquiry" | "hold" | "booked" | "past" | "coordinating";

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
    const currency = offer.clientBudget?.currency ?? "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(gross);
  },
}) as Record<string, string>;

// ── Resizable inbox layout — drag-to-resize left rail + collapse to
// a thin status strip. State persists per-shell to localStorage so
// reloads keep the user's chosen width. ──
export const INBOX_DEFAULT_WIDTH = 340;
export const INBOX_MIN_WIDTH = 240;
export const INBOX_MAX_WIDTH = 560;
export function useResizableInboxLayout(shellKey: "talent" | "client" | "admin") {
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
export function ColumnDivider({ onResize, disabled }: { onResize: (w: number) => void; disabled?: boolean }) {
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
export function MobileInboxTab({ unreadCount, onOpen }: { unreadCount: number; onOpen: () => void }) {
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
export function CollapsedInboxRail({
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
      <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: FONTS.body, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700, marginTop: 6 }} className="text-admin-ink-muted">
        {count} jobs
      </div>
      {unreadCount > 0 && (
        <span style={{ marginTop: 2, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, color: "#fff", fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.body }} className="bg-admin-accent">{unreadCount}</span>
      )}
    </aside>
  );
}
