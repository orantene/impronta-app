/**
 * live-view-href.test.ts — the editor's "Open live page" URL and the
 * request-side flag it sets.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/edit-mode/live-view-href.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { liveViewHrefFor, searchRequestsLiveView } from "./live-view-href";

test("liveViewHrefFor drops ?edit and adds ?live=1, keeping everything else", () => {
  assert.equal(
    liveViewHrefFor("https://improntamodels.com/?edit=1"),
    "https://improntamodels.com/?live=1",
  );
  assert.equal(
    liveViewHrefFor("http://localhost:3123/w/impronta/about?edit=1&lang=es#team"),
    "http://localhost:3123/w/impronta/about?lang=es&live=1#team",
  );
});

test("searchRequestsLiveView is exact: only live=1 counts", () => {
  assert.equal(searchRequestsLiveView("?live=1"), true);
  assert.equal(searchRequestsLiveView("?edit=1&live=1"), true);
  assert.equal(searchRequestsLiveView("?live=0"), false);
  assert.equal(searchRequestsLiveView("?live"), false);
  assert.equal(searchRequestsLiveView(""), false);
  assert.equal(searchRequestsLiveView(null), false);
});
