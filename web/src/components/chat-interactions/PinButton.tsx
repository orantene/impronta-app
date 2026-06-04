"use client";

/**
 * PinButton — inline pin toggle on a message bubble. Unlike StarButton
 * (a private per-user bookmark), a pin is INQUIRY-WIDE: everyone on the
 * thread sees the same pinned messages. A pinned message surfaces in the
 * "Pinned" strip at the top of the thread.
 *
 * Optimistic — flips the icon immediately and reconciles when the server
 * action returns. On failure, snaps back and reports via onError. After a
 * successful toggle it calls onChanged(pinned) so the host can refresh the
 * shared pinned strip.
 */

import { useState, useTransition } from "react";
import { toggleMessagePin } from "@/lib/server-actions/message-pins";

type Props = {
  messageId: string;
  inquiryId: string;
  /** Initial pinned state (host-provided from the shared pin set). */
  pinned: boolean;
  /** Compact mode — 16px icon without label. Default = true. */
  compact?: boolean;
  /** Accent color for the active (pinned) state. Defaults to a warm pin tone;
   *  pass the shell accent (e.g. client blue) to match the surface. */
  accent?: string;
  onError?: (msg: string) => void;
  /** Called after a successful toggle with the new shared state. */
  onChanged?: (pinned: boolean) => void;
};

export function PinButton({
  messageId,
  inquiryId,
  pinned: initialPinned,
  compact = true,
  accent = "#7A5BD6",
  onError,
  onChanged,
}: Props) {
  const [pinned, setPinned] = useState(initialPinned);
  const [busy, startTransition] = useTransition();

  const toggle = () => {
    const prev = pinned;
    setPinned(!prev);
    startTransition(async () => {
      const result = await toggleMessagePin(messageId, inquiryId);
      if (!result.ok) {
        setPinned(prev);
        onError?.(result.error);
        return;
      }
      setPinned(result.pinned);
      onChanged?.(result.pinned);
    });
  };

  const size = compact ? 16 : 18;
  const activeBg = `${accent}1A`; // ~10% alpha
  const activeBorder = `${accent}4D`; // ~30% alpha

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin this message" : "Pin this message"}
      title={pinned ? "Pinned for everyone — tap to unpin" : "Pin this message for everyone"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "2px 4px" : "3px 8px",
        background: pinned ? activeBg : "transparent",
        border: `1px solid ${pinned ? activeBorder : "transparent"}`,
        borderRadius: 999,
        cursor: busy ? "wait" : "pointer",
        color: pinned ? accent : "rgba(11,11,13,0.45)",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: '"Inter", system-ui, sans-serif',
        opacity: busy ? 0.6 : 1,
        transition: "background 120ms, color 120ms, opacity 120ms",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        if (!pinned) (e.currentTarget as HTMLButtonElement).style.background = "rgba(11,11,13,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!pinned) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={pinned ? accent : "none"}
        stroke={pinned ? accent : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {/* Classic pushpin silhouette */}
        <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
        <line x1="12" y1="15" x2="12" y2="21" />
      </svg>
      {!compact && (pinned ? "Pinned" : "Pin")}
    </button>
  );
}
