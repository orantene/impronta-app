import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { connectTalentPayoutAccount } from "./talent-payout-connect";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** In-memory service client: eq / neq / in filters, insert with a unique-index emulation, call log. */
function fakeAdmin(tables: Tables, opts: { insertError?: { code?: string; message: string }; failTable?: string } = {}) {
  const inserts: Row[] = [];
  const admin = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {};
      const result = () => (opts.failTable === table ? { data: null, error: { message: "boom" } } : { data: rows, error: null });
      q.select = () => q;
      q.eq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q);
      q.neq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q);
      q.in = (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q);
      q.maybeSingle = async () => {
        const r = result();
        return r.error ? r : { data: rows[0] ?? null, error: null };
      };
      q.insert = async (row: Row) => {
        if (opts.insertError) return { error: opts.insertError };
        inserts.push(row);
        return { error: null };
      };
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, inserts };
}

const U = "user-1";
const T = "tenant-1";
const TP = "tp-1";
const base = (): Tables => ({
  talent_profiles: [{ id: TP, user_id: U, display_name: "  Ana Ruiz " }, { id: "tp-2", user_id: "user-2", display_name: "Other" }],
  agency_talent_roster: [{ id: "r1", tenant_id: T, talent_profile_id: TP, status: "active" }],
  payout_accounts: [],
});
const input = { userId: U, userEmail: "ana@example.com", tenantId: T, talentProfileId: TP };

describe("connectTalentPayoutAccount", () => {
  it("inserts a connected talent account for the rostered owner, in the shape the readers expect", async () => {
    const { admin, inserts } = fakeAdmin(base());
    assert.deepEqual(await connectTalentPayoutAccount(admin, input), { ok: true, existed: false });
    assert.equal(inserts.length, 1);
    assert.deepEqual({ ...inserts[0], connected_at: "x" }, {
      tenant_id: T, owner_type: "talent", owner_id: TP, display_name: "Ana Ruiz", provider: "manual_bank", status: "connected", connected_at: "x",
    });
  });

  it("refuses a profile that belongs to someone else, and inserts nothing", async () => {
    const { admin, inserts } = fakeAdmin(base());
    const r = await connectTalentPayoutAccount(admin, { ...input, talentProfileId: "tp-2" });
    assert.deepEqual(r, { ok: false, reason: "forbidden" });
    assert.equal(inserts.length, 0);
  });

  it("refuses an unknown profile", async () => {
    const { admin, inserts } = fakeAdmin(base());
    assert.deepEqual(await connectTalentPayoutAccount(admin, { ...input, talentProfileId: "nope" }), { ok: false, reason: "forbidden" });
    assert.equal(inserts.length, 0);
  });

  it("refuses a talent who is not rostered in THIS workspace (or was removed)", async () => {
    const { admin, inserts } = fakeAdmin(base());
    assert.deepEqual(await connectTalentPayoutAccount(admin, { ...input, tenantId: "tenant-2" }), { ok: false, reason: "not_rostered" });
    const t = base();
    t.agency_talent_roster = [{ id: "r1", tenant_id: T, talent_profile_id: TP, status: "removed" }];
    const second = fakeAdmin(t);
    assert.deepEqual(await connectTalentPayoutAccount(second.admin, input), { ok: false, reason: "not_rostered" });
    assert.equal(inserts.length + second.inserts.length, 0);
  });

  it("reuses an active account instead of inserting a second one", async () => {
    const t = base();
    t.payout_accounts = [{ id: "pa1", tenant_id: T, owner_type: "talent", owner_id: TP, status: "pending_verification" }];
    const { admin, inserts } = fakeAdmin(t);
    assert.deepEqual(await connectTalentPayoutAccount(admin, input), { ok: true, existed: true });
    assert.equal(inserts.length, 0);
  });

  it("a disconnected account does not count: a new one is created", async () => {
    const t = base();
    t.payout_accounts = [{ id: "pa1", tenant_id: T, owner_type: "talent", owner_id: TP, status: "disconnected" }];
    const { admin, inserts } = fakeAdmin(t);
    assert.deepEqual(await connectTalentPayoutAccount(admin, input), { ok: true, existed: false });
    assert.equal(inserts.length, 1);
  });

  it("a double click that loses the race on the unique index counts as already connected", async () => {
    const { admin } = fakeAdmin(base(), { insertError: { code: "23505", message: "duplicate key" } });
    assert.deepEqual(await connectTalentPayoutAccount(admin, input), { ok: true, existed: true });
  });

  it("any other insert error is a failure", async () => {
    const { admin } = fakeAdmin(base(), { insertError: { code: "42501", message: "rls" } });
    assert.deepEqual(await connectTalentPayoutAccount(admin, input), { ok: false, reason: "failed" });
  });

  it("a failed ownership, roster or existing-account read fails closed and inserts nothing", async () => {
    for (const failTable of ["talent_profiles", "agency_talent_roster", "payout_accounts"]) {
      const { admin, inserts } = fakeAdmin(base(), { failTable });
      assert.deepEqual(await connectTalentPayoutAccount(admin, input), { ok: false, reason: "failed" }, failTable);
      assert.equal(inserts.length, 0, failTable);
    }
  });

  it("falls back to the email, then a generic name, when the profile has no display name", async () => {
    const t = base();
    t.talent_profiles = [{ id: TP, user_id: U, display_name: "  " }];
    const a = fakeAdmin(t);
    await connectTalentPayoutAccount(a.admin, input);
    assert.equal(a.inserts[0].display_name, "ana@example.com");
    const b = fakeAdmin(t);
    await connectTalentPayoutAccount(b.admin, { ...input, userEmail: null });
    assert.equal(b.inserts[0].display_name, "Talent payout account");
  });
});

describe("connectTalentPayoutAccountAction wiring", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "(workspace)", "[tenantSlug]", "talent", "settings", "actions.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function connectTalentPayoutAccountAction"));

  it("writes through the service role helper, never on the user session", () => {
    assert.match(fn, /createServiceRoleClient\(\)/);
    assert.match(fn, /connectTalentPayoutAccount\(admin,/);
    assert.ok(!fn.includes("createSupabaseServerClient"));
    assert.ok(!fn.includes('.from("payout_accounts")'));
  });

  it("passes the signed-in user and the workspace scope, not form-supplied owners", () => {
    assert.match(fn, /userId: session\.user\.id/);
    assert.match(fn, /tenantId: scope\.tenantId/);
  });
});
