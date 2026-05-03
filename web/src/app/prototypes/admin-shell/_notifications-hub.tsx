"use client";

/**
 * Notifications hub — centralized dropdown anchored to the bell icon.
 *
 * Replaces the bell-opens-drawer pattern with a popover that surfaces
 * actionable items inline. Three sections:
 *   • Action needed — approvals, pending offers, expired invites
 *   • Updates       — new inquiries, replies, payments
 *   • System        — plan limits, billing reminders
 *
 * Uses native `popover` attribute (browser handles outside-click + Esc
 * + a11y). Falls back gracefully on older browsers.
 *
 * Read state lives in localStorage (`tulala_notif_read_v1`) so dismissed
 * items don't reappear after page reload.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COLORS, FONTS, useProto, RICH_INQUIRIES } from "./_state";
import { MOCK_CONVERSATIONS } from "./_talent";
import { ageLabel } from "./_messages";

export type HubItem = {
  id: string;
  bucket: "action" | "update" | "system";
  icon: string;        // emoji or short symbol
  title: string;
  body: string;
  whenLabel: string;   // already-formatted relative time
  cta?: { label: string; run: () => void };
};

const READ_KEY = "tulala_notif_read_v1";
const DISMISSED_KEY = "tulala_notif_dismissed_v1";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}
function writeSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

/** Anchored bell + popover. Caller renders this where the bell goes;
 *  the count + popover are managed internally. */
