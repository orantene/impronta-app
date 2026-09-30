"use client";

import { useEffect, useRef, useState } from "react";

import type { Translator } from "@/i18n/interpolate";

import {
  HELP_BUBBLE_VISIBLE_MS,
  helpBubbleBlocked,
  helpBubbleSessionKey,
  markHelpBubbleSeen,
  readHelpBubbleSeen,
  shouldShowHelpBubble,
} from "./help-bubble-logic";

/**
 * DK-3: the help bubble above the chat button. Once per visit (session flag),
 * after the visitor scrolls, a one-line pill with her photo and "Can I help you
 * choose?" appears, opens the chat when tapped, and hides after 9 seconds. The
 * small x dismisses it. It never shows while the chat or the booking sheet is
 * open, or while the catalog dock covers the chat button. The launcher only
 * mounts when chat is on and inquiries are open, so a paused site never shows
 * it. Motion is one CSS entrance, switched off by `prefers-reduced-motion`.
 */
export function ChatHelpBubble({
  profileCode,
  name,
  photoUrl,
  t,
  chatOpen,
  dockUp,
  onOpenChat,
}: {
  profileCode: string;
  name: string;
  photoUrl: string | null;
  t: Translator;
  chatOpen: boolean;
  /** The catalog dock is up and has taken over the chat button. */
  dockUp: boolean;
  onOpenChat: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = helpBubbleBlocked({ chatOpen, sheetOpen, dockUp });
  const blockedRef = useRef(blocked);

  useEffect(() => {
    blockedRef.current = blocked;
    if (blocked) setVisible(false);
  }, [blocked]);

  useEffect(() => {
    const onSheet = (e: Event) => setSheetOpen((e as CustomEvent<{ open?: boolean }>).detail?.open === true);
    window.addEventListener("tulala:maison-sheet", onSheet);
    return () => window.removeEventListener("tulala:maison-sheet", onSheet);
  }, []);

  useEffect(() => {
    const key = helpBubbleSessionKey(profileCode);
    const storage = (() => {
      try {
        return window.sessionStorage;
      } catch {
        return null;
      }
    })();
    const onScroll = () => {
      if (!shouldShowHelpBubble({ scrollY: window.scrollY, seen: readHelpBubbleSeen(storage, key), blocked: blockedRef.current })) return;
      markHelpBubbleSeen(storage, key);
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), HELP_BUBBLE_VISIBLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [profileCode]);

  if (!visible || blocked) return null;

  return (
    <div className="tl-hello" role="status" data-help-bubble="">
      <style>{HELP_BUBBLE_CSS}</style>
      <button
        type="button"
        className="tl-hello-b"
        onClick={() => {
          setVisible(false);
          onOpenChat();
        }}
      >
        <span className="tl-hello-av">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant avatar URL, small
            <img src={photoUrl} alt="" width={32} height={32} />
          ) : null}
          <i aria-hidden />
        </span>
        <span>
          <b>{name}</b>
          {t("public.guestChat.helpBubbleTitle")}
        </span>
      </button>
      <button type="button" className="tl-hello-x" aria-label={t("public.guestChat.helpBubbleDismiss")} onClick={() => setVisible(false)}>
        ×
      </button>
    </div>
  );
}

/** A-17: rises in over .45 s with a soft overshoot. Tokens only; no literal colours. */
export const HELP_BUBBLE_CSS = `.tl-hello{position:relative;align-self:flex-end;margin:0 4px 12px 0;display:flex;align-items:center;background:var(--token-color-surface-raised,Canvas);color:var(--token-color-ink,CanvasText);border-radius:99px 99px 99px 10px;padding:7px 14px 7px 7px;box-shadow:0 16px 36px -16px color-mix(in srgb,var(--token-color-ink,CanvasText) 45%,transparent);animation:tl-hello-in .45s cubic-bezier(.2,1.3,.3,1);font-family:var(--site-body-font,inherit)}
.tl-hello::after{content:"";position:absolute;right:22px;bottom:-5px;width:11px;height:11px;background:inherit;transform:rotate(45deg);border-radius:2px}
.tl-hello-b{display:flex;align-items:center;gap:8px;border:0;background:none;padding:0;color:inherit;font:inherit;font-size:13px;line-height:1.2;text-align:left;white-space:nowrap;cursor:pointer}
.tl-hello-b b{display:block;font-style:italic;font-weight:600;font-size:11.5px;color:var(--tl-fab-accent,var(--token-color-accent,currentColor));font-family:var(--site-heading-font,inherit)}
.tl-hello-av{position:relative;flex:0 0 auto;width:32px;height:32px}
.tl-hello-av img{width:32px;height:32px;border-radius:50%;object-fit:cover;object-position:50% 25%;display:block}
.tl-hello-av i{position:absolute;right:-1px;bottom:0;width:9px;height:9px;border-radius:50%;background:var(--token-color-success,currentColor);box-shadow:0 0 0 2px var(--token-color-surface-raised,Canvas)}
.tl-hello-x{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border:0;border-radius:50%;background:var(--token-color-ink,CanvasText);color:var(--token-color-background,Canvas);font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer}
.tl-hello-b:focus-visible,.tl-hello-x:focus-visible{outline:2px solid var(--tl-fab-accent,currentColor);outline-offset:2px}
@keyframes tl-hello-in{from{opacity:0;transform:translateY(10px) scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.tl-hello{animation:none}}`;
