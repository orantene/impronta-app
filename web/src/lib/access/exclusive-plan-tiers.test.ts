import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  EXCLUSIVE_PLAN_KEYS,
  EXCLUSIVE_PLAN_TIERS,
  planAllowsExclusivity,
} from "./exclusive-plan-tiers";
import { registrationModesForPlan } from "./registration-modes";

/**
 * Exclusivity is a PAID capability, and until 2026-09-02 the set of plans that
 * could hold it was declared in four places with two different answers. These
 * tests pin the membership and make a fifth copy fail CI.
 */

test("the exclusive set is the paid roster tiers plus legacy", () => {
  assert.deepEqual([...EXCLUSIVE_PLAN_KEYS], [
    "studio",
    "agency",
    "network",
    "legacy",
  ]);
});

test("free and website can never hold exclusivity", () => {
  // Free is friend-link access with no commission, so there is nothing to be
  // exclusive about; website seats nobody at all.
  assert.equal(planAllowsExclusivity("free"), false);
  assert.equal(planAllowsExclusivity("website"), false);
});

test("null, empty and unknown plan values fail closed", () => {
  assert.equal(planAllowsExclusivity(null), false);
  assert.equal(planAllowsExclusivity(undefined), false);
  assert.equal(planAllowsExclusivity(""), false);
  assert.equal(planAllowsExclusivity("enterprise"), false);
});

test("the hub-network UI alias is accepted", () => {
  // Not a plan key — the admin shell's booking tabs and the Discover settings
  // page use it as a display alias for `network`, and raw strings from those
  // surfaces reach this predicate.
  assert.equal(planAllowsExclusivity("hub-network"), true);
  assert.ok(EXCLUSIVE_PLAN_TIERS.has("hub-network"));
});

/**
 * The bug this whole module exists to prevent: the admin mode-picker offering
 * `exclusive` to a plan the ownership resolver will not honour. Both sides now
 * read the same set, so the picker and the predicate cannot disagree.
 */
test("the registration mode-picker agrees with the resolver on every plan", () => {
  const plans = [
    "free",
    "website",
    "studio",
    "agency",
    "network",
    "legacy",
    "talent_basic",
    "talent_pro",
    "talent_portfolio",
  ];
  for (const plan of plans) {
    const offersExclusive = registrationModesForPlan(plan).includes("exclusive");
    assert.equal(
      offersExclusive,
      planAllowsExclusivity(plan),
      `mode-picker and exclusivity predicate disagree on "${plan}"`,
    );
  }
});

/**
 * Static guard: nobody re-declares the set locally.
 *
 * Three of the four original copies were local `new Set([...])` literals, one of
 * them justified by a comment claiming the canonical module did not export it
 * (it did). A grep is the only thing that catches the fifth copy.
 */
test("no module declares its own exclusive-tier set", () => {
  const root = join(process.cwd(), "src");
  const offenders: string[] = [];
  const declaration = /(?:const|let|var)\s+EXCLUSIVE_PLAN_[A-Z_]+\s*(?::[^=]+)?=/;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      // This module is allowed to declare it. That is the point.
      if (path.endsWith(join("access", "exclusive-plan-tiers.ts"))) continue;
      if (declaration.test(readFileSync(path, "utf8"))) {
        offenders.push(path.slice(root.length + 1));
      }
    }
  };
  walk(root);

  assert.deepEqual(
    offenders,
    [],
    "These files declare their own exclusive-tier set. Import " +
      "`planAllowsExclusivity` from @/lib/access/exclusive-plan-tiers instead.",
  );
});
