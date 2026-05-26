import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./TalentProfileShellDrawer.tsx", import.meta.url), "utf8");

test("profile field category rail nests under Services instead of a standalone Details row", () => {
  assert.match(
    source,
    /ownsProfileFieldGroups = s === "services"/,
    "Services should own the nested dynamic field category list",
  );
  assert.match(
    source,
    /aria-label="Service detail categories"/,
    "Nested category group should be labelled as service detail categories",
  );
  assert.match(
    source,
    /setActiveSection\("profile_fields"\)/,
    "Nested category clicks should still open the resolver-backed profile_fields section",
  );
  assert.doesNotMatch(
    source,
    /ids: \["identity", "location", "about", "services", "profile_fields"\]/,
    "profile_fields should not render as a top-level left rail item",
  );
});

test("legacy extra details rail item also nests under Services", () => {
  assert.match(
    source,
    /ownsLegacyRefinement = s === "services" && visible\("refinement"\)/,
    "Services should own the legacy Extra details item while the old refinement path is still present",
  );
  assert.match(
    source,
    /setActiveSection\("refinement"\)/,
    "Nested Extra details click should still open the legacy refinement section",
  );
  assert.doesNotMatch(
    source,
    /ids: \["credits", "social_proof", "verifications", "refinement"\]/,
    "refinement should not render as a top-level Proof rail item",
  );
});
