import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  planGrantsCapability,
  packagedCapabilitiesForPlan,
  entitlementKey,
  type PlanEntitlementMap,
} from "./plan-capabilities";
import type { CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";

const CAP = "view_dashboard" as CapabilityKey;
const OTHER = "manage_billing" as CapabilityKey;

function matrix(entries: [PlanKey, CapabilityKey, boolean][]): PlanEntitlementMap {
  return new Map(entries.map(([p, c, v]) => [entitlementKey(p, c), v]));
}

/**
 * The behaviour-neutrality contract. Track C moved entitlements from code into
 * `public.plan_capabilities`, and the whole safety argument for shipping that
 * without a packaging pass is that an empty or unreachable matrix behaves
 * EXACTLY like the permissive code table it replaced. These two tests are that
 * argument, executable.
 */
test("an empty matrix grants everything — the pre-Track-C default", () => {
  const empty: PlanEntitlementMap = new Map();
  for (const plan of ["free", "website", "studio", "agency", "network", "legacy"] as PlanKey[]) {
    assert.equal(planGrantsCapability(plan, CAP, empty), true);
  }
});

test("an absent matrix (load failed) grants everything", () => {
  // `loadPlanEntitlements` returns an empty map on any read failure, and
  // callers may omit the argument entirely. Both must be permissive: a slow or
  // unreachable Supabase must never lock every tenant out of the product.
  assert.equal(planGrantsCapability("agency", CAP), true);
  assert.equal(planGrantsCapability("free", CAP, undefined), true);
});

test("an explicit false withholds, and only for that exact cell", () => {
  const m = matrix([["free", CAP, false]]);
  assert.equal(planGrantsCapability("free", CAP, m), false);
  // Same capability, different plan → not packaged → granted.
  assert.equal(planGrantsCapability("agency", CAP, m), true);
  // Same plan, different capability → not packaged → granted.
  assert.equal(planGrantsCapability("free", OTHER, m), true);
});

test("an explicit true grants", () => {
  const m = matrix([["free", CAP, true]]);
  assert.equal(planGrantsCapability("free", CAP, m), true);
});

test("a missing row inside a NON-empty matrix is still granted", () => {
  // The important half of fail-open: once packaging begins, a capability nobody
  // has gotten to yet must not become an outage on a shipped feature.
  const m = matrix([["free", OTHER, false]]);
  assert.equal(planGrantsCapability("free", CAP, m), true);
});

test("plan and capability cannot collide across the key separator", () => {
  // Keys are `${plan} ${capability}`. A capability containing a space would
  // alias onto another cell; the registry has none, and this pins that.
  const m = matrix([["free", CAP, false]]);
  assert.equal(m.has("free view_dashboard"), true);
  assert.equal(planGrantsCapability("free" as PlanKey, CAP, m), false);
});

test("packagedCapabilitiesForPlan lists only that plan, sorted", () => {
  const m = matrix([
    ["agency", OTHER, true],
    ["agency", CAP, false],
    ["free", CAP, false],
  ]);
  assert.deepEqual(packagedCapabilitiesForPlan("agency", m), [
    { capability: "manage_billing", included: true },
    { capability: "view_dashboard", included: false },
  ]);
});

test("packagedCapabilitiesForPlan does not leak a plan whose name is a prefix", () => {
  // `talent_pro` is a prefix of nothing today, but `free` vs a future
  // `free_trial` would alias without the trailing space in the prefix.
  const m = new Map([
    ["free " + CAP, false],
    ["free_trial " + CAP, false],
  ]);
  assert.deepEqual(packagedCapabilitiesForPlan("free", m), [
    { capability: "view_dashboard", included: false },
  ]);
});

test("the entitlement loader fails OPEN when the cache wrapper throws", () => {
  // `unstable_cache` throws from the WRAPPER, not the body:
  //   Invariant: incrementalCache missing in unstable_cache
  // so the loader body's own try/catch never sees it. `authorize()` has no
  // try/catch, and fail-open is this layer's whole contract: a missing row
  // means GRANTED. Without a catch on the exported loader, an entitlement
  // check outside a request context denies every gated action instead.
  //
  // Read statically because the store imports `server-only` and cannot be
  // loaded in this lane. Weaker than injecting a throwing loader, and it is
  // what the module currently allows.
  const src = readFileSync(
    new URL("./plan-entitlements-store.ts", import.meta.url),
    "utf8",
  );
  const exported = src.slice(src.indexOf("export const loadPlanEntitlements"));
  assert.match(exported, /try \{/, "the exported loader must catch");
  assert.match(exported, /return new Map\(\)/, "and fail open, not rethrow");
});
