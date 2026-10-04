"use client";

/**
 * CardDockFrame: the card skin's outer shell (see card-dock-skin.ts). It owns
 * only geometry, the token vars and the "Maison sheet opened" auto-hide; the
 * dock column inside it is the same one every other site mounts.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { CARD_CHAT_CSS } from "./CardChatExtras";
import { cardFrameStyle, cardVars } from "./card-dock-skin";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

/** Long enough for the click that caused the blur to finish before the layout moves. */
export const TYPING_SETTLE_MS = 400;

export function CardDockFrame({
  card,
  accent,
  accentInk,
  compact,
  expanded,
  keyboardInsetPx,
  ariaLabel,
  onClose,
  children,
}: {
  card: ChatCardConfig;
  accent: string;
  accentInk: string;
  compact: boolean;
  expanded: boolean;
  keyboardInsetPx: number;
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // The booking sheet opening (an Add that needs options) hides the chat.
  useEffect(() => {
    const onSheet = (e: Event) => {
      if ((e as CustomEvent<{ open?: boolean }>).detail?.open === true) onClose();
    };
    window.addEventListener("tulala:maison-sheet", onSheet);
    return () => window.removeEventListener("tulala:maison-sheet", onSheet);
  }, [onClose]);

  // Esc already closes (the panel listens on window); on close, focus goes back to
  // whatever opened the chat (the launcher or the dock's chat button).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  // Phone sheet: about 85% tall with the site visible above; full height only
  // while she is typing (focus inside an input), back down on blur.
  const [typing, setTyping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !compact) return;
    const isField = (t: EventTarget | null) => ["TEXTAREA", "INPUT"].includes((t as HTMLElement | null)?.tagName ?? "");
    // The sheet must NOT resize the instant the field blurs: a tap on Send or on the gate's
    // button blurs the field on pointerdown, the sheet shrinks, the button slides away and the
    // first tap is lost (e2e P1). Shrink back only if no field takes focus again within a beat.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      if (!isField(e.target)) return;
      clearTimeout(settle);
      setTyping(true);
    };
    const off = (e: Event) => {
      if (!isField(e.target)) return;
      clearTimeout(settle);
      settle = setTimeout(() => setTyping(false), TYPING_SETTLE_MS);
    };
    el.addEventListener("focusin", on);
    el.addEventListener("focusout", off);
    return () => {
      clearTimeout(settle);
      el.removeEventListener("focusin", on);
      el.removeEventListener("focusout", off);
    };
  }, [compact]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      data-chat-variant="card"
      data-chat-expanded={expanded ? "true" : "false"}
      data-chat-compact={compact ? "true" : "false"}
      data-tl-motion=""
      style={{ ...cardVars(card, accent, accentInk), ...cardFrameStyle(compact, expanded || typing, keyboardInsetPx) } as CSSProperties}
    >
      <style>{CARD_CHAT_CSS}</style>
      {compact && !expanded && !typing ? (
        <span aria-hidden data-card-dock-handle="" style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 999, margin: "8px 0 0", background: "var(--cc-line)", flex: "0 0 auto" }} />
      ) : null}
      {children}
    </div>
  );
}
