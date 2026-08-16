/**
 * talent-notification-rows.ts — the data half of `TalentNotificationsDrawer`.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The talent notifications drawer rendered a hardcoded `MOCK_TALENT_NOTIFS`
 * constant and never looked at `bridgeUserNotifications`, so a talent could not
 * see a single one of their own `user_notifications` rows, and no
 * `target_drawer` deep-link was ever dispatched from the talent surface. The
 * workspace-side `NotificationsDrawer` (drawers/light-07.tsx) had solved the
 * same problem already; this module is the talent counterpart of that mapping,
 * pulled out of `wave2.tsx` because that file is on the size ratchet and is
 * already ~4.6k lines.
 *
 * Pure data + pure functions — no React, no "use client" — so the drawer keeps
 * only rendering, and the mapping stays testable without a DOM.
 *
 * Target resolution is NOT re-implemented here. `notificationDrawerFields` in
 * `notification-drawer-targets.ts` is the one place a stored `target_drawer`
 * string becomes a destination; a third copy is exactly how the workspace and
 * talent dispatch paths would drift apart.
 */

import type { UserNotification } from "./data-bridge";
import type { DrawerId } from "./state/drawer-ids";
import { notificationDrawerFields } from "./notification-drawer-targets";

/**
 * Three categories, each with its own behavior contract:
 *
 *   action  — pipeline events that need a response. Sticky until the action is
 *             taken. Coral tone (your-move signal).
 *   system  — onboarding / setup guidance with an optional progress meter.
 *             Sticky until the milestone is reached. MOCK-ONLY: no real
 *             `user_notifications` row carries setup progress, so
 *             `talentNotifsFromBridge` never emits this category.
 *   update  — informational events already resolved. Dismissible.
 *
 * A `sticky` notification has no dismiss button: it lives until the underlying
 * state resolves. That is the difference between "a thing happened" and "you
 * have an open loop", and mixing them visually loses the signal.
 */
export type NotifCategory = "action" | "system" | "update";

/** Where a row's click lands. Absent = the row is not a deep link. */
export type TalentNotifTarget = {
  /** Drawer to open. Meaningless when `targetHref` is set. */
  targetDrawer: DrawerId;
  targetPayload: Record<string, unknown> | undefined;
  /** Set ONLY for page targets. When present, navigate instead of opening. */
  targetHref: string | undefined;
};

export type TalentNotif = {
  id: string;
  category: NotifCategory;
  icon: "mail" | "user" | "calendar" | "team" | "bolt" | "sparkle" | "check";
  tone?: "ink" | "coral" | "indigo" | "success" | "caution";
  title: string;
  sub?: string;
  when?: string;
  unread?: boolean;
  /** Sticky = no dismiss. Stays until the underlying action/state resolves. */
  sticky?: boolean;
  /** Optional progress (e.g. 84% profile complete, 1/4 setup steps). */
  progress?: { done: number; total: number; label?: string };
  /**
   * Optional @-mention. When set, the row shows a coral "@ you" pill after the
   * title, surfacing moments where someone tagged the talent in a thread.
   */
  mention?: { from: string };
  /** Resolved deep-link destination. Undefined for rows that go nowhere. */
  target?: TalentNotifTarget;
};

export const NOTIF_CATEGORY_META: Record<NotifCategory, { label: string; hint: string }> = {
  action: { label: "Action needed", hint: "stays here until you respond" },
  system: { label: "Setup", hint: "auto-clears when complete" },
  update: { label: "Updates", hint: "dismissible" },
};

/**
 * Standalone/demo fallback, used ONLY when the shell has no notifications
 * bridge at all (`bridgeUserNotifications === null` — dev dashboards, the
 * prototype harness). A real talent with zero rows gets the empty state, not
 * these. Same contract the workspace drawer keeps for its own mock.
 */
