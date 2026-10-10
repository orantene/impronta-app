import "server-only";

/**
 * shell-counts.ts — TUL-387 (Notifications 1/6).
 *
 * Single loader for the three chrome badge counts the shell will paint as
 * bubbles (TUL-388): messages, money, attention. Layouts call this once per
 * surface and stamp the result onto the bridge as `shellCounts`, keeping
 * `totalUnread === shellCounts.messages` for existing consumers.
 *
 * messages reuses the existing unread loaders in `lib/saas/unread-counts.ts`.
 * money / attention stay at 0 until TUL-389 wires their producers.
 *
 * Never throws — returns zeros on any error so a flaky count cannot blank
 * the shell.
 */

import { logServerError } from "@/lib/server/safe-error";
import {
  loadWorkspaceUnreadCount,
  loadTalentUnreadCount,
} from "@/lib/saas/unread-counts";

export type ShellCounts = {
  messages: number;
  money: number;
  attention: number;
};

export type ShellCountSurface = "workspace" | "talent";

export type LoadShellCountsOpts = {
  tenantId: string;
  /** Required when `surface` is `"talent"`. */
  talentProfileId?: string;
};

/** Injectable loaders for unit tests (surface routing without a live DB). */
export type ShellCountLoaders = {
  loadWorkspaceUnread: (tenantId: string) => Promise<number>;
  loadTalentUnread: (
    talentProfileId: string,
    tenantId: string,
  ) => Promise<number>;
};

const ZERO_COUNTS: ShellCounts = { messages: 0, money: 0, attention: 0 };

const defaultLoaders: ShellCountLoaders = {
  loadWorkspaceUnread: loadWorkspaceUnreadCount,
  loadTalentUnread: loadTalentUnreadCount,
};

function sanitizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Load chrome badge counts for the named shell surface.
 *
 * - workspace → `loadWorkspaceUnreadCount` / `loadTotalUnreadMessages`
 * - talent → `loadTalentUnreadCount`
 *
 * money / attention: always 0 until TUL-389.
 */
export async function loadShellCounts(
  surface: ShellCountSurface,
  opts: LoadShellCountsOpts,
  loaders: ShellCountLoaders = defaultLoaders,
): Promise<ShellCounts> {
  try {
    const messages = sanitizeCount(
      await loadMessagesCount(surface, opts, loaders),
    );
    return {
      messages,
      // TODO(TUL-389): wire money / attention producers (no schema yet —
      // prefer an honest zero over inventing a DB read).
      money: 0,
      attention: 0,
    };
  } catch (err) {
    logServerError("shell-counts.loadShellCounts", err);
    return { ...ZERO_COUNTS };
  }
}

async function loadMessagesCount(
  surface: ShellCountSurface,
  opts: LoadShellCountsOpts,
  loaders: ShellCountLoaders,
): Promise<number> {
  if (!opts.tenantId) return 0;

  if (surface === "workspace") {
    return loaders.loadWorkspaceUnread(opts.tenantId);
  }

  const talentProfileId = opts.talentProfileId;
  if (!talentProfileId) {
    logServerError(
      "shell-counts.loadShellCounts.talentMissingProfileId",
      new Error("talentProfileId is required for talent surface"),
    );
    return 0;
  }
  return loaders.loadTalentUnread(talentProfileId, opts.tenantId);
}


/**
 * Talent inbox + agency filter chips sum `unreadCount` across every agency
 * thread on the bridge. `loadTalentUnreadCount` is single-tenant, so the
 * Messages bubble drifted below the inbox "All" unread total (TUL-387 FAIL).
 */
export function sumTalentInquiryUnread(
  rows: ReadonlyArray<{ unreadCount?: number | null }>,
): number {
  let n = 0;
  for (const row of rows) {
    const c = row.unreadCount;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) n += Math.floor(c);
  }
  return n;
}

export function sanitizeShellCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
