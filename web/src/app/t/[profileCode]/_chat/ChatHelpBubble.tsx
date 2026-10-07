"use client";

import { useEffect, useRef, useState } from "react";

import { interpolate, type Translator } from "@/i18n/interpolate";

import {
  HELP_BUBBLE_VISIBLE_MS,
  helpBubbleBannerUp,
  findHelpBubbleAnchor,
  findHelpBubbleBarTops,
  helpBubbleBottom,
  otherHelpBubbleShown,
  helpBubbleBlocked,
  helpBubbleInitials,
  helpBubbleSessionKey,
  markHelpBubbleSeen,
  readHelpBubbleSeen,
  shouldShowHelpBubble,
} from "./help-bubble-logic";

type Placement = { side: "left" | "right"; offset: number; bottom: number };

/** Where to draw the bubble: just above the chat button, or null when none is on screen. Reads the DOM only. */
function locate(): Placement | null {
  const a = findHelpBubbleAnchor(document);
  if (!a) return null;
  const r = a.el.getBoundingClientRect();
  return {
    side: a.side,
    offset: a.side === "left" ? Math.max(8, r.left) : Math.max(8, window.innerWidth - r.right),
    bottom: helpBubbleBottom(window.innerHeight, r.top, findHelpBubbleBarTops(document)),
  };
}

/**
 * DK-3: the help bubble above the chat button. Once per visit, after the
 * visitor scrolls, a one-line pill with her photo (or initials) and "Can I help
 * you choose?" appears just above the chat button wherever it is: the dock's
 * chat icon (with or without a selection), the idle bar's, or the floating one.
 * Tapping it opens the chat; the dark x closes only the bubble. Either way it
 * does not come back this visit. It never shows while the chat or a sheet is
 * open, or when no chat button is on screen. One CSS entrance, off under
 * `prefers-reduced-motion`.
 */
export function ChatHelpBubble({
  profileCode,
  name,
  photoUrl,
  t,
  chatOpen,
  onOpenChat,
}: {
  profileCode: string;
  name: string;
  photoUrl: string | null;
  t: Translator;
  chatOpen: boolean;
  onOpenChat: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = helpBubbleBlocked({ chatOpen, sheetOpen });
  const blockedRef = useRef(blocked);
  const shownRef = useRef(false);

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
      if (shownRef.current) return;
      if (!shouldShowHelpBubble({ scrollY: window.scrollY, seen: readHelpBubbleSeen(storage, key), blocked: blockedRef.current })) return;
      if (helpBubbleBannerUp(document)) return; // a banner owns the bottom of the screen
      const at = locate();
      if (!at) return; // no chat button on screen: nothing to point at
      if (otherHelpBubbleShown(document, null)) return; // one bubble only
      shownRef.current = true;
      markHelpBubbleSeen(storage, key);
      setPlace(at);
      setVisible(true);
      hideTimer.current = setTimeout(() => setVisible(false), HELP_BUBBLE_VISIBLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [profileCode]);

  // Follow the chat button while the bubble is up; if it goes away, so does the bubble.
  useEffect(() => {
    if (!visible) return;
    const follow = () => {
      const at = locate();
      if (!at) setVisible(false);
      else setPlace(at);
    };
    window.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(follow) : null;
    mo?.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-show", "data-gone", "class", "style"] });
    return () => {
      window.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
      mo?.disconnect();
    };
  }, [visible]);

  if (!visible || blocked || !place) return null;

  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const style = place.side === "left" ? { left: place.offset, bottom: place.bottom } : { right: place.offset, bottom: place.bottom };

  return (
    <div className="tl-hello" role="status" data-help-bubble="" data-side={place.side} style={style}>
      <style>{HELP_BUBBLE_CSS}</style>
      <button
        type="button"
        className="tl-hello-b"
        aria-label={interpolate(t("public.guestChat.helpBubbleOpenAria"), { name })}
        onClick={() => {
          setVisible(false);
          onOpenChat();
        }}
      >
        <span className="tl-hello-av">
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant avatar URL, small
            <img src={photoUrl!} alt="" width={32} height={32} onError={() => setPhotoFailed(true)} />
          ) : (
            <span className="tl-hello-ini" data-help-initials="" aria-hidden>
              {helpBubbleInitials(name)}
            </span>
          )}
          <i aria-hidden />
        </span>
        <span aria-hidden>
          <b>{name}</b>
          {t("public.guestChat.helpBubbleTitle")}
        </span>
      </button>
      <button type="button" className="tl-hello-x" aria-label={t("public.guestChat.helpBubbleDismiss")} onClick={() => setVisible(false)}>
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}

/** A-17: rises in over .45 s with a soft overshoot. Tokens only; no literal colours. */
export const HELP_BUBBLE_CSS = `.tl-hello{position:fixed;z-index:97;display:flex;align-items:center;max-width:calc(100vw - 16px);background:var(--token-color-surface-raised,Canvas);color:var(--token-color-ink,CanvasText);border-radius:99px 99px 99px 10px;padding:7px 14px 7px 7px;box-shadow:0 16px 36px -16px color-mix(in srgb,var(--token-color-ink,CanvasText) 45%,transparent);animation:tl-hello-in .45s cubic-bezier(.2,1.3,.3,1);font-family:var(--site-body-font,inherit);white-space:nowrap}
.tl-hello::after{content:"";position:absolute;left:16px;bottom:-5px;width:11px;height:11px;background:inherit;transform:rotate(45deg);border-radius:2px}
.tl-hello[data-side="right"]{border-radius:99px 99px 10px 99px}
.tl-hello[data-side="right"]::after{left:auto;right:20px}
.tl-hello-b{display:flex;align-items:center;gap:8px;min-height:44px;border:0;background:none;padding:0;color:inherit;font:inherit;font-size:13px;line-height:1.2;text-align:left;white-space:nowrap;cursor:pointer}
.tl-hello-b b{display:block;font-style:italic;font-weight:600;font-size:11.5px;color:var(--token-color-accent-text,var(--token-color-accent,currentColor));font-family:var(--site-heading-font,serif)}
.tl-hello-av{position:relative;flex:0 0 auto;width:32px;height:32px}
.tl-hello-av img,.tl-hello-ini{width:32px;height:32px;border-radius:50%;display:block}
.tl-hello-av img{object-fit:cover;object-position:50% 25%}
.tl-hello-ini{display:grid;place-items:center;font-size:12px;font-weight:600;letter-spacing:.02em;background:color-mix(in srgb,var(--token-color-accent,currentColor) 16%,transparent);color:var(--token-color-accent-text,var(--token-color-ink,currentColor))}
.tl-hello-av i{position:absolute;right:-1px;bottom:0;width:9px;height:9px;border-radius:50%;background:var(--token-color-success,currentColor);box-shadow:0 0 0 2px var(--token-color-surface-raised,Canvas)}
.tl-hello-x{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border:0;border-radius:50%;background:var(--token-color-ink,CanvasText);color:var(--token-color-background,Canvas);font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer;padding:0}
.tl-hello-x::before{content:"";position:absolute;inset:-11px}
.tl-hello-b:focus-visible,.tl-hello-x:focus-visible{outline:2px solid var(--token-color-accent-text,currentColor);outline-offset:2px}
@keyframes tl-hello-in{from{opacity:0;transform:translateY(10px) scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.tl-hello{animation:none}}`;
