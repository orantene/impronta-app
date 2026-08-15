/**
 * notification-drawer-targets.ts — the ONE place a notification's stored
 * `target_drawer` string becomes a real drawer.
 *
 * Why this exists (execution-plan-2026-08-15 §1 P0-2): notifications persist a
 * free-form `target_drawer` string, and the shell dispatches it straight into
 * `DrawerSwitch`. Two media-ownership notifications emitted ids that no case
 * ever matched (`talent-media`, `media-releases`), so both halves of the
 * two-key release flow landed on the "Coming up next" stub — at the exact
 * moment the user cared most. Nothing failed loudly; the switch just fell
 * through to its default.
 *
 * The fix is deliberately a MAPPING, not a rename of the emitted strings:
 * rows are already in the database with the old ids, and a rename would only
 * fix future notifications. So:
 *
 *   • Ids that ARE drawers pass through untouched.
 *   • Ids that are a *place* rather than a drawer (`talent-media` really means
 *     "the media section of my own profile") resolve to a real drawer plus the
 *     payload that lands on the right section.
 *
 * `notification-drawer-targets.static.test.ts` scans the whole repo for
 * emitted `targetDrawer:` literals and asserts each one resolves here to an id
 * that has a real `case` in `drawers.tsx`. That test is the reason this file
 * is data rather than scattered `if`s.
 *
 * Pure data + one pure function — no React, no "use client", so the static
 * test can import it in a plain node lane.
 */

import type { DrawerId } from "./state/drawer-ids";

export type NotificationDrawerTarget = {
  drawerId: DrawerId;
  /** Merged UNDER the notification's own targetPayload, so callers can override. */
  payload?: Record<string, unknown>;
};

/**
 * Notification `target_drawer` values that are not drawer ids on their own.
 * Keep every entry commented with WHY it is an alias — a bare mapping table
 * rots into guesswork.
 */
export const NOTIFICATION_DRAWER_ALIASES: Readonly<
  Record<string, NotificationDrawerTarget>
> = {
  // "Your photos" for a talent = the media section of their own profile.
  // `talent-profile-edit` forces mode "edit-self" inside the profile shell.
  "talent-media": {
    drawerId: "talent-profile-edit",
    payload: { mode: "edit-self", section: "media" },
  },
  // Mentions inside an inquiry thread: all three surfaces (workspace / talent /
  // client) render the SAME messaging-first workspace drawer.
  "talent-inquiry": { drawerId: "inquiry-workspace" },
  "client-inquiry": { drawerId: "inquiry-workspace" },
};

/**
 * Resolve a stored `target_drawer` string to a drawer + payload.
 *
 * Returns `null` for an unknown id so callers can fall back to a link or to
 * doing nothing, rather than opening a stub that says "Coming up next".
 */
export function resolveNotificationDrawerTarget(
  rawTargetDrawer: string | null | undefined,
  notificationPayload?: Record<string, unknown> | null,
): NotificationDrawerTarget | null {
  if (!rawTargetDrawer) return null;
  const alias = NOTIFICATION_DRAWER_ALIASES[rawTargetDrawer];
  if (alias) {
    return {
      drawerId: alias.drawerId,
      payload: { ...(alias.payload ?? {}), ...(notificationPayload ?? {}) },
    };
  }
  return {
    drawerId: rawTargetDrawer as DrawerId,
    payload: notificationPayload ?? undefined,
  };
}

/**
 * The two fields a notification list item needs, resolved. Exists so the
 * notifications drawer can spread one call instead of carrying the resolution
 * logic inline — that file sits exactly on its 800-line max-lines budget, and
 * a second copy of this logic is how the two dispatch paths drift apart.
 */
export function notificationDrawerFields(
  rawTargetDrawer: string | null | undefined,
  inquiryId?: string | null,
): { targetDrawer: DrawerId; targetPayload: Record<string, unknown> | undefined } {
  const resolved = resolveNotificationDrawerTarget(
    rawTargetDrawer ?? "notifications",
    inquiryId ? { inquiryId } : undefined,
  );
  return {
    targetDrawer: resolved?.drawerId ?? ("notifications" as DrawerId),
    targetPayload: resolved?.payload,
  };
}
