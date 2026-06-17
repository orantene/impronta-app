import assert from "node:assert/strict";
import test from "node:test";

import { resolveGatedTalentProfileId } from "./talent-site-host-gate";

test("resolves the profile id only when host-context is talent_site", () => {
  assert.equal(
    resolveGatedTalentProfileId({
      hostContext: "talent_site",
      talentProfileId: "talent-42",
    }),
    "talent-42",
  );
});

test("a forged x-impronta-talent-profile on a NON-talent-site host does not resolve", () => {
  // Simulates a crafted request to an app/agency/hub host carrying a forged
  // x-impronta-talent-profile. After the proxy strips inbound copies, the only
  // host-context the app sees on these hosts is the real resolved kind — never
  // "talent_site". Even if a forged profile id leaked through, this gate blocks
  // it: the route 404s instead of rendering an arbitrary talent's Max site.
  for (const hostContext of ["app", "agency", "hub", "marketing", null, undefined, ""]) {
    assert.equal(
      resolveGatedTalentProfileId({
        hostContext,
        talentProfileId: "11111111-2222-3333-4444-555555555555",
      }),
      null,
      `host-context "${String(hostContext)}" must not resolve a talent`,
    );
  }
});

test("talent_site host-context with no profile id yields null (never a blank render)", () => {
  assert.equal(
    resolveGatedTalentProfileId({ hostContext: "talent_site", talentProfileId: null }),
    null,
  );
  assert.equal(
    resolveGatedTalentProfileId({ hostContext: "talent_site", talentProfileId: "  " }),
    null,
  );
});

test("trims surrounding whitespace on the resolved profile id", () => {
  assert.equal(
    resolveGatedTalentProfileId({
      hostContext: " talent_site ",
      talentProfileId: " talent-7 ",
    }),
    "talent-7",
  );
});
