"use client";

/**
 * TUL-516 W4-7 — on talent_site hosts, a hostname change must be a full
 * document navigation. Soft-nav between *-demo hosts can leave the previous
 * talent painted under the new URL until hard reload.
 *
 *   1. Click capture: absolute / protocol-relative links to another host use
 *      `location.assign` instead of the App Router soft transition.
 *   2. Mount check: if the RSC-stamped served host ≠ `window.location.host`,
 *      `location.replace` reloads so the proxy resolves the right talent.
 */

import { useEffect } from "react";

import {
  hrefRequiresFullNavigation,
  servedHostMismatch,
} from "@/lib/talent-site/host-full-navigation";

const RELOAD_GUARD_KEY = "talent-site-host-full-nav-reload";

function reloadOnceForMismatch(href: string): void {
  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === href) return;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, href);
  } catch {
    // Storage blocked: skip the mismatch reload rather than risk a loop.
    return;
  }
  window.location.replace(href);
}

export function TalentSiteHostFullNav({ servedHost }: { servedHost: string }) {
  useEffect(() => {
    if (servedHostMismatch(servedHost, window.location.hostname)) {
      reloadOnceForMismatch(window.location.href);
      return;
    }
    try {
      window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch {
      // ignore
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const el = event.target;
      if (!(el instanceof Element)) return;
      const anchor = el.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!hrefRequiresFullNavigation(window.location.hostname, href)) return;
      event.preventDefault();
      window.location.assign(anchor.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [servedHost]);

  return null;
}
