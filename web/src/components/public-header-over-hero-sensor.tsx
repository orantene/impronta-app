"use client";

/**
 * <PublicHeaderOverHeroSensor> — runtime helper for the
 * `shell.header-transparent-on-hero` token.
 *
 * The token CSS rule needs two attributes on the `<header>` element:
 *
 *   html[data-token-shell-header-transparent-on-hero="on"]
 *     .public-header[data-over-hero="true"] { background: transparent; … }
 *
 * The first is set by the token resolver on `<html>` at SSR. The second
 * is a runtime state — true while the header is overlaying the hero,
 * false once the user has scrolled past it.
 *
 * Why a sensor instead of `useEffect` inside <PublicHeader>:
 *   - <PublicHeader> is an async server component; it can't carry React
 *     state or effects without sacrificing its SSR fast-path.
 *   - The threshold (80px today) is layout-coupled, not content-coupled,
 *     so a single shared sensor is correct rather than per-page. If a
 *     page wants a different threshold (e.g. a tall full-bleed hero),
 *     the prop is overridable.
 *
 * SSR behavior: <PublicHeader> renders the `<header>` element with
 * `data-over-hero="true"` already set, so the transparent state is
 * applied during the initial paint without flicker. This sensor's
 * effect runs after hydration and only ever WRITES the attribute
 * (never reads) — so no hydration mismatch.
 *
 * (Earlier revision of this file used an inline script tag that wrote
 * the attribute before React hydrated; that produced a tree-hydration
 * mismatch warning in React 18+. The SSR-attribute approach replaces
 * it.)
 */

import { useEffect } from "react";

interface Props {
  /** Pixels the user must scroll before the header flips to opaque. */
  threshold?: number;
}

export function PublicHeaderOverHeroSensor({ threshold = 80 }: Props) {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-public-header]");
    if (!header) return;

    function update() {
      if (!header) return;
      const overHero = window.scrollY < threshold;
      // Only write when the value actually changes — avoids style recalc
      // every scroll frame.
      const next = overHero ? "true" : "false";
      if (header.getAttribute("data-over-hero") !== next) {
        header.setAttribute("data-over-hero", next);
      }
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
    };
  }, [threshold]);

  // Sensor runs purely as a client effect — no DOM output. The header's
  // `data-over-hero` attribute is rendered on the server (default
  // "true"); this effect just keeps it in sync with scroll position.
  return null;
}
