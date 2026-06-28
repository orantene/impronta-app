"use client";

/**
 * MiniChatComposer — the message composer (honeypot + textarea + send button)
 * extracted out of MiniChatPanel to keep that file under the 800-line cap. It is
 * presentational: the panel owns draft/honeypot state and the submit handler.
 *
 * Anti-abuse: the honeypot input is hidden + off-screen + aria-hidden; bots fill
 * it and the server rejects. House rule: the only warm color is the tenant accent
 * (the send button); readableOn keeps the icon legible on any accent.
 */

import type { RefObject } from "react";

import { FONT, paletteFor, primaryBtnStyle, type SurfaceMode } from "./mini-chat-styles";
import { SendIcon } from "./MiniChatMessageBubble";
import a11y from "./mini-chat-a11y.module.css";

export type MiniChatComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  honeypot: string;
  onHoneypotChange: (value: string) => void;
  /** Submit the current draft (the panel's submit()). */
  onSubmit: () => void;
  /** Placeholder copy — "Write a reply…" in a thread, "Type your message…" before. */
  placeholder: string;
  sending: boolean;
  inCooldown: boolean;
  /** True when the send button is disabled (empty draft / sending / cooldown). */
  sendDisabled: boolean;
  accent: string;
  accentInk: string;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  /** Focus target owned by the panel (focused when the panel opens). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function MiniChatComposer({
  draft,
  onDraftChange,
  honeypot,
  onHoneypotChange,
  onSubmit,
  placeholder,
  sending,
  inCooldown,
  sendDisabled,
  accent,
  accentInk,
  surfaceMode = "light",
  textareaRef,
}: MiniChatComposerProps) {
  const C = paletteFor(surfaceMode);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: "10px 12px 12px",
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surface,
      }}
    >
      {/* Honeypot — hidden, off-screen, aria-hidden. Bots fill it; we reject. */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => onHoneypotChange(e.target.value)}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          border: 0,
        }}
      />
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        disabled={sending || inCooldown}
        className={a11y.focusRing}
        style={{
          flex: 1,
          minHeight: 40,
          maxHeight: 132,
          padding: "10px 12px",
          borderRadius: 12,
          border: `1px solid ${C.borderSoft}`,
          background: C.surfaceFaint,
          fontFamily: FONT,
          fontSize: 13.5,
          lineHeight: 1.45,
          color: C.ink,
          resize: "none",
          // Mouse focus shows no ring (outline:none); the .focusRing module re-adds
          // a 2px accent ring for KEYBOARD focus only (:focus-visible). The accent
          // is handed to CSS via the custom property below.
          outline: "none",
          ["--chat-focus-accent" as string]: accent,
          boxSizing: "border-box",
        }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={sendDisabled}
        aria-label="Send message"
        style={{
          ...primaryBtnStyle(accent, accentInk),
          height: 40,
          width: 46,
          padding: 0,
          opacity: sendDisabled ? 0.45 : 1,
          cursor: sendDisabled ? "not-allowed" : "pointer",
        }}
      >
        {sending ? "…" : <SendIcon color={accentInk} />}
      </button>
    </div>
  );
}
