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

import { applyCollectiveOwnerShares, applySharesToLines, collectiveSplitEnabled, parseOwnerShareRow, talentNoLongerSellsCopy } from "./collective-split";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
type TestLine = { talentProfileId: string | null; totalCents: number; talentCostCents: number; ownerTenantId: null; label: string; ownerTakeCents?: number; ownerShareSnapshot?: Record<string, unknown> };
const line = (talentProfileId: string | null, totalCents: number, talentCostCents = totalCents): TestLine => ({ talentProfileId, totalCents, talentCostCents, ownerTenantId: null, label: "Gel manicure" });

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
    const r = applySharesToLines([line("a", 10_000)], new Map([["a", { share: { kind: "percent" as const, bps: 2000 }, version: 1 }]]), "MXN");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.lines[0].talentCostCents, 8000);
  });
  test("a fixed share is per line, in the order's currency, and capped so the member keeps at least 10%", () => {
    const shares = new Map([["a", { share: { kind: "fixed" as const, amountCents: 50_000, currency: "MXN" }, version: 1 }]]);
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
    applySharesToLines(input, new Map([["a", { share: { kind: "percent" as const, bps: 5000 }, version: 1 }]]), "MXN");
    assert.equal(input[0].talentCostCents, 10_000);
  });
});

describe("flag gate and the line snapshot", () => {
  test("OFF unless the flag is exactly 1", () => {
    for (const v of [undefined, "", "0", "true", "yes"]) assert.equal(collectiveSplitEnabled({ COLLECTIVE_SPLIT_ENABLED: v }), false, String(v));
    assert.equal(collectiveSplitEnabled({ COLLECTIVE_SPLIT_ENABLED: "1" }), true);
  });
  test("each split line carries the owner's take and the accepted-share snapshot (version included)", () => {
    const r = applySharesToLines([line("a", 10_000)], new Map([["a", { share: { kind: "percent" as const, bps: 2000 }, version: 4 }]]), "MXN");
    assert.equal(r.ok && r.lines[0].ownerTakeCents, 2000);
    assert.deepEqual(r.ok && r.lines[0].ownerShareSnapshot, { kind: "percent", bps: 2000, version: 4 });
  });
});

