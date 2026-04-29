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
 * SSR behavior: we set `data-over-hero="true"` synchronously on first
 * paint via the inline script tag, so the transparent state is visible
 * during hydration on pages that mount over a hero. Pages without a
 * hero (e.g. /directory) don't render this component, so the attribute
 * stays unset and the rule never matches.
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

  // Inline script sets the attribute synchronously on first paint so the
  // transparent state survives hydration without a flash of opaque-then-
  // transparent. The script reads the same threshold via a data attribute
  // because module-level state isn't accessible from the inline string.
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `(function(){var h=document.querySelector('[data-public-header]');if(!h)return;h.setAttribute('data-over-hero', window.scrollY < ${threshold} ? 'true' : 'false');})();`,
      }}
    />
  );
}
