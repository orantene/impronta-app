import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { commissionDisplay } from "./commission-display";

describe("commissionDisplay", () => {
  it("an unknown rate (real roster agency) shows nothing, never 0%", () => {
    assert.deepEqual(commissionDisplay(null), { kind: "unknown" });
    assert.deepEqual(commissionDisplay(undefined), { kind: "unknown" });
    assert.deepEqual(commissionDisplay(Number.NaN), { kind: "unknown" });
  });
  it("a real rate of 0 is 0, a real rate is a percentage", () => {
    assert.deepEqual(commissionDisplay(0), { kind: "none" });
    assert.deepEqual(commissionDisplay(0.15), { kind: "rate", pct: 15 });
  });
  it("agency.tsx no longer defaults the rate to 0", () => {
    const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent-drawers/agency.tsx"), "utf8");
    assert.doesNotMatch(src, /commissionRate\s*=\s*[^;]*\?\?\s*0/);
    assert.match(src, /commissionDisplay\(/);
  });
});

describe("rules of hooks: hooks sit above the early returns", () => {
  it("TalentBookingDetailDrawer calls useRouter/useEffect before its not-found return", () => {
    const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent-drawers/today.tsx"), "utf8");
    const fn = src.slice(src.indexOf("export function TalentBookingDetailDrawer"));
    assert.ok(fn.indexOf("useRouter()") > 0);
    assert.ok(fn.indexOf("useEffect(") < fn.indexOf("RecordNotFoundDrawer"));
    assert.ok(fn.indexOf("useRouter()") < fn.indexOf("RecordNotFoundDrawer"));
  });
});
