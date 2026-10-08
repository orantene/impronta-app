"use client";

/**
 * AUD-044 — "Asking about <names>" context card + three quick questions.
 *
 * Shown in the guest dock when the catalog selection dock's Ask button handed
 * the selection over (pending offering carries `askAbout`). Chips FILL the
 * composer; they never auto-send.
 */

import type { Translator } from "@/i18n/interpolate";

import { FONT, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export const ASK_QUICK_KEYS = [
  "public.guestChat.askQuickWhen",
  "public.guestChat.askQuickDuration",
  "public.guestChat.askQuickChange",
] as const;

export function GuestAskAboutCard({
  titles,
  imageUrl,
  t,
  accent,
  surfaceMode,
  onPick,
  onClear,
}: {
  titles: string[];
  imageUrl: string | null;
  t: Translator;
  accent: string;
  surfaceMode?: SurfaceMode;
  onPick: (question: string) => void;
  onClear?: () => void;
}) {
  const C = paletteFor(surfaceMode);
  return (
    <div
      data-hablar-ask-about
      style={{ padding: "8px 12px 0", background: C.surface, fontFamily: FONT, flexShrink: 0 }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: C.surface,
          border: `1px solid ${accent}40`,
          borderRadius: 16,
          padding: 8,
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
          />
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <small
            style={{
              display: "block",
              color: accent,
              fontSize: 10.5,
              letterSpacing: "0.1em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            {t("public.guestChat.askAboutEyebrow")}
          </small>
          <b
            style={{
              display: "block",
              fontSize: 14,
              color: C.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {titles.join(" + ")}
          </b>
        </div>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("public.guestChat.clearService")}
            style={{
              border: 0,
              background: "transparent",
              color: C.inkMuted,
              cursor: "pointer",
              width: 32,
              height: 32,
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
      <div
        role="group"
        aria-label={t("public.guestChat.askQuickLabel")}
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
      >
        {ASK_QUICK_KEYS.map((k) => {
          const q = t(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(q)}
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                padding: "7px 12px",
                fontSize: 12.5,
                color: C.ink,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              {q}
            </button>
          );
        })}
      </div>
    </div>
  );
}
