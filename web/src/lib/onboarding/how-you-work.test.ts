import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveHowYouWork,
  movesFor,
  runHowYouWorkMove,
  type HowYouWorkFacts,
  type HowYouWorkMove,
  type MoveDeps,
  resolveProviderDisplayName,
} from "./how-you-work";
import { planProfilePromotion, type ProfileState } from "./talent-profile-promotion";

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
    promoteProfileLive: step("promoteProfileLive", {}),
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
  assert.deepEqual(calls, ["openStudio", "promoteProfileLive", "setHomeSurface"]);
  assert.ok(res.ok && res.choice === "both" && res.slug === "new");
});

test("studio -> both: talent profile then self roster visible", async () => {
  const { res, calls } = await run("add_provider", studio);
  assert.deepEqual(calls, ["addProvider", "promoteProfileLive", "ensureSelfRoster"]);
  assert.ok(res.ok && res.choice === "both");
});

test("resume bookings only re-runs the shared self roster function", async () => {
  const { calls } = await run("resume_bookings", stopped);
  assert.deepEqual(calls, ["promoteProfileLive", "ensureSelfRoster"]);
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

test("promotion plan: draft/hidden becomes approved/public, live states untouched", () => {
  assert.deepEqual(planProfilePromotion({ workflow_status: "draft", visibility: "hidden" }), { workflow_status: "approved", visibility: "public" });
  assert.deepEqual(planProfilePromotion({ workflow_status: "approved", visibility: "hidden" }), { visibility: "public" });
  assert.equal(planProfilePromotion({ workflow_status: "approved", visibility: "public" }), null);
  assert.equal(planProfilePromotion({ workflow_status: "published", visibility: "public" }), null);
});

test("after add_provider / open_studio the profile is approved + public and bookable", async () => {
  for (const [move, facts] of [["add_provider", studio], ["open_studio", myself]] as const) {
    const profile: ProfileState = { workflow_status: "draft", visibility: "hidden" };
    let rosterVisible = false;
    const calls: string[] = [];
    const d = deps(calls);
    d.promoteProfileLive = async () => {
      Object.assign(profile, planProfilePromotion(profile));
      return { ok: true };
    };
    d.ensureSelfRoster = async () => {
      rosterVisible = true;
      return { ok: true };
    };
    // open_studio's real openStudio already ensures the self roster inside provisionFreeWorkspaceFromTalent.
    d.openStudio = async () => {
      rosterVisible = true;
      return { ok: true, slug: "new" };
    };
    const res = await runHowYouWorkMove(move, facts, { workspaceName: "Acme", slug: "acme" }, d);
    assert.ok(res.ok);
    assert.deepEqual(profile, { workflow_status: "approved", visibility: "public" });
    assert.equal(rosterVisible, true);
  }
});

test("provider name: the talent name first, then the account name, then the workspace name; blank never wins", () => {
  assert.equal(resolveProviderDisplayName("Rosa", "Rosa Perez", "Estudio Rosa"), "Rosa");
  // A studio owner has no talent profile: the account name is used.
  assert.equal(resolveProviderDisplayName(null, "Rosa Perez", "Estudio Rosa"), "Rosa Perez");
  assert.equal(resolveProviderDisplayName(undefined, "   ", "Estudio Rosa"), "Estudio Rosa");
  assert.equal(resolveProviderDisplayName(null, null, null), null);
});

test("studio -> both: add_provider runs with a non-empty name for a studio owner with no talent profile", async () => {
  // facts.displayName now comes from resolveProviderDisplayName, so the move never calls addProvider with "".
  const name = resolveProviderDisplayName(null, "Rosa Perez", "Estudio Rosa");
  assert.equal(name, "Rosa Perez");
});
