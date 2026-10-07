import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveHowYouWork,
  movesFor,
  runHowYouWorkMove,
  type HowYouWorkFacts,
  type HowYouWorkMove,
  type MoveDeps,
} from "./how-you-work";

const base: HowYouWorkFacts = {
  hasTalentProfile: false, ownsWorkspace: false, bookable: false,
  tenantId: null, tenantSlug: null, talentProfileId: null, displayName: "Nia",
};
const myself: HowYouWorkFacts = { ...base, hasTalentProfile: true, talentProfileId: "tp1" };
const studio: HowYouWorkFacts = { ...base, ownsWorkspace: true, tenantId: "t1", tenantSlug: "acme" };
const both: HowYouWorkFacts = { ...studio, hasTalentProfile: true, talentProfileId: "tp1", bookable: true };
const stopped: HowYouWorkFacts = { ...both, bookable: false };

test("derived current choice", () => {
  assert.equal(deriveHowYouWork(myself), "myself");
  assert.equal(deriveHowYouWork(studio), "studio");
  assert.equal(deriveHowYouWork(both), "both");
  assert.equal(deriveHowYouWork(stopped), "studio");
});

test("moves available per choice", () => {
  assert.deepEqual(movesFor(myself), ["open_studio"]);
  assert.deepEqual(movesFor(studio), ["add_provider"]);
  assert.deepEqual(movesFor(stopped), ["resume_bookings"]);
  assert.deepEqual(movesFor(both), ["stop_bookings"]);
  assert.deepEqual(movesFor(base), []);
});

function deps(calls: string[], fail?: string): MoveDeps {
  const step = <T,>(name: string, ok: T) => async () => {
    calls.push(name);
    return name === fail ? ({ ok: false, error: name } as const) : ({ ok: true, ...ok } as const);
  };
  return {
    openStudio: step("openStudio", { slug: "new" }),
    addProvider: step("addProvider", { talentProfileId: "tp9" }),
    ensureSelfRoster: step("ensureSelfRoster", {}),
    hideFromBooking: step("hideFromBooking", {}),
    setHomeSurface: step("setHomeSurface", {}),
  } as MoveDeps;
}

async function run(move: HowYouWorkMove, facts: HowYouWorkFacts, fail?: string) {
  const calls: string[] = [];
  const res = await runHowYouWorkMove(move, facts, { workspaceName: "Acme", slug: "acme" }, deps(calls, fail));
  return { res, calls };
}

test("myself -> both: workspace then home=workspace", async () => {
  const { res, calls } = await run("open_studio", myself);
  assert.deepEqual(calls, ["openStudio", "setHomeSurface"]);
  assert.ok(res.ok && res.choice === "both" && res.slug === "new");
});

test("studio -> both: talent profile then self roster visible", async () => {
  const { res, calls } = await run("add_provider", studio);
  assert.deepEqual(calls, ["addProvider", "ensureSelfRoster"]);
  assert.ok(res.ok && res.choice === "both");
});

test("resume bookings only re-runs the shared self roster function", async () => {
  const { calls } = await run("resume_bookings", stopped);
  assert.deepEqual(calls, ["ensureSelfRoster"]);
});

test("both -> stop: only hides from booking, nothing else", async () => {
  const { res, calls } = await run("stop_bookings", both);
  assert.deepEqual(calls, ["hideFromBooking"]);
  assert.ok(res.ok && res.choice === "studio");
});

test("failures stop the sequence; invalid moves call nothing", async () => {
  assert.deepEqual((await run("add_provider", studio, "addProvider")).calls, ["addProvider"]);
  const bad = await run("stop_bookings", myself);
  assert.deepEqual(bad.calls, []);
  assert.equal(bad.res.ok, false);
  const home = await run("open_studio", myself, "setHomeSurface");
  assert.ok(home.res.ok && home.res.warnings.includes("home"));
});
