"use client";

/**
 * ClientNotificationBell — bell icon + popover for the client topbar.
 *
 * Renders a bell button with an unread count badge.  Clicking opens a
 * native popover listing the user's recent notifications (from
 * `loadMyNotifications`).  Each row is clickable to its href.
 * A "Mark all read" button fires `markNotificationsRead('all')`.
 *
 * Uses the browser-native `popover="auto"` attribute for outside-click +
 * Esc dismissal (same pattern as the admin NotificationsBell).
 *
 * Props are intentionally thin — the parent (client layout) passes the
 * initial server-loaded notifications so the bell is populated on first
 * render with zero client waterfalls.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadMyNotifications,
  markNotificationsRead,
  type MyNotification,
} from "@/lib/server-actions/notifications-self";

// ── Design tokens (match client shell: blue accent, clean whites) ─────────────
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  fill:       "#1D4ED8",
  fillSoft:   "rgba(29,78,216,0.08)",
  surface:    "rgba(11,11,13,0.02)",
  surfaceAlt: "rgba(11,11,13,0.04)",
  red:        "#DC2626",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function relativeTs(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function iconForKind(kind: string): string {
  switch (kind) {
    case "approval":  return "👤";
    case "message":   return "💬";
    case "offer":     return "💼";
    case "booking":   return "📅";
    case "payment":   return "💳";
    case "profile":   return "✎";
    case "system":    return "ⓘ";
    default:          return "🔔";
  }
}

function escapeCssId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ClientNotificationBell({
  initialNotifications,
  tenantSlug,
}: {
  initialNotifications: MyNotification[];
  tenantSlug: string;
}) {
  const router = useRouter();
  const popoverId = useId();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef  = useRef<HTMLButtonElement | null>(null);

  const [notifications, setNotifications] = useState<MyNotification[]>(initialNotifications);
  const [loading, setLoading] = useState(false);

  // ── Derive read state from row data (readAt !== null) ──────────────────────
  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  // ── Refresh from server when the popover opens ─────────────────────────────
  const refreshNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await loadMyNotifications(50);
      setNotifications(fresh);
    } catch {
      // silently ignore; keep showing stale data
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Reposition popover on open ─────────────────────────────────────────────
  useEffect(() => {
    const pop = popoverRef.current;
    const btn = buttonRef.current;
    if (!pop || !btn) return;

    const reposition = () => {
      const r = btn.getBoundingClientRect();
      const popWidth = pop.offsetWidth || 360;
      const margin = 12;
      const top  = r.bottom + 6;
      let left = r.right - popWidth;
      if (left < margin) left = margin;
      if (left + popWidth > window.innerWidth - margin) {
        left = window.innerWidth - popWidth - margin;
      }
      pop.style.top  = `${top}px`;
      pop.style.left = `${left}px`;
      pop.style.right = "auto";
    };

    const onToggle = (e: Event) => {
      const evt = e as ToggleEvent;
      if (evt.newState === "open") {
        reposition();
        void refreshNotifications();
      }
    };

    pop.addEventListener("beforetoggle", onToggle as EventListener);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      pop.removeEventListener("beforetoggle", onToggle as EventListener);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [refreshNotifications]);

  // ── Mark a single notification read ───────────────────────────────────────
  const markOneRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === id && n.readAt === null
        ? { ...n, readAt: new Date().toISOString() }
        : n
      ),
    );
    await markNotificationsRead([id]);
  }, []);

  // ── Mark all read ──────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    await markNotificationsRead("all");
  }, []);

  // ── Navigate to href ───────────────────────────────────────────────────────
  // Prefer an explicit href from the notification, or synthesise from the
  // inquiry id (client always routes to the messages thread).
  const resolveHref = useCallback((n: MyNotification): string | null => {
    if (n.href) return n.href;
    // Derive from target_payload or origin — we only have what's in MyNotification;
    // use the href field already mapped by the loader (may still be null).
    return null;
  }, []);

  const handleRowClick = useCallback(async (n: MyNotification) => {
    popoverRef.current?.hidePopover?.();
    if (n.readAt === null) await markOneRead(n.id);
    const href = resolveHref(n);
    if (href) router.push(href);
  }, [markOneRead, resolveHref, router]);

  const escapedId = escapeCssId(popoverId);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>{`#${escapedId}:popover-open{display:flex}`}</style>

      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Notifications · ${unreadCount} unread`}
        {...({ popoverTarget: popoverId } as Record<string, string>)}
        onClick={(e) => { e.currentTarget.blur(); }}
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          border: `1px solid ${C.borderSoft}`,
          background: "#fff",
          color: C.inkMuted,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          transition: "border-color 0.12s, color 0.12s",
          outline: "none",
          WebkitTapHighlightColor: "transparent",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(24,24,27,0.16)";
          e.currentTarget.style.color = C.ink;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = C.borderSoft;
          e.currentTarget.style.color = C.inkMuted;
        }}
      >
        {/* Bell SVG */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              boxSizing: "border-box",
              borderRadius: 999,
              border: "2px solid #fff",
              background: C.fill,
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover panel */}
      <div
        ref={popoverRef}
        id={popoverId}
        {...({ popover: "auto" } as Record<string, string>)}
        style={{
          width: 360,
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "70vh",
          background: "#fff",
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          boxShadow:
            "0 24px 60px -10px rgba(11,11,13,0.28), 0 4px 16px rgba(11,11,13,0.06)",
          padding: 0,
          margin: 0,
          inset: "auto",
          fontFamily: FONT,
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${C.borderSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.ink,
              letterSpacing: -0.1,
            }}
          >
            Notifications
            {loading && (
              <span
                style={{
                  display: "inline-block",
                  marginLeft: 6,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: C.inkDim,
                  opacity: 0.5,
                  animation: "client-notif-pulse 1s infinite",
                }}
              />
            )}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                color: C.fill,
                fontFamily: FONT,
              }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: C.inkMuted,
                fontFamily: FONT,
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 8 }}>✓</div>
              All caught up.
            </div>
          ) : (
            notifications.map((n) => {
              const isRead = n.readAt !== null;
              return (
                <div
                  key={n.id}
                  role={n.href ? "button" : undefined}
                  tabIndex={n.href ? 0 : undefined}
                  onClick={() => void handleRowClick(n)}
                  onKeyDown={(e) => {
                    if (n.href && (e.key === "Enter" || e.key === " ")) {
                      void handleRowClick(n);
                    }
                  }}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 14px",
                    borderBottom: `1px solid ${C.borderSoft}`,
                    background: isRead ? "transparent" : "rgba(29,78,216,0.03)",
                    cursor: n.href ? "pointer" : "default",
                    transition: "background 120ms",
                  }}
                  onMouseEnter={(e) => {
                    if (n.href) (e.currentTarget as HTMLDivElement).style.background = C.surfaceAlt;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      isRead ? "transparent" : "rgba(29,78,216,0.03)";
                  }}
                >
                  {/* Kind icon */}
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: C.surface,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 13,
                    }}
                  >
                    {iconForKind(n.kind)}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: isRead ? 500 : 600,
                          color: C.ink,
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: C.inkDim,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {relativeTs(n.createdAt)}
                      </span>
                    </div>
                    {n.body && (
                      <div
                        style={{
                          fontSize: 11,
                          color: C.inkMuted,
                          marginTop: 2,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {n.body}
                      </div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!isRead && (
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: C.fill,
                        flexShrink: 0,
                        marginTop: 5,
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            fontSize: 11,
            color: C.inkMuted,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          Showing recent notifications
        </div>
      </div>

      {/* Minimal keyframe for the loading dot — scoped */}
      <style>{`
        @keyframes client-notif-pulse {
          0%,100% { opacity:0.5; }
          50%      { opacity:1; }
        }
      `}</style>
    </div>
  );
}
