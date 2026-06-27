"use client";

/**
 * MiniChatMessageBubble — a single rendered row in the guest-chat popup stream
 * (Lane D). Split out of MiniChatPanel.tsx to keep that file under the
 * max-lines cap. Renders by `authorRole` / `authorLabel` only — it never
 * recomputes authorship from raw ids (the server resolves that per contract).
 */

import type { GuestThreadMessage } from "@/lib/inquiry/guest-chat-contract";
import { createTranslator } from "@/i18n/messages";

import {
  accentText,
  formatTime,
  labelForKind,
  paletteFor,
  readableOn,
  type SurfaceMode,
} from "./mini-chat-styles";

/**
 * A row in the visible stream — either a server/persisted message or a local
 * optimistic placeholder keyed on a tmp- id (reconciled by created order).
 */
export type StreamRow = GuestThreadMessage & { pending?: boolean; failed?: boolean };

export function MiniChatMessageBubble({
  m,
  accent,
  locale = "en",
  surfaceMode = "light",
}: {
  m: StreamRow;
  accent: string;
  /** Guest UI locale (tenant default_locale). Falls back to "en". */
  locale?: string;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
}) {
  const t = createTranslator(locale);
  const C = paletteFor(surfaceMode);
  const mine = m.authorRole === "guest";
  const system = m.authorRole === "system";

  if (system) {
    return (
      <div
        style={{
          alignSelf: "center",
          textAlign: "center",
          maxWidth: "92%",
          fontSize: 11.5,
          color: C.systemInk,
          background: C.surfaceFaint,
          borderRadius: 10,
          padding: "7px 11px",
          lineHeight: 1.45,
        }}
      >
        {m.isDeleted ? t("public.guestChat.messageRemoved") : m.body}
      </div>
    );
  }

  // Non-text kinds (offer/payment cards) get a generic labelled fallback for
  // the MVP popup — full ChatCard rendering is a fast-follow per the contract.
  const isCard = m.kind !== "text";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        gap: 2,
      }}
    >
      {!mine && m.authorLabel && (
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: C.inkMuted,
            letterSpacing: 0.2,
            paddingLeft: 3,
          }}
        >
          {m.authorLabel}
        </div>
      )}
      <div
        style={{
          maxWidth: "82%",
          padding: isCard ? "11px 13px" : "9px 13px",
          borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          // The guest's own bubble follows the tenant accent (brand color), not
          // a hard-coded near-black fill — house rule: no black on small
          // components. `accent` already resolves to the cool DEFAULT_ACCENT
          // when the tenant has no brand color.
          background: isCard ? C.surfaceFaint : mine ? accent : C.surfaceCool,
          color: mine && !isCard ? readableOn(accent) : C.ink,
          border: isCard ? `1px solid ${C.borderSoft}` : "none",
          fontSize: 13.5,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          opacity: m.pending ? 0.6 : 1,
        }}
      >
        {isCard ? (
          <span>
            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                // AA-clamp the accent label against the card's own faint surface
                // (works on both light + dark surface modes).
                color: accentText(accent, C.surfaceFaint),
                marginBottom: 3,
              }}
            >
              {labelForKind(m.kind, t)}
            </span>
            <br />
            {m.body || t("public.guestChat.openFullToView")}
          </span>
        ) : m.isDeleted ? (
          <em style={{ color: C.inkDim }}>{t("public.guestChat.messageRemoved")}</em>
        ) : (
          m.body
        )}
      </div>
      <div
        style={{
          fontSize: 9.5,
          color: m.failed ? C.danger : C.inkDim,
          paddingRight: mine ? 3 : 0,
          paddingLeft: mine ? 0 : 3,
        }}
      >
        {m.failed
          ? t("public.guestChat.notSent")
          : m.pending
            ? t("public.guestChat.sendingShort")
            : formatTime(m.createdAt)}
      </div>
    </div>
  );
}

export function SendIcon({ color }: { color: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
