"use client";

/**
 * NoirReveal — reveal-on-scroll controller for the Noir profile template.
 *
 * Renders nothing. On mount it observes every `[data-nf-reveal]` element inside
 * the Noir shell and adds `nf-in` as each scrolls into view (the CSS in
 * NoirProfileLayout fades + lifts them). SSR-safe by construction:
 *   - The hero is NOT marked reveal, so it paints immediately.
 *   - Content is always in the DOM (only opacity/transform differ) → crawlers
 *     and no-JS users still get everything (a <noscript> style + the
 *     prefers-reduced-motion block reveal all up front).
 *   - If IntersectionObserver is missing, every section is revealed at once.
 */

import { useEffect } from "react";

export function NoirReveal() {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-profile-theme="noir"] [data-nf-reveal]'),
    );
    if (nodes.length === 0) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || typeof IntersectionObserver === "undefined") {
      for (const n of nodes) n.classList.add("nf-in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("nf-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, []);

  return null;
}

/**
 * NoirBookbarAutoHide — stows the sticky book bar while the hero CTA is on
 * screen.
 *
 * Audit finding: the profile hero renders "Inquire about {name}" AND the
 * sticky bottom bar renders the same button, both visible in the same
 * viewport the moment the profile modal opens. Two identical primary CTAs
 * competing is the classic duplicate-CTA smell; the sticky bar is meant to
 * *rescue* the action after the hero scrolls past, not to shadow it.
 *
 * The shell ships `data-bookbar="idle"` from the server (bar stowed) so
 * there is no reveal-then-hide flash. This controller flips to "active" as
 * soon as the hero actions leave the viewport, and back when they return.
 *
 * Safety: renders nothing; if IntersectionObserver is unavailable — or JS
 * never runs at all (see the <noscript> block in NoirProfileLayout) — the
 * bar is left permanently visible. The CTA is never unreachable.
 *
 * Works inside the profile MODAL too: the panel is a scrolling ancestor, and
 * an IntersectionObserver with a null root still accounts for clipping by
 * scrollable ancestors, so the hero leaving the panel counts as leaving view.
 */
export function NoirBookbarAutoHide() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(
      '[data-profile-theme="noir"]',
    );
    const heroActions = shell?.querySelector(".nf-actions");
    if (!shell) return;

    const reveal = () => shell.setAttribute("data-bookbar", "active");

    // No hero CTA to defer to (or no IO support) → the bar is the only CTA.
    if (!heroActions || typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    let delivered = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        delivered = true;
        shell.setAttribute(
          "data-bookbar",
          entry.isIntersecting ? "idle" : "active",
        );
      },
      { threshold: 0 },
    );
    io.observe(heroActions);

    // Fail OPEN. The bar ships stowed, so anything that stops the observer
    // from ever reporting (a backgrounded tab that suspends observers, an
    // exotic scroll container, a future layout that drops .nf-actions) would
    // otherwise hide the booking CTA permanently. If no callback has landed
    // shortly after mount, fall back to the always-visible bar — i.e. the
    // behavior before this control existed. Worst case is a duplicate CTA,
    // never a missing one.
    const failOpen = window.setTimeout(() => {
      if (!delivered) reveal();
    }, 1500);

    return () => {
      io.disconnect();
      window.clearTimeout(failOpen);
    };
  }, []);

  return null;
}
