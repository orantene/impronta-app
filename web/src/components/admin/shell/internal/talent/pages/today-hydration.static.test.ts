import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-109: the clock-dependent Today page must not render before hydration.
test("TodayPage gates the agenda page behind a hydration-stable skeleton", () => {
  const src = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
  assert.match(src, /useSyncExternalStore\(subscribeNever, \(\) => true, \(\) => false\)/);
  assert.match(src, /bridgeTalentAgendaV2 && !hydrated\) return <TodaySkeleton \/>/);
  assert.ok(src.indexOf("!hydrated") < src.indexOf("<AgendaTodayPage"));
});
