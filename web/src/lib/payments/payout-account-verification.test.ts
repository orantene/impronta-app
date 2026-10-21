import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canMarkVerified,
  markPayoutAccountVerified,
  parseBankReference,
  saveBankReference,
  summarizeAgencyAccountState,
  syncPayoutAccountFromStripe,
} from "./payout-account-verification";

type Row = Record<string, unknown>;

/** In-memory payout_accounts: select / update with eq + in filters, update(...).select(), a write log. */
function fakeDb(initial: Row[], opts: { failRead?: boolean; failUpdate?: boolean } = {}) {
  const rows = initial.map((r) => ({ ...r }));
  const writes: Row[] = [];
  const db = {
    from(table: string) {
      assert.equal(table, "payout_accounts");
      let filters: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (p: Row) => ((patch = p), q);
      q.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
      q.in = (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q);
      const matched = () => rows.filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (patch) {
          if (opts.failUpdate) return { data: null, error: { message: "boom" } };
          const hit = matched();
          for (const r of hit) Object.assign(r, patch);
          writes.push({ ...patch, _n: hit.length });
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        }
        if (opts.failRead) return { data: null, error: { message: "boom" } };
        return { data: matched(), error: null };
      };
      q.maybeSingle = async () => {
        const r = run();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res);
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, rows, writes };
}

const T = "tenant-1";
const pending = (over: Row = {}): Row => ({
  id: "pa1", tenant_id: T, owner_type: "agency", owner_id: T, provider: "manual_bank", status: "pending_verification",
  provider_account_id: null, bank_holder_name: "Ana Ruiz", bank_name: "BBVA", bank_last4: "1234", ...over,
});

describe("parseBankReference", () => {
  it("accepts holder, bank and exactly 4 digits, and tidies spaces", () => {
    assert.deepEqual(parseBankReference({ holder: "  Ana   Ruiz ", bankName: " BBVA ", last4: "1234" }), {
      ok: true, value: { holder: "Ana Ruiz", bankName: "BBVA", last4: "1234" },
    });
  });
  it("refuses a missing holder or bank and anything but 4 digits (never a full account number)", () => {
    assert.deepEqual(parseBankReference({ holder: "", bankName: "BBVA", last4: "1234" }), { ok: false, reason: "holder" });
    assert.deepEqual(parseBankReference({ holder: "Ana", bankName: " ", last4: "1234" }), { ok: false, reason: "bank" });
    for (const bad of ["123", "12345", "12a4", "0123456789012345", ""]) {
      assert.deepEqual(parseBankReference({ holder: "Ana", bankName: "BBVA", last4: bad }), { ok: false, reason: "last4" }, bad);
    }
  });
});

describe("canMarkVerified", () => {
  const ok = { provider: "manual_bank", status: "pending_verification", bank_holder_name: "A B", bank_name: "BBVA", bank_last4: "1234" };
  it("needs a manual, pending account with a full bank reference", () => {
    assert.equal(canMarkVerified(ok), true);
    assert.equal(canMarkVerified({ ...ok, bank_last4: null }), false);
    assert.equal(canMarkVerified({ ...ok, bank_name: " " }), false);
    assert.equal(canMarkVerified({ ...ok, bank_holder_name: null }), false);
    assert.equal(canMarkVerified({ ...ok, status: "connected" }), false);
    assert.equal(canMarkVerified({ ...ok, provider: "stripe_connect" }), false);
  });
});

describe("syncPayoutAccountFromStripe (auto promotion)", () => {
  it("promotes a pending talent account when payouts are enabled, in every workspace, and records the Stripe id", async () => {
    const { db, rows } = fakeDb([
      pending({ id: "a", tenant_id: "t1", owner_type: "talent", owner_id: "tp1" }),
      pending({ id: "b", tenant_id: "t2", owner_type: "talent", owner_id: "tp1" }),
      pending({ id: "c", tenant_id: "t1", owner_type: "talent", owner_id: "tp2" }),
    ]);
    const r = await syncPayoutAccountFromStripe(db, { ownerType: "talent", ownerId: "tp1", stripeAccountId: "acct_1", payoutsEnabled: true });
    assert.equal(r.promoted, 2);
    for (const id of ["a", "b"]) {
      const row = rows.find((x) => x.id === id)!;
      assert.equal(row.status, "connected");
      assert.equal(row.provider_account_id, "acct_1");
      assert.ok(row.connected_at && row.last_verified_at);
    }
    assert.equal(rows.find((x) => x.id === "c")!.status, "pending_verification");
  });

  it("links the Stripe id but stays pending while payouts are not enabled", async () => {
    const { db, rows } = fakeDb([pending({ id: "a", owner_type: "talent", owner_id: "tp1" })]);
    const r = await syncPayoutAccountFromStripe(db, { ownerType: "talent", ownerId: "tp1", stripeAccountId: "acct_1", payoutsEnabled: false });
    assert.equal(r.promoted, 0);
    assert.equal(rows[0].status, "pending_verification");
    assert.equal(rows[0].provider_account_id, "acct_1");
    assert.equal(rows[0].connected_at, undefined);
  });

  it("never demotes a connected account and writes nothing when already in sync", async () => {
    const { db, rows, writes } = fakeDb([pending({ id: "a", status: "connected", provider_account_id: "acct_1" })]);
    await syncPayoutAccountFromStripe(db, { ownerType: "agency", ownerId: T, stripeAccountId: "acct_1", payoutsEnabled: false });
    assert.equal(rows[0].status, "connected");
    assert.equal(writes.length, 0);
  });

  it("an agency's own account is matched under its own tenant only", async () => {
    const { db, rows } = fakeDb([pending({ id: "a" }), pending({ id: "b", tenant_id: "other", owner_id: T })]);
    const r = await syncPayoutAccountFromStripe(db, { ownerType: "agency", ownerId: T, stripeAccountId: "acct_9", payoutsEnabled: true });
    assert.equal(r.promoted, 1);
    assert.equal(rows.find((x) => x.id === "b")!.status, "pending_verification");
  });

  it("a failed read promotes nothing", async () => {
    const { db, writes } = fakeDb([pending()], { failRead: true });
    assert.deepEqual(await syncPayoutAccountFromStripe(db, { ownerType: "agency", ownerId: T, stripeAccountId: "acct_1", payoutsEnabled: true }), { promoted: 0 });
    assert.equal(writes.length, 0);
  });
});

