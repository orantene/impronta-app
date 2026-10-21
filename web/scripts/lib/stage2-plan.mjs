/**
 * Composes the Stage 2 plan from cluster modules (pure). ctx = { now, has(col), hub } where
 *   has("table.column")  says whether the LIVE schema carries a column that exists only in a held migration, and
 *   hub = { talentId, tenantId, hasPayout } | null  is the pre-existing hub talent TAL-93900, resolved read-only at run time.
 * Returns { ops, blocked, notBuilt }.
 */
import { verifyS2Plan } from "./stage2-guards.mjs";
import { orderOps } from "./stage2-order.mjs";
import { HELD_SLUGS, POSTS_V1, planPosts, planReviews, planSlugs } from "./stage2-plan-content.mjs";
import { BLOCKED_WHATSAPP, planCustomers } from "./stage2-plan-customers.mjs";
import { planEvents } from "./stage2-plan-events.mjs";
import { planMoney } from "./stage2-plan-money.mjs";
import { planPromos } from "./stage2-plan-promos.mjs";
import { planT1Catalog } from "./stage2-plan-t1-catalog.mjs";
import { planT1Core, planT1Devices, planT1Floor } from "./stage2-plan-t1.mjs";
import { planT2 } from "./stage2-plan-t2.mjs";
import { HUB_TALENT_CODE, planHub, planT3 } from "./stage2-plan-t3.mjs";
import { planT4 } from "./stage2-plan-t4.mjs";
import { planT5 } from "./stage2-plan-t5.mjs";

/**
 * Built clusters. EV = the events on T1; T5 = workspace, class, drink deal, tour, beach club; PR = promos; CU = customers; MO = the catering offer;
 * SL = service page slugs (offering_slugs); RV = pre-made history bookings + talent -> client reviews on T4; PO = eight blog posts on T1.
 */
export const S2_FIXTURES = ["T1", "T2", "T3", "T4", "T5", "EV", "PR", "CU", "MO", "SL", "RV", "PO"];
export const DEPENDS = { EV: ["T1"], PR: ["T1", "T5", "EV"], CU: ["T1", "T3", "T4"], MO: ["T1", "CU"], SL: ["T1", "T3", "T4", "T5"], RV: ["T4"], PO: ["T1"] };

/** What the card asks for that this build does not seed yet (printed by the dry run, never silently skipped). */
export const NOT_BUILT = [
  { id: "WA", what: "WhatsApp suppression row", why: "BLOCKED: no table exists on main or in _pending_pm (the consent ledger, Phase 5 G5.2, has no migration file yet)" },
  { id: "MO-live", what: "completed paid booking, manual-payment booking, refunded ticket with a redeemed included item", why: "created LIVE in Stripe TEST during QA (a seeded order or refund would have no provider event behind it); see docs/plans/stage2-cron-triggers.md for the sweeps" },
  { id: "TR", what: "public talent_reviews (the rating shown on a profile)", why: "the public rating counts only verified_paid reviews, which a trigger derives from a PAID booking_transactions row; seeding that would be a fake payment. Seeded instead: client_reviews (talent to client), which need none" },
  { id: "BOGO", what: "a true 2x1 / buy-X-get-Y rule", why: "no column on main or in _pending_pm (Phase 3 G3.2/G3.1); the happy-hour story uses 50% off non-alcoholic items" },
];

/** Live-schema probe for the table the PIN function writes (migration 20261231423900, _pending_pm). */
export const PIN_TABLE_COLUMN = "staff_pin_hashes.pin_hash";
export const BLOCKED_PIN_TABLE = {
  item: "T1 manager PIN (staff_pin_hashes via rpc pos_set_staff_pin)",
  version: "20261231423900",
  file: "supabase/migrations/_pending_pm/20261231423900_staff_pin_hashes_and_throttle_tul1516.sql",
};

export function resolveStage2(only) {
  const want = new Set(only?.length ? only : S2_FIXTURES);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [f, deps] of Object.entries(DEPENDS)) if (want.has(f)) for (const d of deps) if (!want.has(d)) { want.add(d); changed = true; }
  }
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
    const hasPinTable = ctx.has(PIN_TABLE_COLUMN);
    ops.push(...planT1Core(ctx.now, hasPinTable), ...planT1Floor(ctx.now), ...planT1Devices(ctx.now), ...cat.ops);
    blocked.push(...cat.blocked);
    if (!hasPinTable) blocked.push(BLOCKED_PIN_TABLE);
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
  if (wanted.has("PR")) ops.push(...planPromos(ctx.now, ops));
  if (wanted.has("CU")) {
    ops.push(...planCustomers(ctx.now));
    blocked.push(BLOCKED_WHATSAPP);
  }
  if (wanted.has("MO")) ops.push(...planMoney(ctx.now));
  if (wanted.has("SL")) {
    if (ctx.has(HELD_SLUGS.probe)) ops.push(...planSlugs());
    else blocked.push({ item: HELD_SLUGS.item, version: HELD_SLUGS.version, file: HELD_SLUGS.file });
  }
  if (wanted.has("RV")) ops.push(...planReviews(ctx.now));
  if (wanted.has("PO")) {
    if (ctx.has(POSTS_V1.probe)) ops.push(...planPosts(ctx.now));
    else blocked.push({ item: POSTS_V1.item, version: POSTS_V1.version, file: POSTS_V1.file });
  }
  // Each builder is written in a valid order (a test asserts it on the raw list); the stable sort is the runner's safety net and leaves a valid list untouched.
  return { ops: orderOps(ops), rawOps: ops, blocked, notes, notBuilt: NOT_BUILT };
}

export { verifyS2Plan };
