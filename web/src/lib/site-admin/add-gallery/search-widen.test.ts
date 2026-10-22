import assert from "node:assert/strict";
import { test } from "node:test";

import { ADD_GALLERY_ITEMS, searchHitsFromOtherTabs } from "./registry";

test("TUL-1408: 'Book a session' is found by searching from the Blocks tab", () => {
  for (const query of ["sessions", "session", "book a seat"]) {
    const hits = searchHitsFromOtherTabs(ADD_GALLERY_ITEMS, {
      tab: "blocks",
      query,
      allowedTabs: ["blocks", "designs", "data"],
    });
    assert.ok(hits.some((i) => i.nativeKind === "session_picker"), `"${query}" finds session_picker`);
  }
});

test("TUL-1408: the widened search respects the surface's allowed tabs and ignores empty queries", () => {
  const noData = searchHitsFromOtherTabs(ADD_GALLERY_ITEMS, { tab: "blocks", query: "sessions", allowedTabs: ["blocks"] });
  assert.ok(!noData.some((i) => i.nativeKind === "session_picker"));
  assert.deepEqual(searchHitsFromOtherTabs(ADD_GALLERY_ITEMS, { tab: "blocks", query: "  ", allowedTabs: ["blocks", "data"] }), []);
  const own = searchHitsFromOtherTabs(ADD_GALLERY_ITEMS, { tab: "data", query: "sessions", allowedTabs: ["blocks", "data"] });
  assert.ok(!own.some((i) => i.tab === "data"), "never repeats the active tab");
});
