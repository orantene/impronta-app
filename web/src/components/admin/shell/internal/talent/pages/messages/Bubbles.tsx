"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Avatar, Toggle } from "../../../primitives";
import { COLORS, FONTS, TRANSITION } from "../../../state";
import { ActionMessage, ContentMessageBody, ReadReceiptRow } from "./Bubbles2";
import { MOCK_REACTIONS } from "./ThreadParts";
import { type Msg } from "../../shared/client-conversations-1";
import { type MsgStage } from "../../shared/conversations-1";



export function MessageBubble({ msg, stage, isFirstOfGroup = true }: { msg: Msg; stage: MsgStage; isFirstOfGroup?: boolean }) {
  const fromYou = "sender" in msg && msg.sender === "you";
  const isSystem = msg.kind === "system";
  const isAction = msg.kind.startsWith("action-") || msg.kind === "calendar-invite" || msg.kind === "contract-sign" || msg.kind === "polaroid-request" || msg.kind === "payment-receipt";

  if (isSystem) {
    // Premium system message — subtle, italic, centered. No background
    // pill (felt heavy). Just a small caption with a refined dot.
    return (
      <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 6px", fontFamily: FONTS.body }}>
        <span style={{ fontSize: 10.5, fontStyle: "italic", letterSpacing: 0.05, display: "inline-flex", alignItems: "center", gap: 6 }} className="text-admin-ink-muted">
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: COLORS.inkDim }} />
          {msg.body}
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: COLORS.inkDim }} />
        </span>
      </div>
    );
  }

  const align = fromYou ? "flex-end" : "flex-start";

  if (isAction) {
    return (
      <div style={{ display: "flex", justifyContent: align, fontFamily: FONTS.body, marginTop: isFirstOfGroup ? 8 : 0 }}>
        <ActionMessage msg={msg} fromYou={fromYou} stage={stage} />
      </div>
    );
  }

  // Regular content message — premium grouped layout.
  // First-in-group: shows avatar (incoming) + sender label
  // Subsequent: tighter spacing, avatar slot reserved (visually empty)
  // for vertical alignment.
  const senderLabel = "sender" in msg
    ? msg.sender === "coordinator"
      ? "Sara · Coordinator"
      : msg.sender === "agency"
        ? "Agency"
        : msg.sender === "client"
          ? "Client"
          : ""
    : "";
  return (
    <div style={{
      display: "flex",
      justifyContent: align,
      gap: 10,
      fontFamily: FONTS.body,
      marginTop: isFirstOfGroup ? 8 : 0,
    }}>
      {!fromYou && (
        isFirstOfGroup && "sender" in msg ? (
          <Avatar
            size={28}
            tone="auto"
            hashSeed={msg.sender}
            initials={msg.sender === "client" ? "" : msg.sender === "coordinator" ? "SM" : msg.sender === "agency" ? "AC" : ""}
          />
        ) : (
          <span style={{ width: 28, flexShrink: 0 }} aria-hidden />
        )
      )}
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 3 }}>
        {!fromYou && isFirstOfGroup && senderLabel && (
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", paddingLeft: 4 }} className="text-admin-ink-muted">
            {senderLabel}
          </div>
        )}
        <BubbleWithActions msg={msg} fromYou={fromYou}>
          <ContentMessageBody msg={msg} fromYou={fromYou} isFirstOfGroup={isFirstOfGroup} />
        </BubbleWithActions>
        <ReadReceiptRow msg={msg} fromYou={fromYou} />
      </div>
    </div>
  );
}


/**
 * SendButtonWithSchedule — primary send plus a disabled schedule preview.
 * Scheduling is intentionally honest until a real delayed-send backend exists.
 */
