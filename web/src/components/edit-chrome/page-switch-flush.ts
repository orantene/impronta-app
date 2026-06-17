/**
 * page-switch-flush — CANVAS-2 shared autosave-flush-before-navigate sequence.
 *
 * The multi-page switcher used to gate navigation behind a blocking
 * `window.confirm("You have unsaved changes…")`. That dialog is replaced by a
 * silent flush of the shared EditProvider autosave queue: when the page is
 * dirty we AWAIT `flushBuilderTreeSave()` so the debounced draft is committed
 * BEFORE the route changes, then navigate. Awaiting (not fire-and-forget) is
 * load-bearing — a save still in flight would otherwise race the navigation and
 * trip VERSION_CONFLICT.
 *
 * This lives in one shared module so both shared-chrome page switchers (the
 * topbar PagePicker and the CommandDock AllPagesPanel) — and therefore every
 * multi-page surface that mounts them (admin storefront, talent site) — use the
 * identical ordering. No surfaceKind branch: the behavior is the same for all.
 */

/**
 * Flush any pending autosave, then run `navigate`. The flush is only awaited
 * when `dirty` is true (it is a safe no-op when the save queue is idle, but
 * skipping it avoids an unnecessary round-trip on a clean page). A flush
 * failure (e.g. a version conflict) does NOT block navigation — the draft is
 * preserved server-side and recovered on the next open — so `navigate` always
 * runs exactly once.
 *
 * @returns `true` once navigation has been dispatched.
 */
export async function flushThenNavigate({
  dirty,
  flush,
  navigate,
}: {
  dirty: boolean;
  /**
   * The EditProvider's `flushBuilderTreeSave`. May be absent when no provider
   * is mounted (e.g. an ephemeral lab surface) — in that case there is nothing
   * to flush and we navigate straight away.
   */
  flush: (() => Promise<unknown>) | null | undefined;
  navigate: () => void;
}): Promise<boolean> {
  if (dirty && flush) {
    try {
      await flush();
    } catch {
      // Swallow — a failed flush leaves the draft parked server-side; we still
      // let the operator leave rather than trapping them on the page.
    }
  }
  navigate();
  return true;
}
