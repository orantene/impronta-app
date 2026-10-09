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

import { composerKeyAction } from "./composer-key-action";
import { FONT, paletteFor, primaryBtnStyle, type SurfaceMode } from "./mini-chat-styles";
import { SendIcon } from "./MiniChatMessageBubble";
import a11y from "./mini-chat-a11y.module.css";
import composerCss from "./guest-composer.module.css";

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
  /** Nail Studio / Save look preview stashed for upload on send. */
  lookPreviewUrl?: string | null;
  onClearLookPreview?: () => void;
  lookPreviewLabel?: string;
  lookPreviewRemoveLabel?: string;
  /** Accessible name of the send button, in the guest's language. */
  sendLabel?: string;
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
  lookPreviewUrl = null,
  onClearLookPreview,
  lookPreviewLabel = "Your look",
  lookPreviewRemoveLabel = "Remove look",
  sendLabel = "Send message",
}: MiniChatComposerProps) {
  const C = paletteFor(surfaceMode);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px 12px",
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surface,
      }}
    >
      {lookPreviewUrl ? (
        <div
          data-guest-look-preview=""
          style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FONT }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a remote asset */}
          <img
            src={lookPreviewUrl}
            alt={lookPreviewLabel}
            width={48}
            height={48}
            style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flex: "0 0 auto" }}
          />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.ink }}>{lookPreviewLabel}</span>
          {onClearLookPreview ? (
            <button
              type="button"
              onClick={onClearLookPreview}
              aria-label={lookPreviewRemoveLabel}
              style={{
                border: `1px solid ${C.borderSoft}`,
                background: C.surfaceFaint,
                color: C.inkDim,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: FONT,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
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
          // nativeEvent carries isComposing (IME); React's KeyboardEvent type does not.
          if (composerKeyAction(e.nativeEvent) === "submit") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        disabled={sending || inCooldown}
        className={`${a11y.focusRing} ${composerCss.composerInput}`}
        style={{
          flex: 1,
          minWidth: 0,
          // DoR F02/F04/F08 pill input: min-height 42, radius 21.
          minHeight: 42,
          maxHeight: 132,
          padding: "11px 16px",
          borderRadius: 21,
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
        aria-label={sendLabel}
        data-send-state={sendDisabled ? "disabled" : "ready"}
        style={{
          ...primaryBtnStyle(accent, accentInk),
          // Front-door brief `.send`: round solid control, 42px (DoR F02/F04/F08).
          height: 42,
          width: 42,
          flexShrink: 0,
          padding: 0,
          borderRadius: "50%",
          // AUD-040b: empty reads as intentionally disabled (neutral grey), not a
          // washed-out brand pink; with text it is the solid brand fill.
          ...(sendDisabled
            ? { background: C.surfaceCool, color: C.inkDim, border: "none", boxShadow: "none" }
            : null),
          opacity: 1,
          cursor: sendDisabled ? "not-allowed" : "pointer",
        }}
      >
        {sending ? "…" : <SendIcon color={sendDisabled ? C.inkDim : accentInk} />}
      </button>
    </div>
    </div>
  );
}
