import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decideStationChange, mergeStationSpaceIds } from "./rent-station";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("the station joins each of the member's offerings without touching other resources", () => {
  test("adds the new station, keeps unrelated resources, no duplicates", () => {
    assert.deepEqual(mergeStationSpaceIds([A], null, B), [A, B]);
    assert.deepEqual(mergeStationSpaceIds([A, B], null, B), [A, B]);
  });
  test("moving to another station replaces ONLY the old station", () => {
    assert.deepEqual(mergeStationSpaceIds([A, B], B, C), [A, C]);
  });
  test("clearing the station removes only it", () => {
    assert.deepEqual(mergeStationSpaceIds([A, B], B, null), [A]);
    assert.deepEqual(mergeStationSpaceIds([A], B, null), [A]);
  });
  test("a resource the studio linked itself is never removed by a different station's change", () => {
    assert.deepEqual(mergeStationSpaceIds([A, C], B, null), [A, C]);
  });
});

describe("who may get a station", () => {
  const ok = { planStatus: "active", spaceInWorkspace: true, spaceBookable: true } as const;
  test("an accepted plan and a bookable space in this workspace", () => {
    assert.deepEqual(decideStationChange(ok), { ok: true });
    assert.deepEqual(decideStationChange({ ...ok, planStatus: "paused" }), { ok: true });
  });
  test("never before the member accepted, after the plan ended, or for a foreign / unbookable space", () => {
    for (const planStatus of ["proposed", "declined", "ended"]) assert.deepEqual(decideStationChange({ ...ok, planStatus }), { ok: false, reason: "plan_not_accepted" });
    assert.deepEqual(decideStationChange({ ...ok, spaceInWorkspace: false }), { ok: false, reason: "space_not_found" });
    assert.deepEqual(decideStationChange({ ...ok, spaceBookable: false }), { ok: false, reason: "space_not_bookable" });
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  test("assigning goes through the resource engine's own action, owner only", () => {
    const src = read("src/lib/service-hub/rent/rent-station-actions.ts");
    assert.match(src, /setOfferingResourcesAction\(/);
    assert.match(src, /await ownerGuard\(\)/);
  });
  test("the hold is released when the plan ends, by either side", () => {
    const actions = read("src/lib/service-hub/rent/rent-actions.ts");
    const matches = actions.match(/releaseStationHold\(/g) ?? [];
    assert.equal(matches.length, 2, "owner end and member end");
  });
});
