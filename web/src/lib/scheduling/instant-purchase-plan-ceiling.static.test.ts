/**
 * F27: the server refuses instant booking above the talent's plan ceiling,
 * matching the public site. The purchase path is IO-heavy, so this guards the
 * wiring (the plan cap reaches readinessGaps; the staff desk stays exempt) and
 * the pure behaviour is covered in plan-ceiling-readiness.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { instantReadiness, readinessGaps } from "@/lib/talent/accepting-readiness";

const src = readFileSync(path.join(process.cwd(), "src/lib/scheduling/instant-purchase.ts"), "utf8");

test("instant-purchase loads the plan cap and passes it to readiness", () => {
  assert.match(src, /loadPlanAllowsInstant\(admin, \[input\.talentProfileId\]\)/);
  assert.match(src, /readinessGaps\(\{[\s\S]*?planAllowsInstant,[\s\S]*?\}\)/);
  assert.match(src, /staffDesk \|\| input\.agencyRouted === true\s*\?\s*undefined/);
});

test("a free-tier talent is not instant-ready even with hours, duration and payouts", () => {
  const gaps = readinessGaps({
    kind: "service",
    hasWorkingHours: true,
    durationMinutes: 60,
    takesMoneyOnline: true,
    payoutsReady: true,
    planAllowsInstant: false,
  });
  assert.equal(instantReadiness(gaps).instantReady, false);
});
