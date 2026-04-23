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
        /* The public storefront header is audience-facing chrome (language
           toggle, saved, account, sign out). In edit mode it steals vertical
           space, competes with the edit top bar, and — most importantly — a
           stray click on "sign out" would destroy the operator's session
           mid-edit. Hide it while editing; the device-toggle preview surface
           will own the full-fidelity preview role later. */
        header[data-public-header] { display: none !important; }
      `}</style>
      <EditShell tenantId={tenantId} />
    </>
  );
}
