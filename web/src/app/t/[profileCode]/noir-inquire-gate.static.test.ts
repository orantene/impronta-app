/**
 * WSF §8 (#2435): with her intake closed (askEntry "closed"/"unavailable"),
 * the Noir fallback anchor must not say "Inquire about {name}". Source-text
 * scan: Noir is a server component graph node:test cannot render.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const noir = readFileSync(
  fileURLToPath(new URL("./_noir/NoirProfileLayout.tsx", import.meta.url)),
  "utf8",
);

test("Noir fallback CTA is gated by askEntryPointsVisible (agency hosts keep it)", () => {
  assert.match(noir, /askEntryPointsVisible\(askEntry\)/);
  assert.match(noir, /hostCtxKind === "agency" \|\| askEntry == null \|\| askEntryPointsVisible\(askEntry\)/);
  assert.match(noir, /!bookable && !inquireOpen \? null :/);
});
