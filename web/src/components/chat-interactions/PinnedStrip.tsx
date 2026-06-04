"use client";

/**
 * PinnedStrip — compact "Pinned" header strip listing the inquiry-wide
 * pinned messages. Everyone on the thread sees the same set. Each row is
 * click-to-scroll (onJump) and carries an unpin affordance (onUnpin).
 *
 * Renders nothing when there are no pins, so it can sit unconditionally in
 * a thread's fixed top region.
 *
 * Presentational only — the host owns the pin list (loaded via
 * loadPinnedMessages) and the toggle action. Accent-themed so it can match
 * each shell (client blue / SPA tokens / warm default).
 */

import { useState } from "react";
import type { PinnedMessage } from "@/lib/messages/pin-types";

type Palette = {
  /** Strong accent for the pin glyph + label. */
  accent: string;
  /** Very soft accent tint for the strip background. */
  accentSoft: string;
  /** Primary ink for the preview body. */
  ink: string;
  /** Muted ink for the sender / meta. */
  inkMuted: string;
  /** Hairline border color. */
  border: string;
  /** Surface the rows sit on (usually white). */
  surface: string;
};

const DEFAULT_PALETTE: Palette = {
  accent: "#7A5BD6",
  accentSoft: "rgba(122,91,214,0.08)",
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border: "rgba(11,11,13,0.10)",
  surface: "#fff",
};

const FONT = '"Inter", system-ui, sans-serif';

function truncate(s: string, max = 90): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function PinnedStrip({
  pins,
  onJump,
  onUnpin,
  palette,
  /** When set, unpin is hidden (e.g. read-only POV). Default = false. */
  readOnly = false,
}: {
  pins: PinnedMessage[];
  onJump: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  palette?: Partial<Palette>;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const C = { ...DEFAULT_PALETTE, ...palette };

  if (!pins || pins.length === 0) return null;

  const shown = expanded ? pins : pins.slice(0, 2);
  const hiddenCount = pins.length - shown.length;

  return (
    <div
      style={{
        background: C.accentSoft,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "7px 9px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill={C.accent} stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
          <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
          <line x1="12" y1="15" x2="12" y2="21" />
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.accent, letterSpacing: 0.3, textTransform: "uppercase" }}>
          Pinned{pins.length > 1 ? ` · ${pins.length}` : ""}
        </span>
      </div>
      {shown.map((p) => (
        <div
          key={p.messageId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "5px 7px",
          }}
        >
          <button
            type="button"
            onClick={() => onJump(p.messageId)}
            title="Jump to message"
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              fontFamily: FONT,
            }}
          >
            <span style={{ fontSize: 11.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {truncate(p.body) || "(no text)"}
            </span>
            <span style={{ fontSize: 10, color: C.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.senderName ?? "Unknown"}
              {p.pinnedByName ? ` · pinned by ${p.pinnedByName}` : ""}
            </span>
          </button>
          {!readOnly && onUnpin && (
            <button
              type="button"
              onClick={() => onUnpin(p.messageId)}
              aria-label="Unpin this message"
              title="Unpin"
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: C.inkMuted,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {(hiddenCount > 0 || expanded) && pins.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "1px 2px",
            fontFamily: FONT,
            fontSize: 10.5,
            fontWeight: 600,
            color: C.accent,
          }}
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
