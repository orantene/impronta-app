/**
 * notification-drawer-targets.ts — the ONE place a notification's stored
 * `target_drawer` string becomes a real destination.
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
 *   • Ids whose real destination is a PAGE, not a drawer at all, resolve to a
 *     `kind: "page"` target the dispatch sites navigate to. Three ids were in
 *     that class and were parked in the static test's allow-list until now:
 *     `money`, `talent-reach`, `roster-applications`.
 *
 * `notification-drawer-targets.static.test.ts` scans the whole repo for
 * emitted `targetDrawer:` literals and asserts each one resolves here to an id
 * that has a real `case` in `drawers.tsx` (or to a page target). That test is
 * the reason this file is data rather than scattered `if`s.
 *
 * Pure data + pure functions — no React, no "use client", so the static test
 * can import it in a plain node lane.
 */

import type { DrawerId } from "./state/drawer-ids";

export type NotificationDrawerTarget = {
  kind: "drawer";
  drawerId: DrawerId;
  /** Merged UNDER the notification's own targetPayload, so callers can override. */
  payload?: Record<string, unknown>;
};

/**
 * A destination that is a routed PAGE, not a drawer.
 *
 * `surface` decides how `path` becomes an href:
 *   • "workspace" — `path` is RELATIVE to the workspace admin base, because
 *     that base is host-dependent: `/admin` on a branded host, `/<slug>/admin`
 *     on the shared app host (see `adminBasePath` in state/context.tsx).
 *   • "talent" — `path` is host-local and ABSOLUTE. The talent surface has no
 *     tenant-scoped routes: every `/<slug>/talent/*` page 308s to `/talent/*`
 *     (lib/talent/legacy-talent-redirect.ts), so prefixing a slug would only
 *     add a redirect hop.
 */
export type NotificationPageTarget = {
  kind: "page";
  surface: "workspace" | "talent";
  path: string;
};

export type NotificationTarget = NotificationDrawerTarget | NotificationPageTarget;

/**
 * Notification `target_drawer` values that are not drawer ids on their own.
 * Keep every entry commented with WHY it is an alias — a bare mapping table
 * rots into guesswork.
 */
export const NOTIFICATION_DRAWER_ALIASES: Readonly<
  Record<string, Omit<NotificationDrawerTarget, "kind">>
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
 * Notification `target_drawer` values whose destination is a routed page.
 *
 * These three were emitted for months and resolved to NOTHING, so every one of
 * them opened the "Coming up next" stub. They were listed in the static test's
 * `KNOWN_UNRESOLVED_OUT_OF_SCOPE` allow-list; that list is now empty and the
 * test hard-fails on a regression.
 */
export const NOTIFICATION_PAGE_TARGETS: Readonly<Record<string, NotificationPageTarget>> = {
  // lib/payments/payout-reversal-notify.ts — "A payout was reversed" and
  // "A payout is on hold". Both are payout-rail facts, and `/talent/payouts` is
  // the payout-rail surface: it renders `PayoutsShell` with the SERVER-loaded
  // held totals (`bridgeTalentHeldPayouts`, from the talent layout) plus the
  // Connect status the talent has to act on.
  //
  // Deliberately NOT the look-alike `talent-payouts` DRAWER: it renders the
  // same `PayoutsShell` body but hardcodes `heldPayouts={null}`
  // (talent-drawers/monetization.tsx), so aliasing there would satisfy the
  // static test while hiding the exact fact the notification is about.
  //
  // Deliberately NOT `/talent/money` either: its `EarningsLedger` statuses are
  // paid / invoiced / pending / confirmed — it has no held or reversed state.
  money: { kind: "page", surface: "talent", path: "/talent/payouts" },

  // lib/talent/apply-actions.ts — "Application approved!" / "Application
  // update". `reach` is a LEGACY TalentPage: `talentPageToSegment()` maps
  // reach -> "money" and `/talent/reach` permanentRedirect()s to `/talent/money`.
  // We pin the redirect's DESTINATION, never the hop. `/talent/money` is the
  // right surface on its own merits too: it renders `MoneyAgencyCards`, the
  // talent's agency-relationship list, which is what an approved application
  // changes.
  "talent-reach": { kind: "page", surface: "talent", path: "/talent/money" },

  // lib/notifications/catalog-entries-reviews.ts — "You received a review from
  // a client" (review.published → the talent). `/talent/reviews` is a real
  // first-class talent route: it renders `TalentPageRouteSyncer page="reviews"`
  // → `talent.tsx case "reviews"` → `ReviewsPage`, which loads the talent's own
  // received reviews through `loadOwnerReceivedReviewsAction` and shows the
  // standing header + per-review reply/report. NOT a redirect hop: unlike
  // `reach`, `talentPageToSegment()` maps reviews → "reviews" one-to-one.
  //
  // Deliberately NOT the `reviews-moderation` drawer: that is the WORKSPACE
  // staff moderation queue (emitted by lib/reviews/review-actions.ts for
  // admins), and a talent has no access to it.
  "talent-reviews": { kind: "page", surface: "talent", path: "/talent/reviews" },

  // lib/talent/apply-actions.ts — "New roster application" to workspace staff.
  // Real tenant-scoped page: it lists pending + decided applications and wires
  // approve/reject to `decideTalentApplication`. Relative to `adminBasePath`
  // so it resolves to `/admin/roster/applications` on a branded host and
  // `/<slug>/admin/roster/applications` on the shared app host.
  "roster-applications": { kind: "page", surface: "workspace", path: "/roster/applications" },
};