describe("saveBankReference", () => {
  const ref = { holder: "Ana Ruiz", bankName: "BBVA", last4: "1234" };
  it("stores the masked reference on a manual account of this workspace", async () => {
    const { db, rows } = fakeDb([pending({ bank_holder_name: null, bank_name: null, bank_last4: null })]);
    assert.deepEqual(await saveBankReference(db, { tenantId: T, accountId: "pa1", reference: ref }), { ok: true });
    assert.equal(rows[0].bank_last4, "1234");
    assert.ok(rows[0].bank_details_added_at);
  });
  it("refuses another workspace's account and a non-manual account", async () => {
    const { db, writes } = fakeDb([pending({ tenant_id: "other" }), pending({ id: "pa2", provider: "stripe_connect" })]);
    assert.deepEqual(await saveBankReference(db, { tenantId: T, accountId: "pa1", reference: ref }), { ok: false, reason: "not_found" });
    assert.deepEqual(await saveBankReference(db, { tenantId: T, accountId: "pa2", reference: ref }), { ok: false, reason: "not_manual" });
    assert.equal(writes.length, 0);
  });
});

describe("markPayoutAccountVerified (owner action core)", () => {
  it("verifies a pending manual account that has a bank reference, stamping who and when", async () => {
    const { db, rows } = fakeDb([pending()]);
    const r = await markPayoutAccountVerified(db, { tenantId: T, accountId: "pa1", actorProfileId: "owner-1" });
    assert.deepEqual(r, { ok: true, ownerType: "agency", ownerId: T });
    assert.equal(rows[0].status, "connected");
    assert.equal(rows[0].verified_by_profile_id, "owner-1");
    assert.ok(rows[0].connected_at && rows[0].last_verified_at);
  });

  it("is tenant-scoped: another workspace's account is not found and untouched", async () => {
    const { db, rows } = fakeDb([pending({ tenant_id: "other" })]);
    assert.deepEqual(await markPayoutAccountVerified(db, { tenantId: T, accountId: "pa1", actorProfileId: "o" }), { ok: false, reason: "not_found" });
    assert.equal(rows[0].status, "pending_verification");
  });

  it("refuses without a bank reference", async () => {
    const { db, rows } = fakeDb([pending({ bank_last4: null })]);
    assert.deepEqual(await markPayoutAccountVerified(db, { tenantId: T, accountId: "pa1", actorProfileId: "o" }), { ok: false, reason: "no_bank_details" });
    assert.equal(rows[0].status, "pending_verification");
  });

  it("refuses an account that is not pending or not manual", async () => {
    const a = fakeDb([pending({ status: "connected" })]);
    assert.deepEqual(await markPayoutAccountVerified(a.db, { tenantId: T, accountId: "pa1", actorProfileId: "o" }), { ok: false, reason: "not_pending" });
    const b = fakeDb([pending({ provider: "stripe_connect" })]);
    assert.deepEqual(await markPayoutAccountVerified(b.db, { tenantId: T, accountId: "pa1", actorProfileId: "o" }), { ok: false, reason: "not_manual" });
  });

  it("a double click verifies once (compare-and-set on status)", async () => {
    const { db } = fakeDb([pending()]);
    const first = await markPayoutAccountVerified(db, { tenantId: T, accountId: "pa1", actorProfileId: "o" });
    const second = await markPayoutAccountVerified(db, { tenantId: T, accountId: "pa1", actorProfileId: "o" });
    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: false, reason: "not_pending" });
  });

  it("a failed read or update fails closed", async () => {
    assert.deepEqual(await markPayoutAccountVerified(fakeDb([pending()], { failRead: true }).db, { tenantId: T, accountId: "pa1", actorProfileId: "o" }), { ok: false, reason: "failed" });
    const u = fakeDb([pending()], { failUpdate: true });
    assert.deepEqual(await markPayoutAccountVerified(u.db, { tenantId: T, accountId: "pa1", actorProfileId: "o" }), { ok: false, reason: "failed" });
    assert.equal(u.rows[0].status, "pending_verification");
  });
});