export function SendButtonWithSchedule({ disabled, onSend }: {
  disabled: boolean;
  onSend: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const close = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-tulala-send-menu]')) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { if (!disabled) onSend(); }}
        onContextMenu={(e) => { e.preventDefault(); if (!disabled) setMenuOpen(true); }}
        onTouchStart={() => {
          if (longPressRef.current) window.clearTimeout(longPressRef.current);
          longPressRef.current = window.setTimeout(() => { if (!disabled) setMenuOpen(true); }, 450);
        }}
        onTouchEnd={() => {
          if (longPressRef.current) window.clearTimeout(longPressRef.current);
        }}
        onTouchCancel={() => {
          if (longPressRef.current) window.clearTimeout(longPressRef.current);
        }}
        aria-label="Send"
        title="Tap to send · scheduled send coming soon"
        disabled={disabled}
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "none",
          background: !disabled ? COLORS.fill : "rgba(11,11,13,0.06)",
          color: !disabled ? "#fff" : COLORS.inkDim,
          cursor: !disabled ? "pointer" : "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: `background ${TRANSITION.micro}`,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
      {menuOpen && (
        <div
          data-tulala-send-menu
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.15)",
            padding: 6,
            zIndex: 30,
            minWidth: 200,
            fontFamily: FONTS.body,
            animation: "tulala-bubble-action-in .14s ease",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, padding: "6px 10px 4px" }} className="text-admin-ink-muted">Scheduled send coming soon</div>
          <div style={{ padding: "4px 10px 8px", fontSize: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">
            Delayed send needs a queue before it can be enabled.
          </div>
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 4px" }} />
          <BubbleMenuItem icon="x" label="Close menu" onClick={close} />
        </div>
      )}
    </div>
  );
}


/**
 * BubbleWithActions — wraps a chat bubble with hover/long-press actions:
 *   - Hover (desktop): small ⋯ trigger appears on the bubble's far side
 *   - Long-press (touch): same menu opens at the bubble
 *   - Right-click (desktop): same menu (contextmenu)
 *
 * The menu offers a quick-reaction row plus copy. Other message actions
 * stay hidden until backed by real mutations.
 *
 * Reactions render as small chips below the bubble. State is local to
 * this component and seeded from MOCK_REACTIONS for demonstration.
 */
