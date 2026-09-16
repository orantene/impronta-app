import assert from "node:assert/strict";
import { test } from "node:test";
import { actionsMenuPlacement } from "./actions-menu-placement";

// D-144: the menu is bound to the room it opens into and opens where there is more.
test("a trigger on the bottom bar opens upward, bound to the room above it", () => {
  const p = actionsMenuPlacement({ triggerTop: 660, triggerBottom: 700, viewportHeight: 720 });
  assert.equal(p.side, "above");
  assert.ok(p.maxHeight <= 660 - 16, `maxHeight ${p.maxHeight} must fit above the trigger`);
  assert.ok(p.maxHeight >= 160);
});

test("a trigger near the top opens downward", () => {
  const p = actionsMenuPlacement({ triggerTop: 40, triggerBottom: 80, viewportHeight: 720 });
  assert.equal(p.side, "below");
  assert.ok(p.maxHeight <= 720 - 80 - 16);
});

test("the bound never drops under the minimum, so a tiny viewport still scrolls rather than hides", () => {
  const p = actionsMenuPlacement({ triggerTop: 90, triggerBottom: 130, viewportHeight: 200 });
  assert.equal(p.maxHeight, 160);
});
