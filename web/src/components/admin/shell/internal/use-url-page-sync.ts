"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { resolveWorkspacePageId } from "@/lib/workspace/page-ids";

import { isSpaOnlyAdminSegment } from "./spa-segments";
import { useAdminShell } from "./state";

/**
 * Keeps the shell's page in step with the URL when the URL moved WITHOUT a
 * server render: a rail click to a bare-syncer segment is a
 * `history.pushState` (spa-segments.ts), and Back/Forward across those
 * entries restore the router tree the browser already had, so no
 * `PageRouteSyncer` re-runs. `usePathname` follows both; this hook reads it
 * from inside WorkspaceShell.
 *
 * Segments with a real server page (POS, orders, the overview snapshot...)
 * still sync through their own `PageRouteSyncer`; this only speaks for the
 * SPA-only segments and the overview when Back lands on `/admin`.
 */
export function useUrlPageSync(): void {
  const pathname = usePathname();
  const { syncPage, adminBasePath } = useAdminShell();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (pathname == null) return;
    if (last.current === null) {
      // First render: the layout already derived the initial page from this
      // pathname on the server; nothing to sync.
      last.current = pathname;
      return;
    }
    if (pathname === last.current) return;
    last.current = pathname;
    if (pathname !== adminBasePath && !pathname.startsWith(`${adminBasePath}/`)) return;
    const segment = pathname.slice(adminBasePath.length).replace(/^\//, "").split("/")[0] ?? "";
    if (segment && !isSpaOnlyAdminSegment(segment)) return;
    syncPage(resolveWorkspacePageId(segment || "overview"));
  }, [pathname, adminBasePath, syncPage]);
}

