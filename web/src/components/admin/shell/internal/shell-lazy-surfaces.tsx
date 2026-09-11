"use client";

/**
 * shell-lazy-surfaces.tsx — the ONE async entry into the shell's heavy
 * subgraph.
 *
 * Three things the admin shell shows only after an interaction share one
 * module graph: the messages shell, the talent surface and the 118 drawer
 * bodies. `messages/*` imports the talent barrel, the talent pages import
 * the messages shell, and the drawers import both; the graph is one blob
 * (~1 MB of JavaScript) however it is entered.
 *
 * When each of the three had its own `next/dynamic` import, Turbopack
 * emitted that blob ONCE PER CHUNK GROUP — three copies of the same 1,086,399
 * bytes on disk, and a person who opened Messages and then a drawer
 * downloaded it twice (measured on the 2026-09-11 build, `next build`,
 * four chunks of identical size with different module order). A chunk group
 * is keyed by the module the `import()` names, so three `import()` calls
 * that name THIS module are one group, and the blob is emitted once.
 *
 * Nothing renders from here; this file only re-exports. The `dynamic()`
 * wrappers live in `page-modules/pages-dynamic.tsx` and `drawers.tsx`.
 */

export { MessagesShell } from "./messages";
export { TalentSurface } from "./talent";
export { DrawerSwitch } from "./drawer-switch";
