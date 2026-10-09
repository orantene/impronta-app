import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-109 / TUL-303: the clock-dependent Today page must not render before
// hydration, and the dynamic() loading fallback must match that skeleton.
test("TodayPage gates BOTH agenda and legacy Today behind a hydration-stable skeleton", () => {
  const src = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
  assert.match(src, /useSyncExternalStore\(subscribeNever, \(\) => true, \(\) => false\)/);
  assert.match(src, /if \(!hydrated\) return <TodaySkeleton \/>/);
  assert.doesNotMatch(src, /bridgeTalentAgendaV2 && !hydrated/);
  assert.ok(src.indexOf("!hydrated") < src.indexOf("<AgendaTodayPage"));
});

test("talent shell dynamic() loading for Today matches the SSR skeleton (TUL-303)", () => {
  const shell = readFileSync(new URL("../../talent.tsx", import.meta.url), "utf8");
  assert.match(shell, /from ["']\.\/talent\/pages\/today-skeleton["']/);
  const todayLine = shell.split("\n").find((l) => l.includes("TalentTodayPage = dynamic"));
  assert.ok(todayLine, "TalentTodayPage dynamic() line");
  assert.match(todayLine!, /loading: \(\) => <TodaySkeleton \/>/);
  assert.doesNotMatch(todayLine!, /loading: \(\) => null/);
});
