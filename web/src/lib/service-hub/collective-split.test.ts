/**
 * TUL-1374 money split: in a Friends collective the owner takes a % or a fixed
 * amount from each member's line, capped at 90%, and the member is paid the
 * rest. It is expressed through the line's talent cost (what the payee receives),
 * so the existing commission engine, the checkout collect and the payouts need
 * no new split mode, and the order line IS the snapshot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { applyCollectiveOwnerShares, applySharesToLines, parseOwnerShareRow } from "./collective-split";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const line = (talentProfileId: string | null, totalCents: number, talentCostCents = totalCents) => ({ talentProfileId, totalCents, talentCostCents, ownerTenantId: null, label: "Gel manicure" });

describe("share rows", () => {
  test("percent and fixed rows parse; bad or half-filled rows are null", () => {
    assert.deepEqual(parseOwnerShareRow({ owner_share_kind: "percent", owner_share_bps: 1500 }), { kind: "percent", bps: 1500 });
    assert.deepEqual(parseOwnerShareRow({ owner_share_kind: "fixed", owner_share_cents: 3000, owner_share_currency: "mxn" }), { kind: "fixed", amountCents: 3000, currency: "MXN" });
    for (const row of [
      {},
      { owner_share_kind: "percent" },
      { owner_share_kind: "percent", owner_share_bps: 9500 },
      { owner_share_kind: "fixed", owner_share_cents: 3000 },
      { owner_share_kind: "fixed", owner_share_cents: -1, owner_share_currency: "MXN" },
      { owner_share_kind: "weird", owner_share_bps: 10 },
    ]) assert.equal(parseOwnerShareRow(row), null, JSON.stringify(row));
  });
});

describe("applying shares to order lines", () => {
  test("a % share: owner takes it from the member's line; the member's cost is the rest; they add up to the line", () => {
    const r = applySharesToLines([line("a", 10_000)], new Map([["a", { kind: "percent" as const, bps: 2000 }]]), "MXN");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.lines[0].talentCostCents, 8000);
  });
  test("a fixed share is per line, in the order's currency, and capped so the member keeps at least 10%", () => {
    const shares = new Map([["a", { kind: "fixed" as const, amountCents: 50_000, currency: "MXN" }]]);
    const r = applySharesToLines([line("a", 10_000)], shares, "MXN");
    assert.equal(r.ok && r.lines[0].talentCostCents, 1000);
    assert.deepEqual(applySharesToLines([line("a", 10_000)], shares, "USD"), { ok: false, error: "share_currency_mismatch" });
  });
  test("a member with no share set keeps everything; lines without a talent are untouched", () => {
    const r = applySharesToLines([line("a", 10_000), line(null, 500, 0)], new Map(), "MXN");
    assert.equal(r.ok && r.lines[0].talentCostCents, 10_000);
    assert.equal(r.ok && r.lines[1].talentCostCents, 0);
  });
  test("the member's name is printed with her price on the line (checkout, pay page and receipt all show the label)", () => {
    const names = new Map([["a", "Ana"]]);
    const r = applySharesToLines([line("a", 10_000), line(null, 500, 0)], new Map(), "MXN", names);
    assert.equal(r.ok && r.lines[0].label, "Gel manicure · Ana");
    assert.equal(r.ok && r.lines[1].label, "Gel manicure");
    // never twice, never an empty name, never past the column width
    const again = applySharesToLines(r.ok ? r.lines : [], new Map(), "MXN", names);
    assert.equal(again.ok && again.lines[0].label, "Gel manicure · Ana");
    const blank = applySharesToLines([line("a", 100)], new Map(), "MXN", new Map([["a", "  "]]));
    assert.equal(blank.ok && blank.lines[0].label, "Gel manicure");
    const long = applySharesToLines([{ ...line("a", 100), label: "x".repeat(299) }], new Map(), "MXN", names);
    assert.equal(long.ok && long.lines[0].label.length <= 300, true);
  });
  test("never mutates the input lines", () => {
    const input = [line("a", 10_000)];
    applySharesToLines(input, new Map([["a", { kind: "percent" as const, bps: 5000 }]]), "MXN");
    assert.equal(input[0].talentCostCents, 10_000);
  });
});

describe("loading the workspace's model and shares (fails closed)", () => {
  type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
  function fakeAdmin(replies: Record<string, Reply>) {
    return {
      from(table: string) {
        const q: Record<string, unknown> = {};
        const chain = () => q;
        Object.assign(q, {
          select: chain,
          eq: chain,
          in: chain,
          neq: chain,
          maybeSingle: async () => replies[table] ?? { data: null, error: null },
          then: (res: (v: unknown) => unknown) => Promise.resolve(replies[table] ?? { data: [], error: null }).then(res),
        });
        return q;
      },
    } as unknown as SupabaseClient;
  }
  const lines = () => [line("a", 10_000)];

  test("not a collective: lines come back untouched and no shares are read", async () => {
    const r = await applyCollectiveOwnerShares(fakeAdmin({ agencies: { data: { work_model: "coordinator_agency" }, error: null }, agency_talent_roster: { data: null, error: { message: "must not read" } } }), "t1", "MXN", lines());
    assert.equal(r.ok && r.lines[0].talentCostCents, 10_000);
  });
  test("before the migration (undefined column) it is simply not a collective", async () => {
    const r = await applyCollectiveOwnerShares(fakeAdmin({ agencies: { data: null, error: { code: "42703", message: "column work_model does not exist" } } }), "t1", "MXN", lines());
    assert.equal(r.ok && r.lines[0].talentCostCents, 10_000);
  });
  test("a collective applies each member's share", async () => {
    const r = await applyCollectiveOwnerShares(
      fakeAdmin({
        agencies: { data: { work_model: "friends_collective" }, error: null },
        agency_talent_roster: { data: [{ talent_profile_id: "a", owner_share_kind: "percent", owner_share_bps: 2500 }], error: null },
        talent_profiles: { data: [{ id: "a", display_name: "Ana" }], error: null },
      }),
      "t1",
      "MXN",
      lines(),
    );
    assert.equal(r.ok && r.lines[0].talentCostCents, 7500);
    assert.equal(r.ok && r.lines[0].label, "Gel manicure · Ana");
  });
  test("any other read failure REFUSES the order (never prices a collective sale without its split)", async () => {
    const down = await applyCollectiveOwnerShares(fakeAdmin({ agencies: { data: null, error: { code: "XX000", message: "db down" } } }), "t1", "MXN", lines());
    assert.deepEqual(down, { ok: false, error: "We could not confirm the split for this order. Nothing was charged. Try again." });
    const rosterDown = await applyCollectiveOwnerShares(
      fakeAdmin({ agencies: { data: { work_model: "friends_collective" }, error: null }, agency_talent_roster: { data: null, error: { code: "XX000", message: "db down" } } }),
      "t1",
      "MXN",
      lines(),
    );
    assert.equal(rosterDown.ok, false);
  });
});

describe("wiring", () => {
  test("createPurchase applies the split before the fee, the collect and the insert, and refuses when it cannot", () => {
    const src = read("../orders/purchase.ts");
    const split = src.indexOf("applyCollectiveOwnerShares(");
    assert.ok(split > 0);
    assert.ok(split < src.search(/await resolveCheckoutCollect(Cents|OrRefuse)\(/), "before the fee and collect");
    assert.ok(split < src.indexOf("talent_cost_cents: l.talentCostCents"));
    assert.match(src, /if \(!split\.ok\) return \{ ok: false, reason: "engine_error", error: split\.error \}/);
  });
  test("the held migration adds the per-member share to the roster, capped at 90%", () => {
    const sql = read("../../../../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql");
    assert.match(sql, /agency_talent_roster[\s\S]*owner_share_kind/);
    assert.match(sql, /owner_share_bps[\s\S]*BETWEEN 0 AND 9000/);
    assert.match(sql, /owner_share_cents/);
  });
});
