/**
 * page-ids.ts — the one bridge between the destination registry and the admin
 * shell's `WorkspacePage` union.
 *
 * WHY IT IS A SEPARATE FILE
 * ─────────────────────────
 * Three callers need the same answer and cannot share a module today:
 *
 *   - `internal/state/fixtures.ts` builds `WORKSPACE_PAGES` and `PAGE_META`,
 *     and is `"use client"`.
 *   - `app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts` is read by
 *     the SERVER layout and by `lib/saas/workspace-type.test.ts`, a plain node
 *     test — so it may never pull the `"use client"` shell graph.
 *   - the sidebar hook needs the same page id for `setPage`.
 *
 * So the shared resolution lives here, beside the registry, with the registry's
 * own purity rule: the only runtime import is `./destinations`, which itself has
 * none. `WorkspacePage` comes in as a TYPE and is erased.
 *
 * SEGMENT vs PAGE
 * ───────────────
 * The registry describes URL segments. The shell describes pages. They are the
 * same vocabulary — `WorkspacePage` is `DestinationId` plus exactly the
 * registry's aliases — but the mapping is not the identity, because several
 * destinations are BUILT and still render at their old segment (`catalog` at
 * `/admin/menu`, `people` at `/admin/roster`, …). Ask `liveWorkspacePage`,
 * never `destination.segment`.
 */

import {
  DESTINATION_IDS,
  DESTINATION_LIST,
  liveRouteSegment,
  resolveDestination,
  type Destination,
} from "./destinations";
import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";

/**
 * Every id the shell may hold: the registry's destination ids plus every legacy
 * alias it still answers to. `page-ids.test` proves this set is exactly the
 * `WorkspacePage` union, so the predicate below is a checked fact rather than
 * an assertion.
 */
const WORKSPACE_PAGE_ID_SET: ReadonlySet<string> = new Set<string>([
  ...DESTINATION_IDS,
  ...DESTINATION_LIST.flatMap((d) => d.aliases),
]);

export function isWorkspacePage(value: string): value is WorkspacePage {
  return WORKSPACE_PAGE_ID_SET.has(value);
}

/** Every valid page id, destinations first, then the legacy aliases. */
export const WORKSPACE_PAGE_IDS: readonly WorkspacePage[] = [
  ...WORKSPACE_PAGE_ID_SET,
].filter(isWorkspacePage);

/**
 * The page a destination renders as TODAY, or `null` when it has no route at
 * all yet (`mywork` — a real state, not a missing value).
 *
 * `""` is the admin root, whose page id is `overview`.
 */
export function liveWorkspacePage(destination: Destination): WorkspacePage | null {
  const segment = liveRouteSegment(destination);
  if (segment === null) return null;
  if (segment === "") return "overview";
  return isWorkspacePage(segment) ? segment : null;
}

/**
 * Legacy ids that keep their OWN body and must not be folded into the
 * destination that claims them as an alias.
 *
 * `payouts` is the only one. The registry folds it into `payments`, whose live
 * route is `/admin/financials` — but `/admin/payouts` renders `<PayoutsPage/>`
 * in the SPA today (Stripe Connect onboarding + the base reservation fee), and
 * that route has no canonical matcher behind it. Collapsing it would hand the
 * page router a case it does not have and paint a blank screen. When Payments
 * absorbs Payouts for real, delete this set and the `payouts` router case
 * together.
 */
const LEGACY_PAGES_WITH_THEIR_OWN_BODY: ReadonlySet<string> = new Set<string>([
  "payouts",
]);

/**
 * A raw URL segment (or a page id) to the page the shell should open.
 *
 * Total by design: anything the registry does not describe lands on Overview,
 * which is what every admin URL outside the registry (activity-log, triage,
 * bookings, account, …) has always done — those render through a canonical
 * matcher, and the SPA page underneath them is Overview.
 */
export function resolveWorkspacePageId(raw: string): WorkspacePage {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return "overview";
  if (LEGACY_PAGES_WITH_THEIR_OWN_BODY.has(normalized) && isWorkspacePage(normalized)) {
    return normalized;
  }
  const destination = resolveDestination(normalized);
  if (destination) {
    const page = liveWorkspacePage(destination);
    // `null` means the destination has no route yet; Overview is where a URL
    // for it has to land, because there is nothing else to show.
    return page ?? "overview";
  }
  return isWorkspacePage(normalized) ? normalized : "overview";
}

/**
 * The nav page list: one entry per BUILT destination, at the page it renders
 * as today, in registry order. This is what `WORKSPACE_PAGES` is.
 *
 * Unbuilt destinations are absent on purpose. `projects` and `payments` have a
 * fallback so their URL lands somewhere, but a nav entry for them would put a
 * second row in front of a page that already has one.
 */
export function navWorkspacePages(): WorkspacePage[] {
  const pages: WorkspacePage[] = [];
  for (const destination of DESTINATION_LIST) {
    if (!destination.built) continue;
    const page = liveWorkspacePage(destination);
    if (page === null || pages.includes(page)) continue;
    pages.push(page);
  }
  return pages;
}