describe("summarizeAgencyAccountState (the payouts card)", () => {
  it("connected wins, then pending, else none; disconnected rows do not count", () => {
    assert.equal(summarizeAgencyAccountState([{ status: "pending_verification" }, { status: "connected" }]), "connected");
    assert.equal(summarizeAgencyAccountState([{ status: "pending_verification" }]), "pending_verification");
    assert.equal(summarizeAgencyAccountState([{ status: "connected", disconnected_at: "2026-10-01" }]), "none");
    assert.equal(summarizeAgencyAccountState([]), "none");
  });
});

describe("wiring", () => {
  const src = join(__dirname, "..", "..");
  const read = (rel: string) => readFileSync(join(src, rel), "utf8");
  const acct = "app/(workspace)/[tenantSlug]/admin/account";

  it("both Stripe snapshot persisters promote pending accounts, best effort", () => {
    for (const [f, owner] of [["lib/payments/stripe-connect-talent.ts", "talent"], ["lib/payments/stripe-connect.ts", "agency"]] as const) {
      const s = read(f);
      assert.match(s, new RegExp(`syncPayoutAccountFromStripe\\(admin, \\{ ownerType: "${owner}"`), f);
      assert.match(s, /payoutsEnabled \}\);\s*\} catch \(err\)/, f);
    }
  });

  it("the actions are owner only: the owner capability, not manage_billing, tenant from the scope", () => {
    const s = read(`${acct}/payout-verification-actions.ts`);
    assert.match(s, /userHasCapability\("agency\.payout_account\.manage", scope\.tenantId\)/);
    assert.ok(!/userHasCapability\("manage_billing"/.test(s));
    assert.match(s, /getTenantScopeBySlug\(tenantSlug\)/);
    assert.ok(!/formData\.get\("tenantId"\)/.test(s));
    assert.match(s, /markPayoutAccountVerified\(admin, \{ tenantId, accountId, actorProfileId: userId \}\)/);
    assert.match(s, /"billing\.payout_account\.verified"/);
    assert.equal((s.match(/await requireNotImpersonating\(\);/g) ?? []).length, 2);
  });

  it("the account page shows the verify section to the owner capability only", () => {
    const s = read(`${acct}/page.tsx`);
    assert.match(s, /canManageWorkspacePayout \? await loadPendingPayoutAccounts/);
    assert.match(s, /canManageWorkspacePayout \? <PendingPayoutAccounts/);
  });

  it("the Stripe payouts card shows Pending verification and opens the pending section", () => {
    const a = read("app/(workspace)/[tenantSlug]/admin/settings/integration-actions.ts");
    assert.match(a, /tenantPayoutAccountState\(tenantId\)/);
    assert.match(a, /"pending_verification"/);
    assert.match(a, /admin\/account#pending-payouts/);
    const st = read("components/admin/integrations/integration-status.ts");
    assert.match(st, /integration\.status === "pending_verification"[\s\S]{0,200}kind: "pending_verification"/);
    assert.ok(st.indexOf('integration.status === "pending_verification"') < st.indexOf('integration.status === "connected"'));
  });

  it("EN and ES copy exist for every key and use no em dashes", () => {
    const keys = readFileSync(join(__dirname, "..", "..", "..", "messages", "en.json"), "utf8");
    const es = readFileSync(join(__dirname, "..", "..", "..", "messages", "es.json"), "utf8");
    const names = [...keys.matchAll(/"(payoutVerify\w+)":/g)].map((m) => m[1]);
    assert.ok(names.length >= 20);
    for (const n of names) assert.ok(es.includes(`"${n}":`), `es missing ${n}`);
    for (const f of [keys, es]) {
      for (const line of f.split("\n")) if (/"payoutVerify\w+":|"pendingVerification":/.test(line)) assert.ok(!line.includes("—"), line);
    }
    assert.match(keys, /"pendingVerification": "Pending verification"/);
    assert.match(es, /"pendingVerification": "Verificación pendiente"/);
  });

  it("the migration is additive and stores a reference only", () => {
    const m = read("../../supabase/migrations/_pending_pm/20261231424300_payout_accounts_bank_reference_and_verification.sql");
    assert.ok(!/DROP (TABLE|COLUMN|POLICY)|TRUNCATE|DELETE FROM/i.test(m));
    assert.match(m, /ADD COLUMN IF NOT EXISTS bank_last4/);
    assert.match(m, /\^\[0-9\]\{4\}\$/);
  });
});