process.env.COLLECTIVE_SPLIT_ENABLED = "1";

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
          in: chain, lte: chain,
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
  test("flag OFF: no workspace is touched, not even read: an agencies read error cannot refuse any order", async () => {
    const prev = process.env.COLLECTIVE_SPLIT_ENABLED;
    delete process.env.COLLECTIVE_SPLIT_ENABLED;
    try {
      const reads: string[] = [];
      const admin = fakeAdmin({ agencies: { data: null, error: { code: "57014", message: "statement timeout" } } });
      const spy = { from: (t: string) => { reads.push(t); return (admin as unknown as { from: (t: string) => unknown }).from(t); } } as unknown as SupabaseClient;
      const r = await applyCollectiveOwnerShares(spy, "t1", "MXN", lines());
      assert.equal(r.ok && r.lines[0].talentCostCents, 10_000);
      assert.deepEqual(reads, []);
    } finally {
      if (prev !== undefined) process.env.COLLECTIVE_SPLIT_ENABLED = prev;
    }
  });
  test("a collective applies each member's share", async () => {
    const r = await applyCollectiveOwnerShares(
      fakeAdmin({
        agencies: { data: { work_model: "friends_collective" }, error: null },
        agency_talent_roster: { data: [{ talent_profile_id: "a", owner_share_kind: "percent", owner_share_bps: 2500, owner_share_version: 2 }], error: null },
        talent_profiles: { data: [{ id: "a", display_name: "Ana" }], error: null },
      }),
      "t1",
      "MXN",
      lines(),
    );
    assert.equal(r.ok && r.lines[0].talentCostCents, 7500);
    assert.equal(r.ok && r.lines[0].label, "Gel manicure · Ana");
    assert.deepEqual(r.ok && r.lines[0].ownerShareSnapshot, { kind: "percent", bps: 2500, version: 2 });
    assert.equal(r.ok && r.lines[0].ownerTakeCents, 2500);
  });
  test("with the flag OFF (default) a collective is NOT split: no share read, lines untouched", async () => {
    const prev = process.env.COLLECTIVE_SPLIT_ENABLED;
    delete process.env.COLLECTIVE_SPLIT_ENABLED;
    try {
      const r = await applyCollectiveOwnerShares(
        fakeAdmin({
          agencies: { data: { work_model: "friends_collective" }, error: null },
          agency_talent_roster: { data: null, error: { message: "must not read" } },
        }),
        "t1",
        "MXN",
        lines(),
      );
      assert.equal(r.ok && r.lines[0].talentCostCents, 10_000);
    } finally {
      if (prev !== undefined) process.env.COLLECTIVE_SPLIT_ENABLED = prev;
    }
  });
  const collectiveWith = (rosterRows: unknown[]) =>
    fakeAdmin({
      agencies: { data: { work_model: "friends_collective" }, error: null },
      agency_talent_roster: { data: rosterRows, error: null },
      talent_profiles: { data: [{ id: "a", display_name: "Ana" }], error: null },
    });
  const pct = (status: string, bps: number) => ({ talent_profile_id: "a", status, owner_share_kind: "percent", owner_share_bps: bps, owner_share_version: 1 });

  test("removed + live row for the same talent: the LIVE share wins", async () => {
    for (const rows of [[pct("removed", 1000), pct("active", 2500)], [pct("active", 2500), pct("removed", 1000)]]) {
      const r = await applyCollectiveOwnerShares(collectiveWith(rows), "t1", "MXN", lines());
      assert.equal(r.ok && r.lines[0].talentCostCents, 7500);
    }
  });
  test("removed-only with a recorded share applies that last accepted share (same cut as live)", async () => {
    const r = await applyCollectiveOwnerShares(collectiveWith([pct("removed", 2500)]), "t1", "MXN", lines());
    assert.equal(r.ok && r.lines[0].talentCostCents, 7500);
    assert.equal(r.ok && r.lines[0].ownerTakeCents, 2500);
  });
  const gone = (removedAt: string | null, bps: number | null, updatedAt = "2026-01-01T00:00:00Z") => ({
    talent_profile_id: "a", status: "removed", removed_at: removedAt, updated_at: updatedAt,
    ...(bps === null ? {} : { owner_share_kind: "percent", owner_share_bps: bps, owner_share_version: 1 }),
  });
  test("left, rejoined, left again: only her MOST RECENT removed row counts, whatever the row order", async () => {
    const older = gone("2026-02-01T00:00:00Z", 1000);
    const newer = gone("2026-05-01T00:00:00Z", 3000);
    for (const rows of [[older, newer], [newer, older]]) {
      const r = await applyCollectiveOwnerShares(collectiveWith(rows), "t1", "MXN", lines());
      assert.equal(r.ok && r.lines[0].talentCostCents, 7000);
      assert.equal(r.ok && r.lines[0].ownerTakeCents, 3000);
    }
  });
  test("the most recent removed row has no share: refused, even if an older removed row has one", async () => {
    for (const rows of [[gone("2026-02-01T00:00:00Z", 1000), gone("2026-05-01T00:00:00Z", null)], [gone("2026-05-01T00:00:00Z", null), gone("2026-02-01T00:00:00Z", 1000)]]) {
      const r = await applyCollectiveOwnerShares(collectiveWith(rows), "t1", "MXN", lines());
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, "talent_no_longer_sells");
    }
  });
  test("a missing removed_at falls back to updated_at to find the most recent row", async () => {
    const r1 = await applyCollectiveOwnerShares(collectiveWith([gone(null, 1000, "2026-03-01T00:00:00Z"), gone(null, 2000, "2026-06-01T00:00:00Z")]), "t1", "MXN", lines());
    assert.equal(r1.ok && r1.lines[0].ownerTakeCents, 2000);
  });
  test("removed-only with NO share on record refuses with its own code and copy", async () => {
    const r = await applyCollectiveOwnerShares(collectiveWith([{ talent_profile_id: "a", status: "removed" }]), "t1", "MXN", lines());
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, "talent_no_longer_sells");
    assert.equal(r.error, "This professional no longer sells here");
    assert.equal(talentNoLongerSellsCopy("es-MX"), "Esta persona ya no vende aquí");
    assert.equal(talentNoLongerSellsCopy("en"), "This professional no longer sells here");
    assert.doesNotMatch(talentNoLongerSellsCopy("es") + talentNoLongerSellsCopy("en"), /[—–]/);
  });
  test("a read error still fails closed with the generic copy", async () => {
    const r = await applyCollectiveOwnerShares(
      fakeAdmin({ agencies: { data: { work_model: "friends_collective" }, error: null }, agency_talent_roster: { data: null, error: { code: "XX000", message: "down" } } }),
      "t1", "MXN", lines());
    assert.deepEqual(r, { ok: false, error: "We could not confirm the split for this order. Nothing was charged. Try again." });
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
    assert.ok(split < src.indexOf("buildOrderLineRows("), "before the insert");
    assert.match(read("../orders/purchase-lines.ts"), /talent_cost_cents: l\.talentCostCents/);
    assert.match(src, /if \(!split\.ok\) return \{ ok: false, reason: "engine_error", error: split\.code \? talentNoLongerSellsCopy\(input\.locale\) : split\.error \}/);
  });
  test("the held migration adds the per-member share to the roster, capped at 90%", () => {
    const sql = read("../../../../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql");
    assert.match(sql, /agency_talent_roster[\s\S]*owner_share_kind/);
    assert.match(sql, /owner_share_bps[\s\S]*BETWEEN 0 AND 9000/);
    assert.match(sql, /owner_share_cents/);
  });
});
