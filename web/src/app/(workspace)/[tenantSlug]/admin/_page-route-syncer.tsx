"use client";

/**
 * PageRouteSyncer — cutover-mode bridge between Next.js routes and the
 * admin shell's internal page state.
 *
 * Usage: render <PageRouteSyncer page="messages" /> as the sole content of
 * each admin surface page (admin/messages/page.tsx etc.). It must be a
 * descendant of AdminShellClient so it has AdminShellProvider context.
 *
 * On mount it calls syncPage(page) which updates the shell's active surface
 * WITHOUT pushing a navigation (the URL is already correct). syncPage — not
 * setPage — is used deliberately: setPage maps a page to its canonical
 * segment and pushes there, which would strip a deeper sub-route
 * (e.g. /website/card-design → /website) when the route-mount sync fires.
 * This also eliminates the flash-of-wrong-page on hard refresh.
 */

import { useEffect } from "react";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import type { WorkspacePage } from "@/components/admin/shell/internal/state";

export function PageRouteSyncer({ page }: { page: WorkspacePage }) {
  const { syncPage } = useAdminShell();

  useEffect(() => {
    syncPage(page);
    // We only want to re-sync if the `page` prop changes (e.g. soft
    // navigation to a different route). syncPage is stable (useCallback).
  }, [page, syncPage]);

  return null;
}
