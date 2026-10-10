import "server-only";

/**
 * shell-counts.ts — TUL-387 + TUL-389 (Notifications 1/6 + 3/6).
 *
 * Single loader for the three chrome badge counts the shell will paint as
 * bubbles (TUL-388): messages, money, attention. Layouts call this once per
 * surface and stamp the result onto the bridge as `shellCounts`, keeping
 * `totalUnread === shellCounts.messages` for existing consumers.
 *
 * messages reuses the existing unread loaders in `lib/saas/unread-counts.ts`
 * (inquiry watermarks — not the notifications "messages" category).
 * money / attention come from `countUnreadNotifications` (`read_at IS NULL`
 * rollup by UI category — TUL-389).
 *
 * Never throws — returns zeros on any error so a flaky count cannot blank
 * the shell.
 */

import { logServerError } from "@/lib/server/safe-error";
import {
  loadWorkspaceUnreadCount,
  loadTalentUnreadCount,
} from "@/lib/saas/unread-counts";
import {
  countUnreadNotifications,
  type CountUnreadOptions,
} from "@/lib/notifications/self";
import {
  emptyUnreadCounts,
  type UnreadNotificationCounts,
} from "@/lib/notifications/categories-ui";

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
  /** TUL-389 — unread notification rollup by UI category. */
  countUnreadNotifications?: (
    opts: CountUnreadOptions,
  ) => Promise<UnreadNotificationCounts>;
};

const ZERO_COUNTS: ShellCounts = { messages: 0, money: 0, attention: 0 };

const defaultLoaders: ShellCountLoaders = {
  loadWorkspaceUnread: loadWorkspaceUnreadCount,
  loadTalentUnread: loadTalentUnreadCount,
  countUnreadNotifications,
};

function sanitizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Load chrome badge counts for the named shell surface.
 *
 * - messages: workspace / talent inquiry unread loaders
 * - money / attention: `countUnreadNotifications` for that surface (TUL-389)
 */
export async function loadShellCounts(
  surface: ShellCountSurface,
  opts: LoadShellCountsOpts,
  loaders: ShellCountLoaders = defaultLoaders,
): Promise<ShellCounts> {
  try {
    const [messages, notif] = await Promise.all([
      loadMessagesCount(surface, opts, loaders),
      loadNotifCategoryCounts(surface, loaders),
    ]);
    return {
      messages: sanitizeCount(messages),
      money: sanitizeCount(notif.money),
      attention: sanitizeCount(notif.attention),
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

async function loadNotifCategoryCounts(
  surface: ShellCountSurface,
  loaders: ShellCountLoaders,
): Promise<UnreadNotificationCounts> {
  const countFn = loaders.countUnreadNotifications ?? countUnreadNotifications;
  try {
    return await countFn({ surface });
  } catch (err) {
    logServerError("shell-counts.loadNotifCategoryCounts", err);
    return emptyUnreadCounts();
  }
}
