/**
 * Composes the Stage 2 plan from cluster modules (pure). ctx = { now, has(col), hub } where
 *   has("table.column")  says whether the LIVE schema carries a column that exists only in a held migration, and
 *   hub = { talentId, tenantId, hasPayout } | null  is the pre-existing hub talent TAL-93900, resolved read-only at run time.
 * Returns { ops, blocked, notBuilt }.
 */
import { verifyS2Plan } from "./stage2-guards.mjs";
import { orderOps } from "./stage2-order.mjs";
import { planEvents } from "./stage2-plan-events.mjs";
import { planT1Catalog } from "./stage2-plan-t1-catalog.mjs";
import { planT1Core, planT1Devices, planT1Floor } from "./stage2-plan-t1.mjs";
import { planT2 } from "./stage2-plan-t2.mjs";
import { HUB_TALENT_CODE, planHub, planT3 } from "./stage2-plan-t3.mjs";
import { planT4 } from "./stage2-plan-t4.mjs";
import { planT5 } from "./stage2-plan-t5.mjs";

/** Built clusters. EV = the events on T1; T5 = workspace, weekly class, drink deal, tour, beach club. */
export const S2_FIXTURES = ["T1", "T2", "T3", "T4", "T5", "EV"];
export const DEPENDS = { EV: ["T1"] };

/** What the card asks for that this build does not seed yet (printed by the dry run, never silently skipped). */
export const NOT_BUILT = [
  { id: "PR", what: "promos: codes, automatic, states and scopes", why: "push 3" },
  { id: "CU", what: "customers and messaging", why: "push 3" },
  { id: "MO", what: "money: completed/manual-payment bookings, refunded ticket, catering inquiry", why: "push 3 (paid history preferably created live in Stripe TEST)" },
  { id: "ST", what: "Stripe TEST Connect accounts (T1 MX, T4 US) + test clocks", why: "separate --stripe step, push 3" },
  { id: "RA", what: "RestaurAdmin exports v1/v2/v3 (files under docs/fixtures; import stays manual)", why: "push 3" },
];

export function resolveStage2(only) {
  const want = new Set(only?.length ? only : S2_FIXTURES);
  for (const [f, deps] of Object.entries(DEPENDS)) if (want.has(f)) for (const d of deps) want.add(d);
  return S2_FIXTURES.filter((f) => want.has(f));
}

export function buildStage2Plan(sets, ctx) {
  const wanted = new Set(sets?.length ? sets : S2_FIXTURES);
  const ops = [];
  const blocked = [];
  const notes = [];
  if (wanted.has("T1")) {
    const cat = planT1Catalog(ctx);
    // Order matters: the workspace and venues exist before anything that names them.
    ops.push(...planT1Core(ctx.now), ...planT1Floor(ctx.now), ...planT1Devices(ctx.now), ...cat.ops);
    blocked.push(...cat.blocked);
  }
  if (wanted.has("T2")) ops.push(...planT2(ctx.now));
  if (wanted.has("T3")) {
    ops.push(...planT3(ctx.now, ctx.hub));
    if (ctx.hub) {
      ops.push(...planHub(ctx.hub, ctx.now));
      if (ctx.hub.hasPayout) notes.push(`${HUB_TALENT_CODE} already has an active payout account: no payout row is added`);
    } else {
      blocked.push({ item: `${HUB_TALENT_CODE} package + payout account: the talent was not found on this database`, version: "n/a", file: "n/a" });
    }
  }
  if (wanted.has("T4")) ops.push(...planT4(ctx.now));
  if (wanted.has("T5")) ops.push(...planT5(ctx.now));
  if (wanted.has("EV")) ops.push(...planEvents(ctx.now));
  // Each builder is written in a valid order (a test asserts it on the raw list); the stable sort is the runner's safety net and leaves a valid list untouched.
  return { ops: orderOps(ops), rawOps: ops, blocked, notes, notBuilt: NOT_BUILT };
}

export { verifyS2Plan };
