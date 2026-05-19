/**
 * roster-seat-limit.security.test.ts — characterization of the seat-cap
 * enforcement in src/lib/saas/roster-seat-limit.ts.
 *
 * Seat limits are a plan-tier monetization boundary AND a tenant-scoped
 * resource guard. The risk surface here is *bypass* (sneaking a seat past the
 * cap) and *fail-open* (the cap silently not applying). Companion to
 * roster-seat-limit.test.ts (happy-path numeric checks).
 *
 * evaluateRosterSeatAvailability / resolvePublicRosterDisplayCap are pure;
 * checkRosterSeatAvailability is param-injectable (mock supabase). All
 * behavioural — no source-grep needed.
 *
 * Does NOT fix anything. Weak cases are `{ skip: "SECURITY FLAG: …" }` and
 * still assert CURRENT behaviour.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkRosterSeatAvailability,
  evaluateRosterSeatAvailability,
  resolvePublicRosterDisplayCap,
} from "./roster-seat-limit";

// ─────────────────────────────────────────────────────────────────────────────
// evaluateRosterSeatAvailability — anti-bypass clamping.
// ─────────────────────────────────────────────────────────────────────────────

test("evaluateRosterSeatAvailability: additionalSeats <= 0 / fractional cannot under-count the request (clamped to >=1, trunc)", () => {
  // A caller can't slip a seat past the cap by asking for 0 or -5 seats.
  for (const additionalSeats of [0, -5, 0.9, undefined]) {
    const r = evaluateRosterSeatAvailability({
      planTier: "free",
      limit: 5,
      current: 5,
      additionalSeats,
    });
    assert.equal(r.ok, false, `additionalSeats=${String(additionalSeats)} still blocked at the cap`);
    if (!r.ok) assert.equal(r.after, 6, "clamped to at least 1 seat added");
  }
  // fractional > 1 truncates (2.9 → 2), never rounds up past intent.
  const frac = evaluateRosterSeatAvailability({ planTier: "studio", limit: 10, current: 7, additionalSeats: 2.9 });
  assert.equal(frac.ok, true);
  if (frac.ok) assert.equal(frac.after, 9);
});

test("evaluateRosterSeatAvailability: limit 0 is a HARD FREEZE and is NOT the same as limit null (unlimited)", () => {
  const frozen = evaluateRosterSeatAvailability({ planTier: "free", limit: 0, current: 0, additionalSeats: 1 });
  assert.equal(frozen.ok, false, "limit 0 blocks even the first seat");
  const unlimited = evaluateRosterSeatAvailability({ planTier: "network", limit: null, current: 9999, additionalSeats: 1 });
  assert.equal(unlimited.ok, true, "limit null is unlimited — must never collapse to 0");
});

test("evaluateRosterSeatAvailability: the cap is inclusive (after <= limit) and a BULK add cannot straddle it", () => {
  const exact = evaluateRosterSeatAvailability({ planTier: "studio", limit: 5, current: 4, additionalSeats: 1 });
  assert.equal(exact.ok, true, "landing exactly on the cap is allowed");
  const bulkOver = evaluateRosterSeatAvailability({ planTier: "studio", limit: 5, current: 3, additionalSeats: 5 });
  assert.equal(bulkOver.ok, false, "a bulk import that would cross the cap is rejected as a whole");
  if (!bulkOver.ok) assert.equal(bulkOver.after, 8);
});

test("evaluateRosterSeatAvailability: non-free / null plan gets generic over-cap copy (no 'Free' wording)", () => {
  const r = evaluateRosterSeatAvailability({ planTier: null, limit: 2, current: 2, additionalSeats: 1 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.doesNotMatch(r.message, /Free plan/i);
    assert.match(r.message, /plan limit/i);
  }
});

test("evaluateRosterSeatAvailability: a negative `current` is clamped to 0 (NOTE: in the real path current is a trusted DB count)", () => {
  // Documents the clamp: a garbage negative current resets headroom to full.
  // Not attacker-reachable today — checkRosterSeatAvailability feeds a COUNT
  // (>= 0). Pinned so a future caller that forwards a user-supplied `current`
  // is forced to notice this would be a bypass.
  const r = evaluateRosterSeatAvailability({ planTier: "free", limit: 5, current: -100, additionalSeats: 1 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.current, 0, "negative current clamped to 0");
    assert.equal(r.after, 1);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// resolvePublicRosterDisplayCap — how many profiles a public storefront shows.
// ─────────────────────────────────────────────────────────────────────────────

test("resolvePublicRosterDisplayCap: an explicit limit of 0 hides ALL profiles (0, not null/unlimited)", () => {
  assert.equal(resolvePublicRosterDisplayCap("free", 0), 0);
  assert.equal(resolvePublicRosterDisplayCap("agency", 0), 0);
  assert.equal(resolvePublicRosterDisplayCap("free", -3), 0, "negative explicit limit clamps to 0");
});

test("resolvePublicRosterDisplayCap: explicit limit overrides the Free default-5; paid + no limit = uncapped", () => {
  assert.equal(resolvePublicRosterDisplayCap("free", null), 5, "Free default cap");
  assert.equal(resolvePublicRosterDisplayCap("free", 3), 3, "explicit beats the default");
  assert.equal(resolvePublicRosterDisplayCap("studio", null), null, "paid + no limit = uncapped");
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRosterSeatAvailability — DB-backed. The count MUST be tenant-scoped and
// MUST exclude removed seats; a missing agency row is the fail-open hazard.
// ─────────────────────────────────────────────────────────────────────────────
type Chain = {
  select: (...a: unknown[]) => Chain;
  eq: (c: string, v: string) => Chain;
  neq: (c: string, v: string) => Chain;
  maybeSingle: () => Promise<{ data: unknown }>;
  then: (res: (v: { count: number | null }) => unknown) => Promise<unknown>;
};
type Recorded = { table: string; eqs: Array<[string, string]>; neqs: Array<[string, string]> };

function mockSeatSupabase(opts: { agency: unknown; rosterCount: number | null }) {
  const recorded: Recorded[] = [];
  const supabase = {
    from(table: string) {
      const rec: Recorded = { table, eqs: [], neqs: [] };
      recorded.push(rec);
      const chain: Chain = {
        select() {
          return chain;
        },
        eq(c, v) {
          rec.eqs.push([c, v]);
          return chain;
        },
        neq(c, v) {
          rec.neqs.push([c, v]);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: opts.agency });
        },
        // agency_talent_roster count query is awaited directly (no maybeSingle).
        then(resolve) {
          return Promise.resolve(resolve({ count: opts.rosterCount }));
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, recorded };
}

test("checkRosterSeatAvailability: the seat count is tenant-scoped (eq tenant_id) and EXCLUDES removed rows (neq status removed)", async () => {
  const { supabase, recorded } = mockSeatSupabase({
    agency: { plan_tier: "studio", talent_seat_limit: 10 },
    rosterCount: 7,
  });
  const r = await checkRosterSeatAvailability(supabase, "tenant-Z", 1);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.after, 8);
  const agencyQ = recorded.find((q) => q.table === "agencies");
  const rosterQ = recorded.find((q) => q.table === "agency_talent_roster");
  assert.deepEqual(agencyQ?.eqs, [["id", "tenant-Z"]], "agency looked up by tenant id");
  assert.deepEqual(rosterQ?.eqs, [["tenant_id", "tenant-Z"]], "roster count is tenant-isolated");
  assert.deepEqual(rosterQ?.neqs, [["status", "removed"]], "removed seats must not count toward the cap");
});

test(
  "checkRosterSeatAvailability: a MISSING/unreadable agency row makes the workspace effectively UNLIMITED",
  {
    skip:
      "SECURITY FLAG (fail-open): when the agencies row is null — RLS denial, " +
      "bogus/cross tenant id, deleted agency, or a query error that yields " +
      "data:null — planTier and limit both fall back to null, and " +
      "evaluateRosterSeatAvailability treats limit:null as UNLIMITED. So the " +
      "seat cap silently stops applying instead of failing closed. Plan-tier " +
      "monetization and the tenant resource guard both evaporate in exactly the " +
      "states where you'd most want them enforced. Hardened behaviour: a " +
      "missing/error agency row should deny (ok:false) or fall back to the most " +
      "restrictive cap, not unlimited.",
  },
  async () => {
    // CURRENT (fail-open) behaviour: no agency row ⇒ ok:true, limit:null.
    const { supabase } = mockSeatSupabase({ agency: null, rosterCount: 4242 });
    const r = await checkRosterSeatAvailability(supabase, "tenant-DOES-NOT-EXIST", 1);
    assert.equal(r.ok, true, "current behaviour: unlimited when the agency row is unreadable");
    if (r.ok) assert.equal(r.limit, null);
  },
);

test("checkRosterSeatAvailability: a null roster count is treated as 0 current (no NaN headroom)", async () => {
  const { supabase } = mockSeatSupabase({
    agency: { plan_tier: "free", talent_seat_limit: 5 },
    rosterCount: null,
  });
  const r = await checkRosterSeatAvailability(supabase, "tenant-Q", 1);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.current, 0);
    assert.equal(r.after, 1);
  }
});
