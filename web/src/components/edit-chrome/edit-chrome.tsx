"use client";

/**
 * EditChrome — client entry that decides between idle pill and engaged shell.
 *
 * The server mount (EditChromeMount) passes `editActive` based on the
 * tenant-scoped edit cookie. If false, render the pill and nothing else. If
 * true, render the full shell. Either way, the storefront DOM continues to
 * render underneath — we are always on the real page.
 *
 * In shell mode, a SSR-inlined <style> applies the body padding for the top
 * bar and the right-side inspector gutter — SSR so it applies immediately
 * without waiting for hydration.
 */

import { EditPill } from "./edit-pill";
import { EditShell } from "./edit-shell";

interface EditChromeProps {
  tenantId: string;
  editActive: boolean;
}

export function EditChrome({ tenantId, editActive }: EditChromeProps) {
  if (!editActive) return <EditPill />;
  return (
    <>
      <style>{`
        body { padding-top: 52px !important; }
        @media (min-width: 1024px) {
          body { padding-right: 340px !important; }
        }
      `}</style>
      <EditShell tenantId={tenantId} />
    </>
  );
}
