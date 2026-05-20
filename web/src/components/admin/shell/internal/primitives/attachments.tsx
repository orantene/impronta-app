"use client";

// ─── Attachment primitives ───────────────────────────────────────────
//
// Attachment / AttachmentKind / InlineFilePreview / AttachmentStrip.
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useState, type ReactNode } from "react";
import { COLORS, FONTS } from "../state";

export type AttachmentKind = "image" | "pdf" | "video" | "audio" | "file";

export type Attachment = {
  id:       string;
  name:     string;
  kind:     AttachmentKind;
  size:     string;
  thumbUrl?: string;
  /** Prototype: always undefined; real implementation loads actual URL */
  previewUrl?: string;
};

const ATTACHMENT_ICON: Record<AttachmentKind, string> = {
  image: "🖼",
  pdf:   "📄",
  video: "🎬",
  audio: "🎵",
  file:  "📎",
};

export function InlineFilePreview({
  attachment,
  onDownload,
}: {
  attachment:  Attachment;
  onDownload?: (a: Attachment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPreviewable = attachment.kind === "image" || attachment.kind === "pdf";

  return (
    <div style={{ border:       `1px solid ${COLORS.border}`, overflow:     "hidden", display:      "inline-flex", flexDirection: "column", maxWidth:     260, fontFamily:   FONTS.body }} className="rounded-admin-lg bg-admin-surface-alt">
      {/* Image preview placeholder */}
      {expanded && attachment.kind === "image" && (
        <div style={{
          width: "100%", height: 160,
          background: "linear-gradient(135deg, #E0E7FF 0%, #F0FDF4 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40,
        }}>
          {ATTACHMENT_ICON.image}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{ATTACHMENT_ICON[attachment.kind]}</span>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
            {attachment.name}
          </div>
          <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{attachment.size}</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {isPreviewable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse preview" : "Expand preview"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13, padding: "2px 4px",
              }}
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={() => onDownload(attachment)}
              aria-label={`Download ${attachment.name}`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13, padding: "2px 4px",
              }}
            >
              ↓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders a horizontal strip of up to N attachments in a message */
export function AttachmentStrip({
  attachments,
  onDownload,
}: {
  attachments: Attachment[];
  onDownload?: (a: Attachment) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {attachments.map((a) => (
        <InlineFilePreview key={a.id} attachment={a} onDownload={onDownload} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-12.11  Reduced-motion hook (site-wide)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the user has requested reduced motion.
 * Use to guard any `animation:` or `transition:` inline style.
 *
 * Usage:
 *   const prefersReducedMotion = useReducedMotion();
 *   style={{ transition: prefersReducedMotion ? "none" : "opacity .2s" }}
 */
