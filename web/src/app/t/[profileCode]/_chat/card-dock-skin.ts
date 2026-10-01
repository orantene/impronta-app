/**
 * card-dock-skin: the chat card's skin for the ONE guest dock.
 *
 * `chat.variant = card` no longer renders a second chat. The dock column draws
 * its normal tabs, rail and views; this file supplies the card frame (white
 * rounded card, floating on desktop, bottom sheet on phones, full screen when
 * expanded) and the `--cc-*` vars every dock surface reads through
 * `paletteFor("card")`. Colours come from the site's theme tokens
 * (ChatCardConfig), then the page's `--token-color-*` vars, then the chat
 * palette. No literal colours live here.
 */

import type { CSSProperties } from "react";

import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

import { C, FONT } from "./mini-chat-styles";

/**
 * An OPAQUE surface: the token layer on top of the chat palette's solid white.
 * A missing or translucent token can never let the page show through the chat.
 */
export const CARD_SOLID_BG = `linear-gradient(var(--cc-surface), var(--cc-surface)), ${C.surface}`;

/** Theme value, then page token var, then chat palette. */
function tone(value: string | null, tokenVar: string, fallback: string): string {
  return value ?? `var(${tokenVar}, ${fallback})`;
}

export function cardVars(card: ChatCardConfig, accent: string, accentInk: string): Record<string, string> {
  const c = card.colors;
  return {
    "--cc-bg": tone(c.background, "--token-color-background", C.surfaceFaint),
    "--cc-surface": tone(c.surface, "--token-color-surface-raised", C.surface),
    "--cc-ink": tone(c.ink, "--token-color-ink", C.ink),
    "--cc-muted": tone(c.muted, "--token-color-muted", C.inkMuted),
    "--cc-line": tone(c.line, "--token-color-line", C.borderSoft),
    "--cc-accent": c.accent ?? accent,
    "--cc-on": c.onAccent ?? accentInk,
    "--cc-font": card.bodyFont ?? `var(--site-body-font, ${FONT})`,
  };
}

export function cardFrameStyle(compact: boolean, expanded: boolean, keyboardInsetPx: number): CSSProperties {
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 96,
    display: "flex",
    flexDirection: "column",
    background: CARD_SOLID_BG,
    color: "var(--cc-ink)",
    fontFamily: "var(--cc-font)",
    overflow: "hidden",
  };
  const lift = keyboardInsetPx > 0 ? keyboardInsetPx : 0;
  if (compact && expanded) {
    return { ...base, inset: 0, bottom: lift, paddingBottom: "env(safe-area-inset-bottom)" };
  }
  if (compact) {
    // Phone: a bottom sheet that leaves the page peeking above it.
    return {
      ...base,
      left: 0,
      right: 0,
      bottom: lift,
      height: "min(85dvh, 720px)",
      borderRadius: "24px 24px 0 0",
      borderTop: "1px solid var(--cc-line)",
      paddingBottom: "env(safe-area-inset-bottom)",
      boxShadow: "0 -20px 50px -24px color-mix(in srgb, var(--cc-ink) 45%, transparent)",
    };
  }
  return {
    ...base,
    right: expanded ? 16 : 24,
    bottom: expanded ? 16 : 24,
    width: expanded ? "min(560px, calc(100vw - 32px))" : "min(400px, calc(100vw - 32px))",
    height: expanded ? "calc(100dvh - 32px)" : "min(640px, calc(100dvh - 48px))",
    borderRadius: 24,
    border: "1px solid var(--cc-line)",
    boxShadow: "0 30px 70px -30px color-mix(in srgb, var(--cc-ink) 50%, transparent)",
  };
}
