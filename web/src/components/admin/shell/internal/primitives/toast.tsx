"use client";

// ─── Toast host ──────────────────────────────────────────────────────
//
// ToastHost + ToastTone. Extracted from primitives.tsx — Phase 1f.

import { useEffect, useState } from "react";
import { COLORS, FONTS, Z } from "../state";
import { Icon } from "./icons";

// ─── Toast host ──────────────────────────────────────────────────────
//
// WS-6.1: Extended tone system.
//   "default"  — dark/ink (generic success-ish)
//   "success"  — dark green + check-circle
//   "error"    — dark red + alert
//   "warning"  — dark amber + alert
//   "info"     — dark blue + info
//
// All tones share the same component; only background, shadow, icon,
// and progress-bar colour change.

export type ToastTone = "default" | "success" | "error" | "warning" | "info";

const TOAST_LIFETIME_MS = 4500;

const TOAST_THEME: Record<ToastTone, { bg: string; shadow: string; iconName: string; progressBg: string }> = {
  default: {
    bg:          COLORS.fill,
    shadow:      "0 12px 30px -10px rgba(11,11,13,0.5)",
    iconName:    "check",
    progressBg:  "rgba(255,255,255,0.25)",
  },
  success: {
    bg:          "#14462e",
    shadow:      "0 12px 30px -10px rgba(20,70,46,0.55)",
    iconName:    "check",
    progressBg:  "rgba(52,211,153,0.45)",
  },
  error: {
    bg:          "#5a1a1f",
    shadow:      "0 12px 30px -10px rgba(120,30,40,0.55)",
    iconName:    "alert",
    progressBg:  "rgba(252,165,165,0.4)",
  },
  warning: {
    bg:          "#5c3a00",
    shadow:      "0 12px 30px -10px rgba(92,58,0,0.55)",
    iconName:    "alert",
    progressBg:  "rgba(253,224,71,0.4)",
  },
  info: {
    bg:          "#0f2a4a",
    shadow:      "0 12px 30px -10px rgba(15,42,74,0.55)",
    iconName:    "info",
    progressBg:  "rgba(147,197,253,0.4)",
  },
};

/**
 * Per-toast row — owns its own auto-dismiss timer. Hover pauses the timer
 * (so reading a long-ish toast doesn't get interrupted), mouseleave
 * resumes from a fresh full window. Click dismisses immediately.
 */
type ToastAction = { label: string; onClick: () => void };
function ToastRow({ id, message, undo, action, tone = "default", onDismiss }: { id: number; message: string; undo?: () => void; action?: ToastAction; tone?: ToastTone; onDismiss?: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const theme   = TOAST_THEME[tone];
  const lifetime = (undo || action) ? TOAST_LIFETIME_MS * 2 : TOAST_LIFETIME_MS;
  useEffect(() => {
    if (!onDismiss || paused) return;
    const handle = window.setTimeout(() => onDismiss(id), lifetime);
    return () => window.clearTimeout(handle);
  }, [id, onDismiss, paused, undo, action, lifetime]);
  return (
    <div
      // WS-12.7 — error toasts use role="alert" (assertive) so screen readers
      // announce them immediately; other tones use role="status" (polite).
      role={tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background:    theme.bg,
        color:         "#fff",
        padding:       "10px 14px 0",
        borderRadius:  10,
        fontFamily:    FONTS.body,
        fontSize:      13,
        boxShadow:     theme.shadow,
        display:       "inline-flex",
        flexDirection: "column",
        gap:           0,
        animation:     "tulalaToastIn .18s ease",
        pointerEvents: "auto",
        textAlign:     "left",
        overflow:      "hidden",
        minWidth:      220,
        maxWidth:      360,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
        <Icon name={theme.iconName as Parameters<typeof Icon>[0]["name"]} size={14} stroke={2} />
        <span className="flex-1">{message}</span>
        {undo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              undo();
              onDismiss?.(id);
            }}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            Undo
          </button>
        )}
        {action && !undo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              onDismiss?.(id);
            }}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss?.(id)}
          aria-label={`Dismiss: ${message}`}
          style={{
            background:  "transparent",
            color:       "rgba(255,255,255,0.6)",
            border:      "none",
            padding:     0,
            marginLeft:  (undo || action) ? 0 : "auto",
            cursor:      "pointer",
            display:     "inline-flex",
            flexShrink:  0,
          }}
        >
          <Icon name="x" size={11} stroke={2} />
        </button>
      </div>
      {/* Progress bar — shrinks from 100% to 0 over the toast lifetime */}
      <div
        aria-hidden
        style={{
          height:          2,
          background:      theme.progressBg,
          borderRadius:    999,
          width:           "100%",
          transformOrigin: "left",
          animation:       `tulalaToastProgress ${lifetime}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; undo?: () => void; action?: ToastAction; tone?: ToastTone }[];
  onDismiss?: (id: number) => void;
}) {
  return (
    <div
      // Status-region announcements: each new toast is read by screen readers
      // without stealing focus. `polite` defers until the user is idle so we
      // don't interrupt active typing.
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      data-tulala-toast-host
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: Z.toast,
        // Allow clicks on individual toasts; the wrapper itself stays
        // pass-through so it never blocks UI underneath.
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} id={t.id} message={t.message} undo={t.undo} action={t.action} tone={t.tone} onDismiss={onDismiss} />
      ))}
      <style>{`
        @keyframes tulalaToastIn {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes tulalaToastProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}

