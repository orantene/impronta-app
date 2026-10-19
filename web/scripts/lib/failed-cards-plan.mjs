/**
 * Composes the full failed-cards fixture plan (pure). `ctx` carries only values the runner read
 * read-only from staging (template payload, a parent taxonomy id) plus the app's tree builders.
 */
import { DB_FIXTURES, HELD, checkPlan, fcId, labelCollisions, serviceCopyProblems } from "./failed-cards-guards.mjs";
import { planF1, planF11, planF14, planF2, planF7, planF8, planF9 } from "./failed-cards-plan-threads.mjs";
import { planG1, planG2, planG3, planG4, planG5 } from "./failed-cards-plan-g.mjs";
import { planF10, planF12, planF14Base, planF3, planF3Sites, planF5, planF6, planS5, planS6 } from "./failed-cards-plan-sites.mjs";

/** Cards each fixture unblocks (from docs/plans/failed-cards-fixture-inventory-2026-10-19.md). */
export const FIXTURE_CARDS = {
  F1: ["TUL-280", "TUL-954"],
  F2: ["TUL-955"],
  F3: ["TUL-698", "TUL-1067", "TUL-1167", "TUL-870", "TUL-1016"],
  F5: ["TUL-935", "TUL-941", "TUL-1051"],
  F6: ["TUL-365", "TUL-998"],
  F7: ["TUL-741"],
  F8: ["TUL-767", "TUL-1169"],
  F9: ["TUL-847"],
  F10: ["TUL-574"],
  F11: ["TUL-571"],
  F12: ["TUL-802"],
  F14: ["TUL-1155"],
  S5: ["TUL-837", "TUL-587"],
  S6: ["TUL-1052", "TUL-1061"],
  G1: ["TUL-1330", "#4108"],
  G2: ["#4099"],
  G3: ["#4091", "#4096"],
  G4: ["TUL-940", "#4090"],
  G5: ["TUL-830", "#4088"],
  S2: ["TUL-833"],
  S3: ["TUL-832", "TUL-834"],
  S4: ["TUL-834"],
};

/** F2 and G1-G5 live in (or hang off) the F3 studio workspace. */
export const DEPENDS = { F2: ["F3"], G1: ["F3"], G2: ["F3"], G3: ["F3"], G4: ["F3"], G5: ["F3"] };

export function resolveFixtures(only) {
  const want = new Set(only?.length ? only : DB_FIXTURES);
  for (const [f, deps] of Object.entries(DEPENDS)) if (want.has(f)) for (const d of deps) want.add(d);
  for (const h of Object.keys(HELD)) want.delete(h);
  return DB_FIXTURES.filter((f) => want.has(f));
}

export function buildPlan(fixtures, ctx) {
  const { now, trees } = ctx;
  const ops = [];
  let f3 = null;
  for (const f of fixtures) {
    if (f === "F1") ops.push(...planF1(now));
    else if (f === "F3") {
      f3 = planF3(now, { trees });
      ops.push(...f3.ops, ...planF3Sites(now));
    } else if (f === "F2") ops.push(...planF2(now, { studioId: f3.studioId, studio2Id: f3.studio2Id, studioOwnerUser: f3.ownerUser }));
    else if (f === "F5") ops.push(...planF5(now));
    else if (f === "F6") ops.push(...planF6(now, { trees, templatePayload: ctx.templatePayload }));
    else if (f === "F7") ops.push(...planF7(now));
    else if (f === "F8") ops.push(...planF8());
    else if (f === "F9") ops.push(...planF9());
    else if (f === "F10") ops.push(...planF10(now));
    else if (f === "F11") ops.push(...planF11(now));
    else if (f === "F12") ops.push(...planF12(now, { trees, housekeepingTermId: ctx.housekeepingTermId }));
    else if (f === "F14") {
      const base = planF14Base(now, { trees });
      ops.push(...base.ops, ...planF14(now, base));
    } else if (f === "S5") ops.push(...planS5(now, { trees }));
    else if (f === "S6") ops.push(...planS6(now, { trees }));
    else if (f === "G1") ops.push(...planG1(f3.studioId));
    else if (f === "G2") ops.push(...planG2(f3.studioId));
    else if (f === "G3") ops.push(...planG3(now, f3.studioId));
    else if (f === "G4") ops.push(...planG4(now, f3.studioId));
    else if (f === "G5") ops.push(...planG5(now, { ownerUser: f3.ownerUser }).ops);
  }
  return ops;
}

/** Every id this plan may insert or update: the deterministic fixture ids of its own ops. */
export function fixtureIdSet(ops) {
  const s = new Set();
  for (const op of ops) if (op.id) s.add(op.id);
  return s;
}

/** Re-derive each op id from its key and check the plan's guards. */
export function verifyPlan(ops, forbiddenIds) {
  const ids = fixtureIdSet(ops);
  const res = checkPlan(ops, { forbiddenIds, fixtureIds: ids });
  const problems = [...res.problems, ...labelCollisions(ops).map((l) => `DNS label ${l} is claimed twice in the plan`), ...serviceCopyProblems(ops)];
  for (const op of ops) {
    if (op.id && op.kind !== "update" && op.kind !== "authUser" && op.table !== "public.talent_bookings" && op.id !== fcId(op.key)) {
      problems.push(`${op.fx} ${op.table} ${op.key}: id is not fcId(key)`);
    }
  }
  return { ok: problems.length === 0, problems };
}
