import assert from "node:assert/strict";
import test from "node:test";

import { marketingConsentPatch } from "./consent-pure";

const nowIso = "2026-10-07T10:00:00.000Z";

test("unchanged choice leaves the stamp alone", () => {
  assert.deepEqual(marketingConsentPatch({ previous: true, next: true, nowIso }), {});
  assert.deepEqual(marketingConsentPatch({ previous: false, next: false, nowIso }), {});
});
test("turning on stamps now; turning off clears", () => {
  assert.deepEqual(marketingConsentPatch({ previous: false, next: true, nowIso }), { marketing_opt_in_at: nowIso });
  assert.deepEqual(marketingConsentPatch({ previous: true, next: false, nowIso }), { marketing_opt_in_at: null });
});
test("no stored row counts as off", () => {
  assert.deepEqual(marketingConsentPatch({ previous: null, next: true, nowIso }), { marketing_opt_in_at: nowIso });
  assert.deepEqual(marketingConsentPatch({ previous: undefined, next: false, nowIso }), {});
});
