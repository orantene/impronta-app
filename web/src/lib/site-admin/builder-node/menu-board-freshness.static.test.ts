/**
 * menu-board-freshness.static.test.ts — defect 8, pinned at the wiring.
 *
 * `menu-board-stock.test.ts` proves the merge and reconcile RULES. Those rules
 * are worthless if nothing calls them, and that is precisely the shape the
 * defect had: every ingredient for a correct board existed (the fetch, the
 * stock mirror, the submit-time re-resolve) and the one missing wire was the
 * board asking again after paint.
 *
 * So these are source assertions, not behaviour assertions. A behaviour test
 * needs a DOM, a React renderer and a mocked server action, and would pass just
 * as happily against an island that refreshed on a timer nobody could observe.
 * What has to stay true is cheaper and more specific: the island calls the
 * action, it calls it on the three moments a stale board is visible, the action
 * reaches it by dynamic import (a static one drags `server-only` into the
 * fidelity and perf Node runners), and the renderer hands down the locale so a
 * Spanish board does not silently refresh into English.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(resolve(HERE, relative), "utf8");

const island = read("./menu-board-island.tsx");
const renderer = read("./render.tsx");
const action = read("../../../app/(public)/_menu/menu-board-actions.ts");

test("the island re-reads the board through the live action", () => {
  assert.match(
    island,
    /loadLiveMenuBoard/,
    "the board never asks again — this is the defect itself",
  );
});

test("the live action is imported dynamically, never statically", () => {
  assert.match(
    island,
    /await import\(\s*\n?\s*"@\/app\/\(public\)\/_menu\/menu-board-actions"/,
    "dynamic import is required: menu-board-actions is 'use server'",
  );
  assert.doesNotMatch(
    island,
    /^import .*menu-board-actions/m,
    "a static import pulls server-only into render.tsx and blows up the " +
      "fidelity and perf Node runners with MODULE_NOT_FOUND",
  );
});

test("the refresh fires on the three moments a board can be stale on screen", () => {
  assert.match(island, /visibilitychange/, "tab regain");
  assert.match(island, /pageshow/, "bfcache restore — the back button");
  assert.match(
    island,
    /useEffect\(\(\) => \{\s*\n\s*void refresh\(\);/,
    "mount",
  );
});

test("both listeners are removed on unmount", () => {
  // A menu board inside a builder canvas mounts and unmounts on every preset
  // switch. Leaked document listeners there refresh boards that are gone.
  assert.match(island, /removeEventListener\("visibilitychange"/);
  assert.match(island, /removeEventListener\("pageshow"/);
});

test("a submit clears the refresh floor so the retry reads the truth", () => {
  // The engine refusing on stock is proof the screen is behind it. Waiting out
  // the throttle would show the customer the same wrong board they just got
  // refused on.
  assert.match(island, /lastRefreshAt\.current = 0/);
});

test("the renderer passes the content locale down to the refresh", () => {
  assert.match(
    renderer,
    /<MenuBoardIsland[\s\S]{0,400}?locale=\{options\.contentLocale\?\.locale\}/,
    "without it a Spanish board refreshes into English titles",
  );
});

test("the renderer still emits the menu server-side", () => {
  // The fix must NOT have turned menu_board into a self-fetching island. Item
  // names and prices are what a restaurant is indexed on; moving them behind a
  // client fetch trades a display defect for an SEO one.
  assert.match(
    renderer,
    /const offerings = options\.dataSources\.menuOfferings \?\? \[\];/,
  );
  assert.match(renderer, /site-builder-node--menu-board-item-price/);
});

test("the action returns only published, approved rows for one tenant", () => {
  assert.match(
    action,
    /fetchWorkspaceMenuOfferings/,
    "reuse the server render's own fetch — a second query is a second set of " +
      "publication predicates to keep in step",
  );
  assert.match(action, /if \(!tenantId\) return \{ ok: false \};/);
});

test("a failed refresh is silent and carries no message to render", () => {
  // A red alert over a working menu every time a phone comes back onto a flaky
  // network is worse than a board that is thirty seconds old, and the submit
  // path re-resolves every line regardless.
  assert.doesNotMatch(
    action,
    /ok: false; error/,
    "the failure branch must not carry copy the island would be tempted to show",
  );
});
