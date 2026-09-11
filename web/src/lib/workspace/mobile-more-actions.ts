/**
 * The phone More sheet's AUXILIARY rows — the ones that are not destinations.
 *
 * WHY THIS IS A MODULE AND NOT JSX IN THE COMPONENT. The first cut of the
 * mobile nav rewrite gated the "Open POS" row on a hardcoded `false` and on
 * `modesForPerson({ ..., workspaceEnabledModes: [] })`, which can only ever
 * return an empty array. Both halves of the gate were therefore constant, the
 * row was structurally unreachable, and every check on that branch was green
 * because nothing ever executed it. A pure function that returns the row list
 * can be called from a test with a real workspace's inputs, so the gate is
 * exercised rather than merely read.
 *
 * The component renders EVERY row this returns, in order, and adds none of its
 * own — `mobile-bottom-nav.static.test.ts` pins that, so the list below is the
 * whole auxiliary set, not a subset the component then edits.
 *
 * No runtime imports beyond the POS mode vocabulary (itself import-free), so
 * this is safe from a client component, a server component or a bare unit test.
 */
import { modesForPerson, type PosMode, type PosPersonRole } from "@/lib/pos/modes";

import type { AdminShellIconName } from "@/components/admin/shell/internal/primitives";

/** What the component does when the row is tapped. */
export type MobileMoreActionId = "search" | "notifications" | "open-pos";

export type MobileMoreAction = {
  readonly id: MobileMoreActionId;
  /** English label; the component runs it through the copy dictionary. */
  readonly label: string;
  readonly icon: AdminShellIconName;
};

export type MobileMoreActionsInput = {
  /**
   * The platform-wide POS kill switch (`platform_settings.workspace_pos_enabled`,
   * read by `loadPlatformWorkspaceUi`). Never a literal at the call site: it
   * arrives on the shell bridge as `workspaceUi.posEnabled`.
   */
  readonly posEnabled: boolean;
  /** The signed-in person's tenant rank. */
  readonly role: PosPersonRole;
  /**
   * The modes this workspace has switched on, from
   * `enabledPosModesFromSettings(agencies.settings)` — which already defaults
   * to `["counter"]` when a workspace has no `pos` settings at all. Passing an
   * empty array here means "this workspace has deliberately turned every mode
   * off", NOT "we do not know yet"; a caller that does not know must pass the
   * reader's default, never `[]`.
   */
  readonly workspaceEnabledModes: readonly PosMode[];
};

/**
 * True when the "Open POS" row should be in the sheet: the platform switch is
 * on AND this person has at least one mode they may actually use. Either half
 * alone is not enough — an owner on a POS-disabled platform must not see it,
 * and a read-only viewer on a POS-enabled workspace must not either
 * (`modesForPerson` gives `viewer` nothing).
 */
export function showsOpenPosRow(input: MobileMoreActionsInput): boolean {
  if (!input.posEnabled) return false;
  return (
    modesForPerson({
      role: input.role,
      workspaceEnabledModes: input.workspaceEnabledModes,
    }).length > 0
  );
}

/**
 * Every auxiliary row of the More sheet, in render order. Search and
 * notifications are unconditional (both surfaces exist for every role);
 * "Open POS" is conditional on `showsOpenPosRow`.
 */
export function mobileMoreActions(
  input: MobileMoreActionsInput,
): readonly MobileMoreAction[] {
  const rows: MobileMoreAction[] = [
    { id: "search", label: "Search", icon: "search" },
    { id: "notifications", label: "Notifications", icon: "bell" },
  ];
  if (showsOpenPosRow(input)) {
    rows.push({ id: "open-pos", label: "Open POS", icon: "credit" });
  }
  return rows;
}
