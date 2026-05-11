"use client";

/**
 * TalentPageRouteSyncer — Phase 3.12.2 bridge between Next.js talent routes
 * and the admin shell's internal talent page state.
 *
 * Usage: render <TalentPageRouteSyncer page="messages" /> as the sole content
 * of each talent surface page (talent/inbox/page.tsx etc.). It must be a
 * descendant of TalentShellClient so it has AdminShellProvider context.
 *
 * On mount it calls setTalentPage(page) which updates the shell's active surface
 * WITHOUT triggering router.push (the URL is already correct — the guard in
 * AdminShellProvider skips the push when pathname already matches).
 * This eliminates the flash-of-wrong-page on hard refresh.
 */

import { useEffect } from "react";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import type { TalentPage } from "@/components/admin/shell/internal/state";

export function TalentPageRouteSyncer({ page }: { page: TalentPage }) {
  const { setTalentPage } = useAdminShell();

  useEffect(() => {
    setTalentPage(page);
    // We only want to re-sync if the `page` prop changes (e.g. soft
    // navigation to a different route). setTalentPage is stable (useCallback).
  }, [page, setTalentPage]);

  return null;
}
