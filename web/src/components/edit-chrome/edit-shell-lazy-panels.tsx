"use client";

/**
 * edit-shell-lazy-panels.tsx — every deferred overlay `EditShell` mounts.
 *
 * WHY THESE LIVE IN ONE PLACE
 * ───────────────────────────
 * Each is a large overlay that starts closed. Behind `next/dynamic` its chunk
 * is not downloaded until the operator first opens it, which is the single
 * cheapest lever on editor TTI: the shell no longer parses the publish drawer,
 * the theme drawer, the revisions list, the assets library, the command palette
 * and the ~3.4k-line add-gallery before the operator has done anything.
 *
 * The lazy half is only half the win. Each of these MUST be mounted behind its
 * own `everOpened*` flag in `EditShell` — a dynamic component mounted
 * unconditionally still fetches its chunk on mount, which looks done and is not.
 * `edit-shell-lazy-panels.static.test.ts` gates both halves, plus the wiring
 * that sets each flag (a flag nothing sets means a panel that can never open).
 *
 * Once a panel has been opened it STAYS in the tree across open/close cycles, so
 * its own internal state (scroll position, search text, form drafts) survives.
 * Every declaration therefore renders nothing while loading rather than a
 * spinner: the operator opened a closed panel, and a flash of skeleton chrome in
 * the corner of the canvas is noise, not feedback.
 *
 * Extracted from `edit-shell.tsx` (builder-2027 P1 / 1K) rather than raising
 * that file's size budget.
 */
import dynamic from "next/dynamic";

// ---------------------------------------------------------------------------
// Heavy drawers — lazy-loaded via next/dynamic so their JS chunks are
// deferred until the drawer is first opened, reducing initial editor TTI.
// Each is gated in EditShellInner by an "ever opened" boolean so the
// component does not mount (and the chunk does not download) until the
// operator first opens it. After that first mount the component stays in
// the tree across open/close cycles so the drawer's own internal state
// (scroll position, form state, etc.) is preserved.
// ---------------------------------------------------------------------------
export const PublishDrawer = dynamic(
  () => import("./publish-drawer").then((m) => ({ default: m.PublishDrawer })),
  { ssr: false, loading: () => null },
);
export const PageSettingsDrawer = dynamic(
  () =>
    import("./page-settings-drawer").then((m) => ({
      default: m.PageSettingsDrawer,
    })),
  { ssr: false, loading: () => null },
);
export const RevisionsDrawer = dynamic(
  () =>
    import("./revisions-drawer").then((m) => ({ default: m.RevisionsDrawer })),
  { ssr: false, loading: () => null },
);
export const ThemeDrawer = dynamic(
  () => import("./theme-drawer").then((m) => ({ default: m.ThemeDrawer })),
  { ssr: false, loading: () => null },
);
export const AssetsDrawer = dynamic(
  () => import("./assets-library-drawer").then((m) => ({ default: m.AssetsLibraryDrawer })),
  { ssr: false, loading: () => null },
);
export const CollectionsDrawer = dynamic(
  () =>
    import("./collections-drawer").then((m) => ({
      default: m.CollectionsDrawer,
    })),
  { ssr: false, loading: () => null },
);
export const CommandPalette = dynamic(
  () =>
    import("./command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false, loading: () => null },
);
export const ScheduleDrawer = dynamic(
  () =>
    import("./schedule-drawer").then((m) => ({ default: m.ScheduleDrawer })),
  { ssr: false, loading: () => null },
);
export const CommentsDrawer = dynamic(
  () =>
    import("./comments-drawer").then((m) => ({ default: m.CommentsDrawer })),
  { ssr: false, loading: () => null },
);
export const BuilderFindReplaceOverlay = dynamic(
  () =>
    import("./builder-find-replace-overlay").then((m) => ({
      default: m.BuilderFindReplaceOverlay,
    })),
  { ssr: false, loading: () => null },
);
// builder-2027 1K — the three remaining EAGER panels. They are not drawers, so
// they were never enrolled above, but they are the same shape and the same cost:
// each is a large closed overlay whose chunk every editor session downloaded and
// parsed before the operator had done anything. The add-gallery subtree alone is
// ~3.4k lines. Same "ever opened" gate as the drawers, so the chunk arrives on
// first open and the panel then stays mounted to keep its own state (scroll
// position, search text) across open/close.
export const AddGalleryPanel = dynamic(
  () =>
    import("./add-gallery/add-gallery-panel").then((m) => ({
      default: m.AddGalleryPanel,
    })),
  { ssr: false, loading: () => null },
);
export const AllPagesPanel = dynamic(
  () => import("./all-pages-panel").then((m) => ({ default: m.AllPagesPanel })),
  { ssr: false, loading: () => null },
);
export const DesignPanel = dynamic(
  () => import("./design-panel").then((m) => ({ default: m.DesignPanel })),
  { ssr: false, loading: () => null },
);

