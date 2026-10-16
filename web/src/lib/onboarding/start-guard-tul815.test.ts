import assert from "node:assert/strict";
import test from "node:test";

import { FLOW_STEP_OF } from "./flow";
import { renderSetup, baseEssentials } from "./start-setup-render-helper";
import { setupIssues } from "./setup";

test("TUL-815: the time zone is part of step 3, which comes before the email (save) and code screens", () => {
  assert.ok(FLOW_STEP_OF.setup < FLOW_STEP_OF.save);
  assert.equal(FLOW_STEP_OF.save, FLOW_STEP_OF.code);
});

for (const locale of ["es", "en"] as const) {
  test(`TUL-815 (${locale}): outside Mexico step 3 asks for the zone and preselects the browser's zone`, () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Chicago";
    try {
      const html = renderSetup(locale, { country: "US" });
      assert.ok(html.includes('data-testid="onb-timezone"'));
      assert.match(html, /<option value="America\/Chicago" selected/);
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
  });

  test(`TUL-815 (${locale}): a saved zone beats the browser's`, () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Chicago";
    try {
      const html = renderSetup(locale, { country: "US", essentials: baseEssentials({ timezone: "Europe/London" }) });
      assert.match(html, /<option value="Europe\/London" selected/);
      assert.doesNotMatch(html, /<option value="America\/Chicago" selected/);
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
  });

  test(`TUL-815 (${locale}): inside Mexico the zone is never asked`, () => {
    assert.ok(!renderSetup(locale, { country: "MX" }).includes('data-testid="onb-timezone"'));
  });
}

test("TUL-815: leaving step 3 without a zone outside Mexico is blocked, so email never runs without one", () => {
  const e = baseEssentials({ services: [{ name: "x" }] as never, hours: { "0": [], "1": [{ startMin: 540, endMin: 600 }], "2": [], "3": [], "4": [], "5": [], "6": [] }, place: { mode: "client", area: null } });
  assert.deepEqual(setupIssues({ choice: "myself", essentials: e, country: "US", providerEmailDraft: "" }), ["timezone"]);
  assert.deepEqual(setupIssues({ choice: "myself", essentials: { ...e, timezone: "America/Chicago" }, country: "US", providerEmailDraft: "" }), []);
});
