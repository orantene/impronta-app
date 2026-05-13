"use client";

/**
 * MessageReactions — WhatsApp-style 6-emoji reaction strip + the
 * count chips that surface existing reactions on a message.
 *
 * Two surfaces:
 *   - <ReactionPicker> — opens on long-press (mobile) / hover (desktop)
 *     near a message bubble. Pick one of the 6 default emoji or "+"
 *     opens the full picker (later).
 *   - <ReactionChips> — renders below the message bubble, one chip
 *     per emoji that has at least one reaction. Tap a chip to toggle
 *     your reaction.
 *
 * Engine wiring is per-surface — caller provides `onReact(emoji)`
 * which writes to the (future) `message_reactions` table or
 * equivalent. Placeholder until then surfaces a toast.
 */

import { useState } from "react";

/** The 6 canonical reactions — matches WhatsApp's default set. */
export const DEFAULT_REACTION_SET = ["👍", "❤️", "🎉", "😂", "😮", "🙏"] as const;
export type DefaultReaction = typeof DEFAULT_REACTION_SET[number];

export type ReactionCount = {
  emoji: string;
  count: number;
  /** True when the current user has reacted with this emoji. */
  mine?: boolean;
};

/* ─── Picker ─────────────────────────────────────────────────────── */

export type ReactionPickerProps = {
  open: boolean;
  /** Anchored above (default) or below the message bubble. */
  placement?: "above" | "below";
  /** Caller wires the actual write. When undefined, surfaces a toast. */
  onReact?: (emoji: string) => void;
  onClose: () => void;
  toast?: (text: string) => void;
};

export function ReactionPicker({
  open, placement = "above", onReact, onClose, toast,
}: ReactionPickerProps) {
  if (!open) return null;

  const pick = (emoji: string) => {
    if (onReact) {
      onReact(emoji);
    } else {
      toast?.(`Reacted with ${emoji} — engine wiring coming soon`);
    }
    onClose();
  };

  return (
    <div
      role="menu"
      aria-label="React"
      style={{
        position: "absolute",
        [placement === "above" ? "bottom" : "top"]: "calc(100% + 6px)" as string,
        left: 0,
        display: "inline-flex",
        gap: 2,
        padding: 4,
        background: "#fff",
        border: "1px solid rgba(24,24,27,0.10)",
        borderRadius: 999,
        boxShadow: "0 8px 24px rgba(11,11,13,0.14)",
        zIndex: 30,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {DEFAULT_REACTION_SET.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React with ${emoji}`}
          onClick={() => pick(emoji)}
          style={{
            width: 36, height: 36,
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 999,
            fontSize: 20,
            lineHeight: 1,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "transform 80ms",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.18)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >
          {emoji}
        </button>
      ))}
      {/* "+" — full picker placeholder. */}
      <button
        type="button"
        aria-label="More emoji"
        onClick={() => { toast?.("Full emoji picker coming soon"); onClose(); }}
        style={{
          width: 36, height: 36,
          padding: 0,
          border: "none",
          background: "rgba(11,11,13,0.04)",
          cursor: "pointer",
          borderRadius: 999,
          color: "rgba(11,11,13,0.55)",
          fontSize: 16, fontWeight: 700,
        }}
      >+</button>
    </div>
  );
}

/* ─── Reaction chips (count display) ─────────────────────────────── */

export type ReactionChipsProps = {
  reactions: ReactionCount[];
  /** Caller wires the actual toggle write. */
  onToggle?: (emoji: string) => void;
  toast?: (text: string) => void;
};

export function ReactionChips({ reactions, onToggle, toast }: ReactionChipsProps) {
  if (reactions.length === 0) return null;
  return (
    <div style={{
      display: "inline-flex", flexWrap: "wrap", gap: 4,
      marginTop: 3,
    }}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-label={`${r.count} ${r.emoji} reaction${r.count === 1 ? "" : "s"}${r.mine ? " (you reacted)" : ""}`}
          onClick={() => {
            if (onToggle) onToggle(r.emoji);
            else toast?.(`Toggle ${r.emoji} reaction — engine wiring coming soon`);
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px",
            borderRadius: 999,
            border: `1px solid ${r.mine ? "rgba(15,79,62,0.30)" : "rgba(24,24,27,0.10)"}`,
            background: r.mine ? "rgba(15,79,62,0.08)" : "#fff",
            cursor: "pointer",
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 11.5,
            color: "#0B0B0D",
            minHeight: 24,
          }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{r.emoji}</span>
          <span style={{
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: r.mine ? "#0F4F3E" : "rgba(11,11,13,0.65)",
          }}>{r.count}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── React-trigger button ───────────────────────────────────────── */

/**
 * The small smiley-face button that lives next to a message bubble.
 * Click → opens the picker. Place inside the message's hover-actions
 * row or as a long-press trigger on mobile.
 */
export function ReactTriggerButton({
  onClick, ariaLabel = "Add reaction",
}: { onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 28, height: 28,
        padding: 0,
        border: "1px solid rgba(24,24,27,0.10)",
        background: "#fff",
        cursor: "pointer",
        borderRadius: 999,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "rgba(11,11,13,0.55)",
        boxShadow: "0 2px 8px rgba(11,11,13,0.06)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="5" cy="6" r="0.7" fill="currentColor"/>
        <circle cx="9" cy="6" r="0.7" fill="currentColor"/>
        <path d="M5 9c.5.5 1.2.8 2 .8s1.5-.3 2-.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

/* ─── Composed: picker + trigger inline ──────────────────────────── */

/**
 * Convenience wrapper that bundles trigger + picker for a single
 * message bubble. Caller still owns the open state if they want to
 * coordinate with other actions; otherwise pass nothing and we
 * manage internally.
 */
export function MessageReactionMenu({
  reactions = [],
  onReact, onToggle, toast,
  placement = "above",
}: {
  reactions?: ReactionCount[];
  onReact?: (emoji: string) => void;
  onToggle?: (emoji: string) => void;
  toast?: (text: string) => void;
  placement?: "above" | "below";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <ReactTriggerButton onClick={() => setOpen((v) => !v)} />
      <ReactionPicker
        open={open}
        placement={placement}
        onReact={onReact}
        onClose={() => setOpen(false)}
        toast={toast}
      />
      {reactions.length > 0 && (
        <ReactionChips reactions={reactions} onToggle={onToggle} toast={toast} />
      )}
    </div>
  );
}