/**
 * Resolve a stored `target_drawer` string to a drawer + payload, or to a page.
 *
 * Returns `null` for an empty id so callers can fall back to a link or to
 * doing nothing, rather than opening a stub that says "Coming up next".
 */
export function resolveNotificationDrawerTarget(
  rawTargetDrawer: string | null | undefined,
  notificationPayload?: Record<string, unknown> | null,
): NotificationTarget | null {
  if (!rawTargetDrawer) return null;
  const page = NOTIFICATION_PAGE_TARGETS[rawTargetDrawer];
  if (page) return page;
  const alias = NOTIFICATION_DRAWER_ALIASES[rawTargetDrawer];
  if (alias) {
    return {
      kind: "drawer",
      drawerId: alias.drawerId,
      payload: { ...(alias.payload ?? {}), ...(notificationPayload ?? {}) },
    };
  }
  return {
    kind: "drawer",
    drawerId: rawTargetDrawer as DrawerId,
    payload: notificationPayload ?? undefined,
  };
}

/**
 * Turn a page target into a concrete href.
 *
 * `adminBasePath` is the shell's host-resolved workspace base (`/admin` on a
 * branded host, `/<slug>/admin` otherwise). Talent paths ignore it — the talent
 * surface is host-local.
 */
export function notificationTargetHref(
  target: NotificationPageTarget,
  adminBasePath: string,
): string {
  if (target.surface !== "workspace") return target.path;
  const base = adminBasePath.endsWith("/") ? adminBasePath.slice(0, -1) : adminBasePath;
  return `${base}${target.path}`;
}

/**
 * Derive the workspace admin base path from the CURRENT pathname.
 *
 * The top-bar bell self-loads OUTSIDE `AdminShellProvider`, so it cannot read
 * `adminBasePath` off the shell context. Reading it back off the URL gives the
 * same answer, because that context value is what produced the URL: a branded
 * host serves `/admin/...` and the shared app host serves `/<slug>/admin/...`.
 */
export function adminBasePathFromPathname(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("admin");
  if (at === 1) return `/${parts[0]}/admin`;
  return "/admin";
}

/**
 * The fields a notification list item needs, resolved. Exists so the
 * notifications drawer can spread one call instead of carrying the resolution
 * logic inline — that file sits exactly on its 800-line max-lines budget, and
 * a second copy of this logic is how the two dispatch paths drift apart.
 *
 * `targetHref` is set ONLY for page targets. When it is present the caller must
 * navigate to it instead of calling `openDrawer` — `targetDrawer` is then a
 * meaningless placeholder kept only so the item type stays total.
 */
export function notificationDrawerFields(
  rawTargetDrawer: string | null | undefined,
  inquiryId?: string | null,
  adminBasePath = "/admin",
): {
  targetDrawer: DrawerId;
  targetPayload: Record<string, unknown> | undefined;
  targetHref: string | undefined;
} {
  const resolved = resolveNotificationDrawerTarget(
    rawTargetDrawer ?? "notifications",
    inquiryId ? { inquiryId } : undefined,
  );
  if (resolved?.kind === "page") {
    return {
      targetDrawer: "notifications" as DrawerId,
      targetPayload: undefined,
      targetHref: notificationTargetHref(resolved, adminBasePath),
    };
  }
  return {
    targetDrawer: resolved?.drawerId ?? ("notifications" as DrawerId),
    targetPayload: resolved?.payload,
    targetHref: undefined,
  };
}
