"use client";

/**
 * PageRouteSyncer — cutover-mode bridge between Next.js routes and the
 * prototype shell's internal page state.
 *
 * Usage: render <PageRouteSyncer page="messages" /> as the sole content of
 * each admin surface page (admin/messages/page.tsx etc.). It must be a
 * descendant of AdminShellPrototypePageClient so it has ProtoProvider context.
 *
 * On mount it calls setPage(page) which updates the shell's active surface
 * WITHOUT triggering router.push (the URL is already correct — the guard in
 * ProtoProvider._state.tsx skips the push when pathname already matches).
 * This eliminates the flash-of-wrong-page on hard refresh.
 */

import { useEffect } from "react";
import { useProto } from "@/app/prototypes/admin-shell/_state";
import type { WorkspacePage } from "@/app/prototypes/admin-shell/_state";

export function PageRouteSyncer({ page }: { page: WorkspacePage }) {
  const { setPage } = useProto();

  useEffect(() => {
    setPage(page);
    // We only want to re-sync if the `page` prop changes (e.g. soft
    // navigation to a different route). setPage is stable (useCallback).
  }, [page, setPage]);

  return null;
}