export function NotificationsBell({
  size = "md",
}: {
  size?: "sm" | "md";
}) {
  const { state, openDrawer, pendingTalent } = useProto();
  const popoverId = useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [readSetState, setReadSetState] = useState<Set<string>>(() => readSet(READ_KEY));
  const [dismissedState, setDismissedState] = useState<Set<string>>(() => readSet(DISMISSED_KEY));
  const [, force] = useState(0);

  // Native popover="auto" places the element in the browser's top layer,
  // so position:absolute relative to its DOM parent no longer applies.
  // Anchor it manually to the bell button on each open.
  useEffect(() => {
    const pop = popoverRef.current;
    const btn = buttonRef.current;
    if (!pop || !btn) return;
    const reposition = () => {
      const r = btn.getBoundingClientRect();
      const popWidth = pop.offsetWidth || 380;
      const margin = 12;
      const top = r.bottom + 6;
      let left = r.right - popWidth;
      if (left < margin) left = margin;
      if (left + popWidth > window.innerWidth - margin) {
        left = window.innerWidth - popWidth - margin;
      }
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
      pop.style.right = "auto";
    };
    const onToggle = (e: Event) => {
      const evt = e as ToggleEvent;
      if (evt.newState === "open") reposition();
    };
    pop.addEventListener("beforetoggle", onToggle as EventListener);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      pop.removeEventListener("beforetoggle", onToggle as EventListener);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, []);

  const closePopover = () => popoverRef.current?.hidePopover?.();

  // Build items from real proto state — pendingTalent + a couple of
  // mocks for the other buckets.
  const items: HubItem[] = useMemo(() => {
    const out: HubItem[] = [];
    // Action: pending approvals
    pendingTalent.forEach((p, i) => {
      out.push({
        id: `pending-${p.id}`,
        bucket: "action",
        icon: "👤",
        title: `${p.name} · pending approval`,
        body: `${p.childTypes.join(" · ")} from ${p.city}. Submitted ${p.submittedAgo}.`,
        whenLabel: p.submittedAgo,
        cta: { label: "Review", run: () => openDrawer("talent-approvals") },
      });
    });
    // Action: brand-new (unseen) inquiries from MOCK_CONVERSATIONS +
    // RICH_INQUIRIES. The bell should reflect what the inbox is
    // already flagging with the NEW pill — not lag behind it.
    MOCK_CONVERSATIONS.filter(c => c.seen === false).forEach(c => {
      out.push({
        id: `new-conv-${c.id}`,
        bucket: "action",
        icon: "📥",
        title: `New inquiry · ${c.client}`,
        body: c.lastMessage.preview.slice(0, 90),
        whenLabel: ageLabel(c.lastMessage.ageHrs),
      });
    });
    RICH_INQUIRIES.filter(i => i.seen === false).forEach(i => {
      out.push({
        id: `new-inq-${i.id}`,
        bucket: "action",
        icon: "📥",
        title: `New inquiry · ${i.clientName}`,
        body: i.brief,
        whenLabel: ageLabel(i.lastActivityHrs),
      });
    });
    // Update mocks
    out.push({
      id: "rev-203", bucket: "update", icon: "✓",
      title: "Booking confirmed · Bvlgari",
      body: "Kai Lin · 2 days · €3,200 · payment cleared.",
      whenLabel: "1h ago",
    });
    // System mocks
    if (state.plan === "free") {
      out.push({
        id: "plan-cap", bucket: "system", icon: "↑",
        title: "4 of 5 talent slots used",
        body: "You'll hit the Free cap with 1 more talent. Studio is €29/mo.",
        whenLabel: "ongoing",
        cta: { label: "Compare plans", run: () => openDrawer("plan-billing") },
      });
    }
    return out.filter(i => !dismissedState.has(i.id));
  }, [pendingTalent, state.plan, openDrawer, dismissedState]);

  const unreadActionCount = items.filter(i => i.bucket === "action" && !readSetState.has(i.id)).length;
  const totalUnread = items.filter(i => !readSetState.has(i.id)).length;

  const markRead = (id: string) => {
    const next = new Set(readSetState);
    next.add(id);
    writeSet(READ_KEY, next);
    setReadSetState(next);
  };
  const markAllRead = () => {
    const next = new Set([...readSetState, ...items.map(i => i.id)]);
    writeSet(READ_KEY, next);
    setReadSetState(next);
  };
  const dismiss = (id: string) => {
    const next = new Set(dismissedState);
    next.add(id);
    writeSet(DISMISSED_KEY, next);
    setDismissedState(next);
  };

  // Group items by bucket for rendering
  const grouped = {
    action: items.filter(i => i.bucket === "action"),
    update: items.filter(i => i.bucket === "update"),
    system: items.filter(i => i.bucket === "system"),
  };

  const dim = size === "sm" ? 28 : 32;
  const iconSize = size === "sm" ? 14 : 15;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>{`#${CSS.escape(popoverId)}:popover-open{display:flex}`}</style>
      <button type="button"
        ref={buttonRef}
        {...({ popoverTarget: popoverId } as Record<string, string>)}
        aria-label={`Notifications · ${totalUnread} unread`}
        style={{
          width: dim, height: dim, borderRadius: 8,
          border: `1px solid ${COLORS.borderSoft}`,
          background: "#fff", color: COLORS.inkMuted,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", position: "relative",
          transition: "border-color 0.12s, color 0.12s",
          outline: "none",
          WebkitTapHighlightColor: "transparent",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
        onClick={(e) => { e.currentTarget.blur(); }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {totalUnread > 0 && (
          <span style={{
            position: "absolute", top: -3, right: -3,
            // Force a perfectly round badge for single-digit counts.
            // Was rendering as a slight oval because `min-width: 16 +
            // padding 0 5` produced a wider-than-tall box once the 2px
            // border was added (content-box). Switching to box-sizing:
            // border-box and balancing min-width = height = 18 gives a
            // crisp 18x18 circle for single digits and pills out
            // gracefully for "9+".
            minWidth: 18, height: 18, padding: "0 4px",
            boxSizing: "border-box",
            borderRadius: 999, border: "2px solid #fff",
            background: unreadActionCount > 0 ? COLORS.amberDeep : COLORS.indigoDeep,
            color: "#fff",
            fontSize: 9.5, fontWeight: 700, lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONTS.body,
          }}>{totalUnread > 9 ? "9+" : totalUnread}</span>
        )}
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        {...({ popover: "auto" } as Record<string, string>)}
        style={{
          width: 380, maxWidth: "calc(100vw - 24px)",
          maxHeight: "70vh",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14,
          boxShadow: "0 24px 60px -10px rgba(11,11,13,0.30), 0 4px 16px rgba(11,11,13,0.06)",
          padding: 0, margin: 0, inset: "auto",
          fontFamily: FONTS.body,
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>Notifications</span>
          {totalUnread > 0 && (
            <button type="button" onClick={() => { markAllRead(); force(n => n + 1); }} style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              fontSize: 11, fontWeight: 600, color: COLORS.indigoDeep,
            }}>Mark all read</button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
          {items.length === 0 && (
            <div style={{ padding: "30px 16px", textAlign: "center", fontSize: 12.5, color: COLORS.inkMuted }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
              All caught up.
            </div>
          )}

          {grouped.action.length > 0 && (
            <SectionGroup label="Action needed" items={grouped.action} readSet={readSetState}
              onClick={(it) => { closePopover(); markRead(it.id); it.cta?.run(); }}
              onDismiss={(id) => { dismiss(id); }}
              accent={COLORS.amberDeep}
            />
          )}
          {grouped.update.length > 0 && (
            <SectionGroup label="Updates" items={grouped.update} readSet={readSetState}
              onClick={(it) => { closePopover(); markRead(it.id); it.cta?.run(); }}
              onDismiss={(id) => { dismiss(id); }}
              accent={COLORS.indigoDeep}
            />
          )}
          {grouped.system.length > 0 && (
            <SectionGroup label="System" items={grouped.system} readSet={readSetState}
              onClick={(it) => { closePopover(); markRead(it.id); it.cta?.run(); }}
              onDismiss={(id) => { dismiss(id); }}
              accent={COLORS.inkMuted}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 14px", borderTop: `1px solid ${COLORS.borderSoft}`,
          fontSize: 11, color: COLORS.inkMuted, textAlign: "center",
        }}>
          <button type="button" onClick={() => { popoverRef.current?.hidePopover?.(); openDrawer("notifications-prefs"); }} style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            fontSize: 11, fontWeight: 500, color: COLORS.inkMuted,
          }}>Notification preferences →</button>
        </div>
      </div>
    </div>
  );
}

function SectionGroup({ label, items, readSet, onClick, onDismiss, accent }: {
  label: string;
  items: HubItem[];
  readSet: Set<string>;
  onClick: (it: HubItem) => void;
  onDismiss: (id: string) => void;
  accent: string;
}) {
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      <div style={{
        padding: "6px 10px",
        fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
        color: COLORS.inkMuted,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
        {label}
        <span style={{ color: COLORS.inkDim, fontWeight: 500, letterSpacing: 0 }}>· {items.length}</span>
      </div>
      {items.map(it => {
        const isRead = readSet.has(it.id);
        return (
          <div key={it.id} style={{
            position: "relative",
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "10px 12px", margin: "0 4px",
            borderRadius: 10,
            background: isRead ? "transparent" : "rgba(91,107,160,0.04)",
            cursor: it.cta ? "pointer" : "default",
            fontFamily: FONTS.body,
          }}
            onClick={() => it.cta && onClick(it)}
            onMouseEnter={(e) => { if (it.cta) e.currentTarget.style.background = COLORS.surfaceAlt; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isRead ? "transparent" : "rgba(91,107,160,0.04)"; }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: COLORS.surfaceAlt,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 13,
            }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: 12.5, fontWeight: isRead ? 500 : 600,
                  color: COLORS.ink,
                  flex: 1, minWidth: 0,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{it.title}</span>
                <span style={{ fontSize: 10, color: COLORS.inkDim, flexShrink: 0 }}>{it.whenLabel}</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
                {it.body}
              </div>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDismiss(it.id); }} aria-label="Dismiss" style={{
              width: 20, height: 20, borderRadius: 6, border: "none",
              background: "transparent", color: COLORS.inkMuted,
              fontSize: 12, lineHeight: 1, cursor: "pointer",
              flexShrink: 0, opacity: 0.4,
            }}>×</button>
          </div>
        );
      })}
    </div>
  );
}
