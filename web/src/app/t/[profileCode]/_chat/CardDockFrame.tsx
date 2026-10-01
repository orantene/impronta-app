"use client";

/**
 * CardDockFrame: the card skin's outer shell (see card-dock-skin.ts). It owns
 * only geometry, the token vars and the "Maison sheet opened" auto-hide; the
 * dock column inside it is the same one every other site mounts.
 */

import { useEffect, type CSSProperties, type ReactNode } from "react";

import { CARD_CHAT_CSS } from "./CardChatExtras";
import { cardFrameStyle, cardVars } from "./card-dock-skin";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

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

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      data-chat-variant="card"
      data-chat-expanded={expanded ? "true" : "false"}
      data-chat-compact={compact ? "true" : "false"}
      data-tl-motion=""
      style={{ ...cardVars(card, accent, accentInk), ...cardFrameStyle(compact, expanded, keyboardInsetPx) } as CSSProperties}
    >
      <style>{CARD_CHAT_CSS}</style>
      {children}
    </div>
  );
}
