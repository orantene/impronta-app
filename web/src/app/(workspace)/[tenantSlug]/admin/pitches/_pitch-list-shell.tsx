"use client";

/**
 * Phase E — client wrapper around the pitch list.
 *
 * The list rows themselves are server-rendered (children prop). This wrapper
 * adds:
 *   1. A click handler that captures clicks on `[data-pitch-row-id]` elements
 *      and opens the detail drawer for that pitch.
 *   2. The PitchDetailDrawer mount.
 *
 * Why event delegation + data attribute: keeps the row markup as a pure
 * server component (no React hydration needed for the rows themselves), and
 * works regardless of how nested the row content is.
 */

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";

import { PitchDetailDrawer } from "./_pitch-detail-drawer";

export function PitchListShell({
  tenantSlug,
  children,
}: {
  tenantSlug: string;
  children: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    // Allow nested links / buttons to handle their own clicks first.
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("a, button, input")) return;
    const row = target.closest<HTMLElement>("[data-pitch-row-id]");
    const id = row?.dataset.pitchRowId;
    if (id) setOpenId(id);
  }, []);

  return (
    <>
      <div onClick={handleClick}>{children}</div>
      <PitchDetailDrawer
        tenantSlug={tenantSlug}
        pitchId={openId}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
