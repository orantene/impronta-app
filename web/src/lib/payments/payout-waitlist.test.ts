// TUL-1052: payout-country waitlist (data layer with fakes, action and migration static pins).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { joinPayoutWaitlist, listPayoutWaitlist } from "./payout-waitlist";
import { payoutCountryRefusalCode } from "./connect-account-setup";

type Call = { table: string; row?: Record<string, unknown>; opts?: Record<string, unknown>; eq?: [string, string] };

function fake(result: { error: { message: string } | null; data?: unknown[] }, calls: Call[]): SupabaseClient {
  return {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, opts: Record<string, unknown>) {
          calls.push({ table, row, opts });
          return Promise.resolve({ error: result.error });
        },
        select() {
          return {
            eq(col: string, val: string) {
              calls.push({ table, eq: [col, val] });
              return Promise.resolve({ data: result.data ?? [], error: result.error });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("joinPayoutWaitlist", () => {
  it("upserts one idempotent row per talent and country", async () => {
    const calls: Call[] = [];
    const r = await joinPayoutWaitlist({ talentProfileId: "t1", userId: "u1", country: " ar " }, fake({ error: null }, calls));
    assert.deepEqual(r, { ok: true });
    assert.equal(calls[0].table, "payout_country_waitlist");
    assert.deepEqual(calls[0].row, { talent_profile_id: "t1", user_id: "u1", country: "AR" });
    assert.deepEqual(calls[0].opts, { onConflict: "talent_profile_id,country", ignoreDuplicates: true });
  });
  it("accepts USDC and refuses unknown countries without touching the database", async () => {
    const calls: Call[] = [];
    assert.deepEqual(await joinPayoutWaitlist({ talentProfileId: "t1", userId: null, country: "usdc" }, fake({ error: null }, calls)), { ok: true });
    const bad = await joinPayoutWaitlist({ talentProfileId: "t1", userId: null, country: "ZZ" }, fake({ error: null }, calls));
    assert.equal(bad.ok, false);
    assert.equal(calls.length, 1);
  });
  it("surfaces a database error instead of claiming success", async () => {
    const r = await joinPayoutWaitlist({ talentProfileId: "t1", userId: "u1", country: "FR" }, fake({ error: { message: "boom" } }, []));
    assert.equal(r.ok, false);
  });
});

describe("listPayoutWaitlist", () => {
  it("returns the talent's countries and checks the error", async () => {
    const calls: Call[] = [];
    const r = await listPayoutWaitlist("t1", fake({ error: null, data: [{ country: "AR" }, { country: "USDC" }] }, calls));
    assert.deepEqual(r, { ok: true, countries: ["AR", "USDC"] });
    assert.deepEqual(calls[0].eq, ["talent_profile_id", "t1"]);
    const bad = await listPayoutWaitlist("t1", fake({ error: { message: "x" } }, []));
    assert.equal(bad.ok, false);
  });
});

describe("static pins", () => {
  const root = join(__dirname, "../../..");
  it("join action is guarded first and resolves the owner from the session", () => {
    const src = readFileSync(join(root, "src/app/(workspace)/[tenantSlug]/talent/settings/payouts/payout-waitlist-actions.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function joinPayoutCountryWaitlist"));
    assert.ok(body.indexOf("assertNotImpersonating") < body.indexOf("resolveOwner"));
    assert.match(src, /getCachedActorSession/);
  });
  it("migration enables RLS and defines no policies", () => {
    const sql = readFileSync(join(root, "../supabase/migrations/20261231410000_payout_country_waitlist.sql"), "utf8");
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/i);
    assert.match(sql, /UNIQUE \(talent_profile_id, country\)/);
  });
  it("both account-creation sites refuse non-live countries server side", () => {
    for (const f of ["stripe-connect-talent.ts", "stripe-connect.ts"]) {
      assert.match(readFileSync(join(__dirname, f), "utf8"), /payoutCountryRefusalCode\(/, f);
    }
    assert.equal(payoutCountryRefusalCode("FR"), "payout_setup:coming_soon:FR");
  });
});