function BubbleWithActions({ msg, fromYou, children }: { msg: Msg; fromYou: boolean; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactions, setReactions] = useState<string[]>(() => MOCK_REACTIONS[msg.id] ?? []);
  const longPressRef = useRef<number | null>(null);
  const close = () => setMenuOpen(false);
  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-tulala-bubble-menu]')) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  const onTouchStart = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => setMenuOpen(true), 450);
  };
  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };
  const addReaction = (e: string) => {
    setReactions((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
    close();
  };
  return (
    <div
      style={{ position: "relative", display: "inline-flex", flexDirection: "column", gap: 4, alignItems: fromYou ? "flex-end" : "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      onTouchStart={onTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      <div className="relative">
        {children}
        {hovered && !menuOpen && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Message actions"
            style={{
              position: "absolute",
              top: -10,
              [fromYou ? "left" : "right"]: -10,
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              boxShadow: "0 2px 6px rgba(11,11,13,0.10)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              color: COLORS.inkMuted,
              animation: "tulala-bubble-action-in .12s ease",
              zIndex: 5,
            } as CSSProperties}
          >
            ···
          </button>
        )}
      </div>
      {reactions.length > 0 && (
        <div style={{ display: "inline-flex", gap: 4, paddingRight: fromYou ? 0 : 4, paddingLeft: fromYou ? 4 : 0 }}>
          {Array.from(new Set(reactions)).map((e) => {
            const count = reactions.filter((r) => r === e).length;
            return (
              <button
                key={e}
                type="button"
                onClick={() => addReaction(e)}
                title="Toggle reaction"
                style={{
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  padding: "1px 6px 1px 5px",
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  lineHeight: 1.2,
                  boxShadow: "0 1px 2px rgba(11,11,13,0.04)",
                }}
              >
                <span style={{ fontSize: 12 }}>{e}</span>
                {count > 1 && <span className="text-admin-ink-muted">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
      {menuOpen && (
        <div
          data-tulala-bubble-menu
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            [fromYou ? "right" : "left"]: 0,
            marginTop: 6,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(11,11,13,0.15)",
            padding: 6,
            zIndex: 20,
            minWidth: 200,
            animation: "tulala-bubble-action-in .14s ease",
          } as CSSProperties}
        >
          <style>{`
            @keyframes tulala-bubble-action-in {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {/* Reaction row */}
          <div style={{
            display: "flex",
            gap: 4,
            padding: "4px 4px 6px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            marginBottom: 4,
          }}>
            {["👍", "❤️", "😂", "⭐", "❓", "🙏"].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => addReaction(e)}
                aria-label={`React with ${e}`}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 18,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: `transform ${TRANSITION.micro}, background ${TRANSITION.micro}`,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(11,11,13,0.05)"; ev.currentTarget.style.transform = "scale(1.15)"; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; ev.currentTarget.style.transform = "scale(1)"; }}
              >
                {e}
              </button>
            ))}
          </div>
          {/* Action menu */}
          <BubbleMenuItem icon="📋" label="Copy" onClick={() => {
            try {
              if ("body" in msg && typeof msg.body === "string") navigator.clipboard?.writeText(msg.body);
            } catch { /* noop */ }
            close();
          }} />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 4px" }} />
          <div style={{
            fontSize: 10, fontWeight: 700, padding: "6px 10px 4px" }} className="text-admin-ink-muted">Message actions coming soon</div>
          <div style={{ padding: "4px 10px 8px", fontSize: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">
            Reply threading, pin, translate, and forward need real message actions before they appear here.
          </div>
          <BubbleMenuItem icon="x" label="Close menu" onClick={close} />
        </div>
      )}
    </div>
  );
}


export function BubbleMenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 13,
        color: COLORS.ink,
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}


/**
 * Premium voice-note bubble. Replaces the dotted-line waveform with a
 * deterministic bar-pattern generated from the message id (so each
 * voice note has a unique waveform shape, not a generic fill). Adds:
 *   - Real ▶/❚❚ play toggle that animates a fake progress sweep
 *   - 1×/1.5×/2× speed toggle (cycle on tap)
 *   - Tappable scrub (clicking a bar jumps progress to that bar)
 *   - Pulse animation while "playing"
 */
export function VoiceNoteBubble({ msg, fromYou, bg, fg, border }: {
  msg: Extract<Msg, { kind: "voice" }>;
  fromYou: boolean;
  bg: string;
  fg: string;
  border: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  // Generate 28 bar heights deterministically from the id so the
  // waveform looks "voice-like" but stable across renders.
  const bars = (() => {
    const out: number[] = [];
    let h = 0;
    for (let i = 0; i < msg.id.length; i++) h = (h * 31 + msg.id.charCodeAt(i)) >>> 0;
    for (let i = 0; i < 28; i++) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const v = ((h >> 16) % 100) / 100;
      // Apply an envelope so beginning/end are quieter
      const envelope = Math.sin((Math.PI * (i + 0.5)) / 28);
      out.push(0.25 + 0.75 * v * envelope);
    }
    return out;
  })();
  // Fake play progress sweep
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const startProgress = progress >= 1 ? 0 : progress;
    if (progress >= 1) setProgress(0);
    const totalMs = (msg.durationSec * 1000) / speed;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = startProgress + elapsed / totalMs;
      if (p >= 1) {
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, msg.durationSec]);
  const remaining = Math.max(0, msg.durationSec * (1 - progress));
  const remainStr = `0:${Math.ceil(remaining).toString().padStart(2, "0")}`;
  const activeColor = fromYou ? "rgba(255,255,255,0.95)" : COLORS.accent;
  const inactiveColor = fromYou ? "rgba(255,255,255,0.30)" : "rgba(11,11,13,0.20)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 10px",
        background: bg,
        color: fg,
        border,
        borderRadius: 999,
        minWidth: 240,
      }}
    >
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: fromYou ? "rgba(255,255,255,0.18)" : "rgba(11,11,13,0.06)",
          border: "none",
          color: fg,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          role="slider"
          aria-label="Voice note progress"
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setProgress(ratio);
          }}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 22,
            cursor: "pointer",
          }}
        >
          {bars.map((h, i) => {
            const barProgress = (i + 1) / bars.length;
            const isActive = barProgress <= progress;
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.round(h * 100)}%`,
                  background: isActive ? activeColor : inactiveColor,
                  borderRadius: 1,
                  transition: `background ${TRANSITION.micro}`,
                }}
              />
            );
          })}
        </div>
        {msg.transcript && (
          <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 1, lineHeight: 1.4 }}>
            &quot;{msg.transcript}&quot;
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, opacity: 0.8, fontVariantNumeric: "tabular-nums" }}>
          {remainStr}
        </span>
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))}
          aria-label={`Playback speed ${speed}x — tap to change`}
          style={{
            padding: "1px 6px",
            background: fromYou ? "rgba(255,255,255,0.15)" : "rgba(11,11,13,0.06)",
            border: "none",
            borderRadius: 999,
            color: fg,
            fontSize: 10,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            cursor: "pointer",
            opacity: speed === 1 ? 0.7 : 1,
          }}
        >
          {speed}×
        </button>
      </div>
    </div>
  );
}
