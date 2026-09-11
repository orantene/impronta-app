"use client";

// ════════════════════════════════════════════════════════════════════
// drawers.tsx — Phase 1d THIN BARREL (remediation-plan-2026-05-19 §4).
//
// The 31,468-LOC god-file was decomposed into ./drawers/* (byte-for-byte
// bodies): drawer-shared.tsx (external re-export hub + 94 cross-cutting
// helpers), light-01..23.tsx (118 leaf drawer bodies),
// profile-shell/* (TalentProfileShellDrawer + ECO support cast). This
// file keeps ONLY DrawerRoot and re-exports the historical public surface
// so importers stay byte-unbroken.
//
// THE SWITCH IS LOADED ON DEMAND. `DrawerSwitch` (./drawer-switch.tsx) is
// the one module that imports all 118 bodies, and it is reached here
// through `next/dynamic` (via `shell-lazy-surfaces.tsx`), so the bodies are
// their own chunk, fetched the first time a drawer opens. Before this, every admin route — the register
// on a tablet included — downloaded every drawer at first paint, because a
// static import of the switch put ~35,000 lines into the shell's client
// graph (`scripts/app-bundle-budget.mjs`). `ssr` stays ON, the same shape
// as `admin/pos/mode-clients.tsx`: a hard load that lands with a drawer
// open still paints it on the server. `loading` renders nothing: the closed
// DrawerShell below is what the screen shows until the chunk arrives, and
// the drawer then slides in exactly as it did when it was in-chunk.
// ════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { DrawerShell } from "./primitives";
import { useAdminShell } from "./state";
import { OPEN_DRAWER_EVENT, type OpenDrawerEventDetail } from "./open-drawer-bridge";

// The `import()` names `shell-lazy-surfaces`, not `drawer-switch`, on purpose:
// the drawers, the messages shell and the talent surface share one module
// graph, and one import target means one chunk group and one copy of it.
const DrawerSwitch = dynamic(
  () => import("./shell-lazy-surfaces").then((m) => ({ default: m.DrawerSwitch })),
  { loading: () => null },
);

// ════════════════════════════════════════════════════════════════════
// Drawer root — reads drawer state and dispatches to the right body
// ════════════════════════════════════════════════════════════════════
//
// Each drawer body is its own component so it can call `useAdminShell()` at
// the top level (rules of hooks). `DrawerRoot` is just a switch on the
// active drawer id; when no drawer is open it still renders an empty
// closed shell so the slide-out animation can play in both directions.

export function DrawerRoot() {
  const { state, closeDrawer, openDrawer } = useAdminShell();

  // Bridge listener: lets components that render OUTSIDE this provider
  // (e.g. the top-bar notification bell, which self-loads and has no
  // useAdminShell() access) ask the shell to open a specific drawer via a
  // window CustomEvent. See open-drawer-bridge.ts.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenDrawerEventDetail>).detail;
      if (!detail?.drawerId) return;
      openDrawer(detail.drawerId, detail.payload);
    };
    window.addEventListener(OPEN_DRAWER_EVENT, handler);
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, handler);
  }, [openDrawer]);

  const id = state.drawer.drawerId;
  if (!id) {
    // still render the shell closed so backdrop animates out
    return <DrawerShell open={false} onClose={closeDrawer} title=""><></></DrawerShell>;
  }
  return <DrawerSwitch id={id} />;
}

// ── Phase 1d public-surface re-exports (byte-stable) ──
export type { DiffEntry } from "./drawers/profile-shell";