export const MOCK_TALENT_NOTIFS: TalentNotif[] = [
  // Action needed — sticky, coral, your move.
  { id: "tn1", category: "action", icon: "mail", tone: "coral", title: "Mango · Spring lookbook · new offer", sub: "€1,800 · awaiting your reply", when: "5h", unread: true, sticky: true },
  { id: "tn2", category: "action", icon: "calendar", tone: "coral", title: "Bvlgari hold expires in 2h", sub: "Editorial · jewelry · May 18-20", when: "2h", unread: true, sticky: true },
  // @-mention from coordinator — talent was tagged in a chat thread.
  // Action-needed because someone asked them directly.
  { id: "tn-m1", category: "action", icon: "mail", tone: "coral", title: "Ana Vega tagged you on Mango thread", sub: "\"@Marta, confirm wardrobe brief by EOD please\"", when: "1h", unread: true, sticky: true, mention: { from: "Ana Vega" } },
  // System / setup — sticky, indigo, has progress.
  { id: "tn3", category: "system", icon: "sparkle", tone: "indigo", title: "4 steps to get booked", sub: "Complete your profile to enter the inquiry pipeline", unread: true, sticky: true, progress: { done: 0, total: 4, label: "0 of 4 steps" } },
  { id: "tn4", category: "system", icon: "user", tone: "indigo", title: "Profile 84% complete", sub: "3 fields left · polaroids, rate card, showreel", unread: true, sticky: true, progress: { done: 84, total: 100, label: "84%" } },
  // Updates — dismissible × on hover.
  { id: "tn5", category: "update", icon: "check", tone: "success", title: "Vogue Italia booking confirmed", sub: "Tue, May 6 · €1,800", when: "1d" },
  { id: "tn6", category: "update", icon: "team", tone: "indigo", title: "Mango site referred 12 new views", sub: "+8 vs prior week", when: "2d" },
  // @-mention as informational — Carla thanked Marta in a closed thread.
  // Not action-needed but the talent should know they were tagged.
  { id: "tn-m2", category: "update", icon: "mail", tone: "indigo", title: "Carla Vega tagged you on Loewe thread", sub: "\"@Marta, thanks for bringing me on, was a dream day 🙏\"", when: "3d", mention: { from: "Carla Vega" } },
];

/**
 * Parse rough age strings ("5h", "2h ago", "1d", "today") to a numeric hours
 * value for sorting. Closer values = lower number. Handles both the mock's
 * bare "5h" and the bridge's "5h ago" / "just now" / "3d ago".
 */
export function parseAge(s: string): number {
  if (!s) return 0;
  const lower = s.toLowerCase();
  if (lower === "today" || lower === "now" || lower === "just now") return 0;
  const match = lower.match(/(\d+)\s*([mhd])/);
  if (!match) return 0;
  const n = parseInt(match[1]!, 10);
  if (match[2] === "d") return n * 24;
  if (match[2] === "m") return n / 60;
  return n;
}

/**
 * Category for a real row, inferred from the structured `kind` column.
 *
 * `approval` and `offer` are the two kinds that mean "someone is waiting on
 * you" — a release to approve, an offer to answer. Everything else is a recap
 * of something that already happened. `system` deliberately maps to `update`,
 * not to the `system` category: that group is labelled "Setup · auto-clears
 * when complete", which is true of the mock's onboarding meters and false of a
 * plan or billing notice.
 */
function categoryForKind(kind: UserNotification["kind"]): NotifCategory {
  return kind === "approval" || kind === "offer" ? "action" : "update";
}

const ICON_FOR_KIND: Record<UserNotification["kind"], TalentNotif["icon"]> = {
  message: "mail",
  offer: "bolt",
  booking: "calendar",
  payment: "check",
  approval: "check",
  profile: "user",
  system: "sparkle",
};

/** Success (sage) for the kinds that report a good outcome; neutral otherwise. */
const SUCCESS_KINDS: ReadonlySet<UserNotification["kind"]> = new Set(["booking", "payment"]);

/**
 * Map the shell's bridge rows onto the drawer's row shape.
 *
 * `adminBasePath` only matters for page targets on the WORKSPACE surface
 * (`/roster/applications`); talent page targets are host-local absolutes. It is
 * threaded through anyway so the resolution stays identical to the workspace
 * drawer's, which is the whole point of the shared module.
 */
export function talentNotifsFromBridge(
  rows: readonly UserNotification[],
  adminBasePath: string,
): TalentNotif[] {
  return rows
    .filter((n) => n.surface === "talent")
    .map((n) => {
      const category = categoryForKind(n.kind);
      return {
        id: n.id,
        category,
        icon: ICON_FOR_KIND[n.kind] ?? "bolt",
        tone:
          category === "action"
            ? ("coral" as const)
            : SUCCESS_KINDS.has(n.kind)
              ? ("success" as const)
              : ("indigo" as const),
        title: n.title,
        sub: n.body ?? undefined,
        when: n.ts,
        unread: !n.read,
        // Action rows stay until the loop closes; updates can be cleared.
        sticky: category === "action",
        // A null `target_drawer` genuinely has no destination. Resolving it
        // would hand back the workspace "notifications" drawer default, which
        // on the talent surface is a wrong door, so leave the row inert.
        target: n.targetDrawer
          ? notificationDrawerFields(n.targetDrawer, n.originInquiryId, adminBasePath)
          : undefined,
      };
    });
}
