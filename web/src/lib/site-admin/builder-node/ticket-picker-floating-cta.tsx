"use client";

/**
 * ticket_picker v3: the floating "Buy tickets" pill (CRO ruling: the page
 * always shows one clear way to buy). Fixed bottom-centre on a phone, bottom-
 * right on desktop. It appears once the hero's own call to action has
 * scrolled away (an IntersectionObserver on a `[data-hero-cta]` marker; with
 * no marker, 480px of scroll) and hides while the tickets section itself is
 * on screen or a checkout is open, so it never doubles a control the guest
 * can already see. When the guest-chat launcher is on the page it steps left
 * (`data-yield-chat`), and on a phone it sits above the launcher's z-index.
 */

import { useEffect, useState, type RefObject } from "react";

const SCROLL_FALLBACK_PX = 480;

/**
 * The hero's own call to action: an explicit `[data-hero-cta]` marker, else
 * the first link on the page that points at this section's anchor
 * (`href="…#entradas"`) from outside it, which is what a launch page's hero
 * button is. Null when neither exists; the scroll fallback takes over.
 */
function findHeroCta(section: HTMLElement | null): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>("[data-hero-cta]");
  if (marked) return marked;
  const anchor = section?.closest<HTMLElement>("[id]")?.id;
  if (!anchor) return null;
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (!a.getAttribute("href")?.endsWith(`#${anchor}`)) continue;
    if (section?.contains(a)) continue;
    return a;
  }
  return null;
}

export function FloatingCta({
  label, sectionRef, enabled, suppressed, onTap,
}: {
  label: string;
  /** The tickets section; the pill hides while it is on screen. */
  sectionRef: RefObject<HTMLElement | null>;
  /** False until the picker has something to sell. */
  enabled: boolean;
  /** True while the checkout is open. */
  suppressed: boolean;
  onTap: () => void;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [yieldChat, setYieldChat] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const root = sectionRef.current;
    const marker = findHeroCta(root);
    const hasIO = typeof IntersectionObserver !== "undefined";
    const cleanups: Array<() => void> = [];

    const measureByScroll = () => {
      setPastHero(window.scrollY > SCROLL_FALLBACK_PX);
      if (!hasIO && root) {
        const r = root.getBoundingClientRect();
        setSectionVisible(r.bottom > 0 && r.top < window.innerHeight);
      }
    };

    if (hasIO && root) {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) setSectionVisible(e.isIntersecting);
      }, { threshold: 0.05 });
      io.observe(root);
      cleanups.push(() => io.disconnect());
    }
    if (hasIO && marker) {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0);
      });
      io.observe(marker);
      cleanups.push(() => io.disconnect());
    } else {
      window.addEventListener("scroll", measureByScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", measureByScroll));
      measureByScroll();
    }
    return () => { for (const c of cleanups) c(); };
  }, [enabled, sectionRef]);

  const show = enabled && pastHero && !sectionVisible && !suppressed;

  useEffect(() => {
    if (!show) return;
    setYieldChat(document.querySelector("[data-floating-chat],[data-guest-chat-launcher]") !== null);
  }, [show]);

  if (!show) return null;
  return (
    <button type="button" className="tp-float" data-testid="ticket-floating-cta" data-yield-chat={yieldChat ? "1" : undefined} onClick={onTap}>
      {label}
    </button>
  );
}
