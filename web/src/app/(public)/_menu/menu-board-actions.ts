"use server";

/**
 * Live re-read of a workspace menu board, for the island to call after paint.
 *
 * WHY THIS EXISTS. `menu_board` is the odd one out among the four commerce
 * blocks: `ticket_picker`, `session_picker` and `reserve_table` all self-fetch
 * from the browser, so what a visitor reads is what the engine says now.
 * `menu_board` resolves once, server-side, into `dataSources.menuOfferings`,
 * and from then on the numbers on screen are frozen at render time. Two things
 * make that visible rather than theoretical:
 *
 *   • the page is cacheable and bfcache-restorable, so a back-button return can
 *     repaint a board captured before the kitchen 86'd a dish, and
 *   • stock is a live mirror the capacity RPCs maintain, so "3 left" decays on
 *     its own without anything on this page changing.
 *
 * The failure that produces is not a wrong label, it is a customer who fills in
 * name, email and phone and is refused at submit — the submit path DOES
 * re-resolve every line, which is why this was only ever a display defect and
 * never an oversell. It is still the worst kind of display defect: the one that
 * wastes the customer's time before telling them.
 *
 * WHAT WAS REFUSED. Converting the block to a pure self-fetching island like
 * the other three. The menu is the one commerce block whose CONTENT is the
 * page: item names and prices are what a restaurant is indexed on, and moving
 * them behind a client fetch would strip them out of the server HTML. So the
 * server render stays exactly as it is — first paint, SEO and no-JS all keep
 * the full list — and this action refreshes only what decays.
 *
 * TENANT ID COMES FROM THE CLIENT, deliberately, matching `submitMenuOrder`
 * next door. It is not a capability: every row this returns is already
 * `status = 'published'` and `moderation_state = 'approved'` — the exact set
 * that tenant's own public page serves to anonymous visitors. Passing a
 * different id buys the caller a page they could have loaded anyway.
 */

import {
  fetchWorkspaceMenuOfferings,
  type WorkspaceMenuOffering,
} from "@/lib/site-admin/server/native-data-block-sources";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Exactly the island's `MenuBoardOffering` shape, projected here rather than
 * shipping `WorkspaceMenuOffering` whole.
 *
 * `category` is the field this drops, and dropping it is the point: the
 * category strip is rendered SERVER-SIDE into anchored groups, so a refresh
 * that re-grouped would have to re-render markup the island does not own. The
 * island refreshes prices and stock inside the group structure the server
 * already committed to; a re-categorised menu is a page reload, not a poll.
 */
export type LiveMenuOffering = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: string;
  priceType: string;
  priceDisplay: string;
  kind: string;
  unitsLeft: number | null;
  allowPayInPerson: boolean;
};

export type LoadLiveMenuBoardResult =
  /**
   * `ok: false` carries no message. The island's answer to a failed refresh is
   * to keep showing the server-rendered board, not to blank it or to shout: a
   * board that says "could not refresh" over a perfectly good menu is worse
   * than a board that is thirty seconds old. The submit path is the backstop
   * that cannot be skipped.
   */
  { ok: true; offerings: LiveMenuOffering[] } | { ok: false };

function project(offering: WorkspaceMenuOffering): LiveMenuOffering {
  return {
    id: offering.id,
    title: offering.title,
    description: offering.description,
    amountCents: offering.amountCents,
    currency: offering.currency,
    priceType: offering.priceType,
    priceDisplay: offering.priceDisplay,
    kind: offering.kind,
    unitsLeft: offering.unitsLeft,
    allowPayInPerson: offering.allowPayInPerson,
  };
}

export async function loadLiveMenuBoard(input: {
  tenantId: string;
  locale?: string | null;
}): Promise<LoadLiveMenuBoardResult> {
  const tenantId = input?.tenantId?.trim() ?? "";
  if (!tenantId) return { ok: false };
  try {
    const rows = await fetchWorkspaceMenuOfferings(
      tenantId,
      input.locale?.trim() || "en",
    );
    return { ok: true, offerings: rows.map(project) };
  } catch (error) {
    logServerError("menu-board/loadLiveMenuBoard", error);
    return { ok: false };
  }
}
