/**
 * TUL-1276: the Today "Finish setting up your profile" ring showed 70% in ES
 * and 45% in EN for the same talent while Profile showed 70% in both. The ring
 * fell back to a second model (the agency checklist score) whenever the
 * website-eligibility reads had not settled, and the language switch reloads
 * the page, so one language was read warm and the other cold. The ring now
 * reads the same pure summary as Profile's quality card and never the other
 * model.
 *
 *   cd web && npm run test:wt -- src/lib/talent/today-setup-ring.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { getWebsiteEligibility, inferWebsiteWorkingMode } from "./website-eligibility";
import { summarizeEligibility } from "./profile-editor-sections";
import { todaySetupRingLabel, todaySetupRingPercent } from "./today-setup-ring";

// The qa-journeys-talent shape: everything but photos (bookings mode) = 70%.
const facts = {
  hasNameAndWork: true,
  photoCount: 2,
  bookableCount: 3,
  hasIntro: true,
  hasAvailability: true,
  hasPlace: true,
};

test("same facts give the same ring percent in en and es, equal to Profile's", () => {
  const stylist = getWebsiteEligibility({ ...facts, workingMode: inferWebsiteWorkingMode("Hair Stylist") });
  assert.equal(summarizeEligibility(stylist).percent, 70);
  assert.equal(todaySetupRingPercent(stylist), 70);
  // The bridge hands the EN trade label, falling back to ES when a term has no
  // EN name: a paired label must land on the same mode and the same percent.
  for (const [enLabel, esLabel] of [
    ["Dancer", "Bailarina"],
    ["Actress", "Actriz"],
    ["Musician", "Música"],
    ["Cook", "Cocinera"],
  ] as const) {
    const en = getWebsiteEligibility({ ...facts, workingMode: inferWebsiteWorkingMode(enLabel) });
    const es = getWebsiteEligibility({ ...facts, workingMode: inferWebsiteWorkingMode(esLabel) });
    assert.equal(todaySetupRingPercent(es), todaySetupRingPercent(en), `${enLabel} / ${esLabel}`);
    assert.equal(todaySetupRingPercent(en), summarizeEligibility(en).percent);
  }
});

test("unsettled facts show a neutral ring, never another model's score", () => {
  const loading = getWebsiteEligibility({ ...facts, bookableCount: null });
  assert.equal(todaySetupRingPercent(loading), null);
  assert.equal(todaySetupRingLabel(null), "·");
  assert.equal(todaySetupRingLabel(70), "70%");
});

test("Today's ring reads the shared helper, not the agency checklist fallback", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/pages/TodayPage.tsx"),
    "utf8",
  );
  const start = src.indexOf("const onboardingCompleteness = isFreshSelf");
  assert.ok(start > 0, "onboardingCompleteness block not found");
  const block = src.slice(start, src.indexOf(": null;", start) + ": null;".length);
  assert.match(block, /percent: todaySetupRingPercent\(websiteEligibility\)/);
  assert.doesNotMatch(block, /percent: completionPercent/);
  // The prototype estimate may still feed the missing chips, never the percent.
  assert.doesNotMatch(block, /: computeProfileCompleteness\([^)]*\)\s*:/);
  assert.match(src, /\{todaySetupRingLabel\(onboardingCompleteness\.percent\)\}/);
});
