/**
 * Composes the Stage 2 plan from cluster modules (pure). ctx = { now, has(col) } where has("table.column") says whether
 * the LIVE schema carries a column that exists only in a held migration. Returns { ops, blocked, notBuilt }.
 */
import { verifyS2Plan } from "./stage2-guards.mjs";
import { planT1Catalog } from "./stage2-plan-t1-catalog.mjs";
import { planT1Core, planT1Devices, planT1Floor } from "./stage2-plan-t1.mjs";
import { planT2 } from "./stage2-plan-t2.mjs";

/** Push 1 clusters. Later pushes append T3, T4, T5, EV, PR, CU, MO. */
export const S2_FIXTURES = ["T1", "T2"];

/** What the card asks for that this build does not seed yet (printed by the dry run, never silently skipped). */
export const NOT_BUILT = [
  { id: "T3", what: "agency tenant: roster talent public service + venue table QR; hub talent TAL-93900 package + payout account", why: "push 2; a NEW roster talent conflicts with the 'TAL-93900 only' guard (needs a ruling)" },
  { id: "T4", what: "US salon (USD) + Connect account", why: "push 2" },
  { id: "T5", what: "studio class + drink deal, tour seats + early bird, beach-club bed + minimum spend", why: "push 2" },
  { id: "EV", what: "events: Friday DJ series, free event, overnight, pool-of-1, New_York DST series, weekly class", why: "push 2" },
  { id: "PR", what: "promos: codes, automatic, states and scopes", why: "push 3" },
  { id: "CU", what: "customers and messaging", why: "push 3" },
  { id: "MO", what: "money: completed/manual-payment bookings, refunded ticket, catering inquiry", why: "push 3 (paid history preferably created live in Stripe TEST)" },
  { id: "ST", what: "Stripe TEST Connect accounts (T1 MX, T4 US) + test clocks", why: "separate --stripe step, push 3" },
  { id: "RA", what: "RestaurAdmin exports v1/v2/v3", why: "the importer takes a pasted export (parse-restauradmin); files are generated in a later push, import is manual" },
  { id: "TH", what: "T1 theme published + site pages", why: "no column/table identified for a one-row 'theme published'; builder content needs its own fixture" },
  { id: "PA", what: "platform admin user", why: "the card does not allow one; not built" },
  { id: "TO", what: "talent-owner user", why: "needs a talent profile; only TAL-93900 may be touched" },
];

export function buildStage2Plan(sets, ctx) {
  const wanted = new Set(sets?.length ? sets : S2_FIXTURES);
  const ops = [];
  const blocked = [];
  if (wanted.has("T1")) {
    const cat = planT1Catalog(ctx);
    // Order matters: the workspace and venues exist before anything that names them.
    ops.push(...planT1Core(ctx.now), ...planT1Floor(ctx.now), ...planT1Devices(ctx.now), ...cat.ops);
    blocked.push(...cat.blocked);
  }
  if (wanted.has("T2")) ops.push(...planT2(ctx.now));
  return { ops, blocked, notBuilt: NOT_BUILT.filter((n) => !wanted.has(n.id)) };
}

export function resolveStage2(only) {
  const want = new Set(only?.length ? only : S2_FIXTURES);
  return S2_FIXTURES.filter((f) => want.has(f));
}

export { verifyS2Plan };
