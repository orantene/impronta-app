/**
 * ScheduleDrawer load gating + control enablement — PURE, so the node test
 * lane can drive the sequence that deadlocked the drawer without rendering
 * React or booting a DOM.
 *
 * THE DEADLOCK THIS FIXES (found in live QA of the page-scoped schedule work):
 * the drawer's load effect used a boolean `lastOpenRef` to run "once per open".
 * Once cms pages started passing `pageId` / `pageSlug`, those props settle a
 * tick AFTER the drawer opens, so the effect re-ran:
 *
 *   1. open      → ref=true, setState("loading"), load fires
 *   2. pageId arrives → cleanup sets cancelled=true (the in-flight load's
 *                       result is now discarded)
 *   3. effect re-runs → `if (lastOpenRef.current) return` bails
 *
 * Nothing ever resolved state out of "loading". Because the drawer folded
 * `loading` into its `isSaving` flag, that disabled the datetime input, the
 * submit button, the footer Close AND `onRequestClose` (so Escape and the
 * backdrop were dead too). The header X was the only way out.
 *
 * Two rules come out of that, and both live here:
 *
 *   1. Gate the load on the IDENTITY it was issued for, not on a bare "have I
 *      opened yet" bit. When the identity changes the load must re-fire; when
 *      it hasn't, a re-render must not re-fire it.
 *   2. A load must never be able to trap the operator. `loading` may disable
 *      the form, but it must never disable the exits — only a real in-flight
 *      write (`saving`) does that.
 */

export type ScheduleDrawerStateKind =
  | "idle"
  | "loading"
  | "error"
  | "saving"
  | "success";

export interface ScheduleLoadIdentity {
  open: boolean;
  locale: string;
  pageId?: string | null;
  pageSlug?: string | null;
}

/**
 * The identity a schedule load is issued for. `null` while the drawer is
 * closed, which is what makes the next open re-load (the original
 * "never show a stale form" intent, preserved).
 *
 * Blank and nullish page fields normalise to the same token so the homepage —
 * which legitimately has neither — does not thrash between `""` and `null` on
 * re-render and re-fire the load.
 */
export function scheduleLoadKey(input: ScheduleLoadIdentity): string | null {
  if (!input.open) return null;
  const norm = (v: string | null | undefined) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t.length > 0 ? t : "-";
  };
  return `${norm(input.locale)}|${norm(input.pageId)}|${norm(input.pageSlug)}`;
}

/**
 * Should the effect issue a load for `nextKey`?
 *
 * Yes when the drawer is open and the identity differs from the one already
 * loaded. This is the whole fix: a boolean "already opened" latch answered NO
 * to step 3 above and stranded the drawer; keying on identity answers YES,
 * so the settled `pageId` gets the load it needs.
 */
export function shouldRunScheduleLoad(
  loadedKey: string | null,
  nextKey: string | null,
): boolean {
  if (nextKey === null) return false;
  return nextKey !== loadedKey;
}

export interface ScheduleDrawerControlState {
  /** Datetime picker + submit + cancel-schedule. Disabled while busy. */
  formDisabled: boolean;
  /**
   * Footer Close, Escape, backdrop. Disabled ONLY during a real in-flight
   * write — never during a load, or a slow/failed load locks the operator in.
   */
  exitDisabled: boolean;
}

/**
 * Map the form state to what the operator can touch.
 *
 * `loading` disables the form (there is nothing meaningful to submit yet) but
 * leaves every exit live. `saving` is the only state that may block an exit,
 * because a write is genuinely in flight.
 */
export function scheduleDrawerControlState(
  kind: ScheduleDrawerStateKind,
): ScheduleDrawerControlState {
  return {
    formDisabled: kind === "loading" || kind === "saving",
    exitDisabled: kind === "saving",
  };
}
