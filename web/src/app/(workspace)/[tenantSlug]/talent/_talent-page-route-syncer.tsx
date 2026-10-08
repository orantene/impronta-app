"use client";

/**
 * TalentPageRouteSyncer — Phase 3.12.2 bridge between Next.js talent routes
 * and the admin shell's internal talent page state.
 *
 * Usage: render <TalentPageRouteSyncer page="messages" /> as the sole content
 * of each talent surface page (talent/inbox/page.tsx etc.). It must be a
 * descendant of TalentShellClient so it has AdminShellProvider context.
 *
 * On mount it calls setTalentPage(page, { navigate: false }). The URL is
 * already correct. Navigating from here used to push the previous page
 * (Today) back over Money when the setter identity changed mid-transition.
 */

import { useEffect } from "react";
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";
import type { TalentPage } from "@/components/admin/shell/internal/state";

/**
 * Tolerates a missing AdminShellProvider (2026-10-01, P0). The talent layout
 * renders `/talent/page-builder` BARE (no shell), and a layout is not
 * re-rendered on a client navigation. So a soft navigation from the builder to
 * a shell route (the plan-lock stopgap pushed to /talent/settings) mounted this
 * syncer with no provider above it, and the hard `useAdminShell()` threw into
 * the talent error boundary. Without a shell we reload the URL so the layout
 * renders again, this time with the shell.
 */
const RELOAD_GUARD_KEY = "talent-route-syncer-reload";

/** One reload per URL, so a route that is ever served bare cannot loop. */
function reloadIntoShellOnce(): void {
  if (typeof window === "undefined") return;
  const href = window.location.href;
  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === href) return;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, href);
  } catch {
    // Storage blocked: no loop guard available, so do not risk a reload loop.
    return;
  }
  window.location.replace(href);
}

export function TalentPageRouteSyncer({ page }: { page: TalentPage }) {
  const shell = useAdminShellOptional();
  const setTalentPage = shell?.setTalentPage ?? null;

  useEffect(() => {
    if (!setTalentPage) {
      reloadIntoShellOnce();
      return;
    }
    // The URL is already this page. Navigating here pushed Today back over
    // Money when this effect re-ran on a setter identity change.
    setTalentPage(page, { navigate: false });
  }, [page, setTalentPage]);

  return null;
}
