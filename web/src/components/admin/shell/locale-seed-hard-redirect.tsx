"use client";

import { useEffect, type ReactNode } from "react";

import { claimLocaleSeedHop } from "./locale-seed-hop-guard";

/**
 * TUL-1182: the admin layout's one-time language-seed hop as a HARD browser
 * navigation. A layout `redirect()` to the seed Route Handler inside the
 * post-sign-in soft navigation made the client router re-apply the redirect
 * forever (hundreds of requests in seconds, blank page until a reload). A
 * document navigation keeps the router out of it; the seed route sets the
 * attempt cookie, so this runs once. TUL-1177: the talent layout uses it too (same
 * soft-navigation hop, it showed as a 6-10 s textless skeleton after sign-in).
 *
 * Belt and braces: the browser also remembers (sessionStorage) that it took this hop, and
 * will not take it again within a minute, so a cookie that fails to persist can never
 * turn the hop into a loop. The children (the shell skeleton) paint either way.
 */
export function LocaleSeedHardRedirect({
  href,
  attemptCookie,
  children = null,
}: {
  href: string;
  /** The layout's loop-breaker cookie name; set from here when the browser refuses a repeat hop. */
  attemptCookie: string;
  /** What to paint while the document navigation happens (the shell skeleton), not a blank page. */
  children?: ReactNode;
}) {
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    if (claimLocaleSeedHop(storage, href, Date.now())) {
      window.location.replace(href);
      return;
    }
    // Refused a repeat: the server keeps asking for the hop although we took it, so the attempt
    // cookie did not persist. Write it from here (the layout only checks that it exists) and
    // reload ONCE, so the page renders instead of staying on this fallback until a manual reload.
    if (claimLocaleSeedHop(storage, `reload:${href}`, Date.now())) {
      document.cookie = `${attemptCookie}=1; path=/; max-age=60; samesite=lax`;
      window.location.reload();
    }
  }, [href, attemptCookie]);
  return <>{children}</>;
}
