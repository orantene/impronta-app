"use client";

/**
 * StarButton — inline ⭐ toggle on a message bubble. Personal bookmark;
 * only visible to the user who set it. Companion to the reactions row.
 *
 * Optimistic — flips the icon immediately and reconciles when the
 * server action returns. On failure, snaps back and shows a toast via
 * the parent's onError callback.
 */

import { useState, useTransition } from "react";
import { toggleMessageStar } from "@/lib/server-actions/message-stars";

type Props = {
  messageId: string;
  inquiryId: string;
  /** Initial starred state (loader-provided). */
  starred: boolean;
  /** Compact mode — 18px star without label. Default = with text. */
  compact?: boolean;
  onError?: (msg: string) => void;
};

export function StarButton({
  messageId,
  inquiryId,
  starred: initialStarred,
  compact = true,
  onError,
}: Props) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    // Optimistic flip
    const prev = starred;
    setStarred(!prev);
    startTransition(async () => {
      const result = await toggleMessageStar(messageId, inquiryId);
      if (!result.ok) {
        setStarred(prev);
        onError?.(result.error);
        return;
      }
      // Reconcile with authoritative state from server.
      setStarred(result.starred);
    });
  };

  const size = compact ? 16 : 18;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={starred}
      aria-label={starred ? "Remove star" : "Star this message"}
      title={starred ? "Starred — only you can see this" : "Star this message"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "2px 4px" : "3px 8px",
        background: starred ? "rgba(207,160,42,0.10)" : "transparent",
        border: `1px solid ${starred ? "rgba(207,160,42,0.30)" : "transparent"}`,
        borderRadius: 999,
        cursor: pending ? "wait" : "pointer",
        color: starred ? "#8A6F1A" : "rgba(11,11,13,0.45)",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: '"Inter", system-ui, sans-serif',
        opacity: pending ? 0.6 : 1,
        transition: "background 120ms, color 120ms, opacity 120ms",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        if (!starred) (e.currentTarget as HTMLButtonElement).style.background = "rgba(11,11,13,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!starred) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={starred ? "#CFA02A" : "none"}
        stroke={starred ? "#CFA02A" : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      {!compact && (starred ? "Starred" : "Star")}
    </button>
  );
}
