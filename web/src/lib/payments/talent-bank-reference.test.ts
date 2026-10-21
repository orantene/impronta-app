import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addOwnManualPayoutAccount, loadAddablePayoutWorkspaces, loadOwnManualPayoutAccounts, saveOwnBankReference } from "./talent-bank-reference";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeDb(tables: Tables, opts: { failTable?: string } = {}) {
  const writes: Array<{ table: string; patch: Row }> = [];
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let patch: Row | null = null;
      const q: Record<string, unknown> = {};
      const run = () => {
        if (opts.failTable === table) return { data: null, error: { message: "boom" } };
        if (patch) {
          for (const r of rows) Object.assign(tables[table].find((x) => x === r) ?? r, patch);
          writes.push({ table, patch });
          return { data: null, error: null };
        }
        return { data: rows, error: null };
      };
      q.select = () => q;
      q.update = (p: Row) => ((patch = p), q);
      q.neq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q);
      q.insert = async (row: Row) => {
        (tables[table] ??= []).push({ id: `new-${(tables[table] ?? []).length}`, ...row });
        writes.push({ table, patch: row });
        return { error: null };
      };
      q.eq = (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q);
      q.in = (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q);
      q.maybeSingle = async () => {
        const r = run();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res);
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, writes };
}

const U = "user-1";
const TP = "tp-1";
const ref = { holder: "Ana Ruiz", bankName: "BBVA", last4: "1234" };
const base = (): Tables => ({
  talent_profiles: [{ id: TP, user_id: U }, { id: "tp-2", user_id: "user-2" }],
  agencies: [{ id: "t1", display_name: "Studio One" }],
  payout_accounts: [
    { id: "pa1", tenant_id: "t1", owner_type: "talent", owner_id: TP, provider: "manual_bank", status: "pending_verification", provider_account_id: null, bank_holder_name: null, bank_name: null, bank_last4: null },
    { id: "pa-other", tenant_id: "t1", owner_type: "talent", owner_id: "tp-2", provider: "manual_bank", status: "pending_verification", provider_account_id: null, bank_holder_name: null, bank_name: null, bank_last4: null },
    { id: "pa-agency", tenant_id: "t1", owner_type: "agency", owner_id: "t1", provider: "manual_bank", status: "pending_verification", provider_account_id: null },
  ],
});

describe("loadOwnManualPayoutAccounts", () => {
  it("lists only the signed-in talent's own manual accounts, with the workspace name", async () => {
    const { db } = fakeDb(base());
    const list = await loadOwnManualPayoutAccounts(db, U);
    assert.deepEqual(list.map((a) => [a.id, a.workspaceName, a.status]), [["pa1", "Studio One", "pending_verification"]]);
  });
  it("is empty for a user with no talent profile, and on a failed read", async () => {
    assert.deepEqual(await loadOwnManualPayoutAccounts(fakeDb(base()).db, "nobody"), []);
    assert.deepEqual(await loadOwnManualPayoutAccounts(fakeDb(base(), { failTable: "payout_accounts" }).db, U), []);
  });
});

describe("saveOwnBankReference", () => {
  it("saves the masked reference on the talent's own account and never changes the status", async () => {
    const t = base();
    const { db } = fakeDb(t);
    assert.deepEqual(await saveOwnBankReference(db, { userId: U, accountId: "pa1", reference: ref }), { ok: true, backToPending: false });
    const row = t.payout_accounts[0];
    assert.equal(row.bank_last4, "1234");
    assert.equal(row.bank_holder_name, "Ana Ruiz");
    assert.equal(row.status, "pending_verification");
    assert.ok(row.bank_details_added_at);
  });

  it("refuses someone else's account, an agency account and an unknown id, writing nothing", async () => {
    const { db, writes } = fakeDb(base());
    for (const id of ["pa-other", "pa-agency", "nope"]) {
      assert.deepEqual(await saveOwnBankReference(db, { userId: U, accountId: id, reference: ref }), { ok: false, reason: "not_found" }, id);
    }
    assert.equal(writes.length, 0);
  });

  it("refuses a user with no talent profile", async () => {
    const { db, writes } = fakeDb(base());
    assert.deepEqual(await saveOwnBankReference(db, { userId: "nobody", accountId: "pa1", reference: ref }), { ok: false, reason: "not_found" });
    assert.equal(writes.length, 0);
  });

  it("changing the details of an owner-verified manual account sends it back to pending", async () => {
    const t = base();
    Object.assign(t.payout_accounts[0], { status: "connected", connected_at: "x", last_verified_at: "x", verified_by_profile_id: "owner", bank_holder_name: "Ana Ruiz", bank_name: "BBVA", bank_last4: "9999" });
    const { db } = fakeDb(t);
    assert.deepEqual(await saveOwnBankReference(db, { userId: U, accountId: "pa1", reference: ref }), { ok: true, backToPending: true });
    const row = t.payout_accounts[0];
    assert.equal(row.status, "pending_verification");
    assert.equal(row.connected_at, null);
    assert.equal(row.verified_by_profile_id, null);
  });

  it("saving identical details keeps a verified account verified", async () => {
    const t = base();
    Object.assign(t.payout_accounts[0], { status: "connected", bank_holder_name: "Ana Ruiz", bank_name: "BBVA", bank_last4: "1234" });
    const { db } = fakeDb(t);
    assert.deepEqual(await saveOwnBankReference(db, { userId: U, accountId: "pa1", reference: ref }), { ok: true, backToPending: false });
    assert.equal(t.payout_accounts[0].status, "connected");
  });

  it("a Stripe-linked account keeps its own verification when the reference changes", async () => {
    const t = base();
    Object.assign(t.payout_accounts[0], { status: "connected", provider_account_id: "acct_1", bank_last4: "9999" });
    const { db } = fakeDb(t);
    assert.deepEqual(await saveOwnBankReference(db, { userId: U, accountId: "pa1", reference: ref }), { ok: true, backToPending: false });
    assert.equal(t.payout_accounts[0].status, "connected");
  });

  it("a failed read or write fails closed", async () => {
    assert.deepEqual(await saveOwnBankReference(fakeDb(base(), { failTable: "payout_accounts" }).db, { userId: U, accountId: "pa1", reference: ref }), { ok: false, reason: "failed" });
  });

  it("never sets a status to connected", () => {
    const src = readFileSync(join(__dirname, "talent-bank-reference.ts"), "utf8");
    assert.ok(!/status: "connected"/.test(src));
  });
});

const withRoster = (): Tables => {
  const t = base();
  t.agencies = [{ id: "t1", display_name: "Studio One" }, { id: "t2", display_name: "Studio Two" }, { id: "t3", display_name: "Studio Three" }];
  t.agency_talent_roster = [
    { tenant_id: "t1", talent_profile_id: TP, status: "active" },
    { tenant_id: "t2", talent_profile_id: TP, status: "active" },
    { tenant_id: "t3", talent_profile_id: TP, status: "removed" },
    { tenant_id: "t2", talent_profile_id: "tp-2", status: "active" },
  ];
  return t;
};

describe("Add a manual payout account (per rostered workspace)", () => {
  it("offers only workspaces where she is rostered and has no account yet", async () => {
    // pa1 is her account in t1; t2 is rostered with none; t3 was removed.
    const list = await loadAddablePayoutWorkspaces(fakeDb(withRoster()).db, U);
    assert.deepEqual(list, [{ tenantId: "t2", workspaceName: "Studio Two" }]);
  });

  it("offers nothing to a user with no profile, and nothing on a failed read", async () => {
    assert.deepEqual(await loadAddablePayoutWorkspaces(fakeDb(withRoster()).db, "nobody"), []);
    assert.deepEqual(await loadAddablePayoutWorkspaces(fakeDb(withRoster(), { failTable: "agency_talent_roster" }).db, U), []);
  });

  it("creates the account PENDING for a rostered workspace, owned by her own profile", async () => {
    const t = withRoster();
    const { db, writes } = fakeDb(t);
    assert.deepEqual(await addOwnManualPayoutAccount(db, { userId: U, userEmail: "a@b.c", tenantId: "t2" }), { ok: true, existed: false });
    const ins = writes.find((w) => w.table === "payout_accounts")!.patch;
    assert.equal(ins.status, "pending_verification");
    assert.equal(ins.owner_type, "talent");
    assert.equal(ins.owner_id, TP);
    assert.equal(ins.tenant_id, "t2");
    assert.equal(ins.connected_at, undefined);
  });

  it("refuses a workspace where she is not rostered (or was removed), and a user with no profile", async () => {
    const t = withRoster();
    const { db, writes } = fakeDb(t);
    assert.deepEqual(await addOwnManualPayoutAccount(db, { userId: U, tenantId: "t3" }), { ok: false, reason: "not_rostered" });
    assert.deepEqual(await addOwnManualPayoutAccount(db, { userId: U, tenantId: "t9" }), { ok: false, reason: "not_rostered" });
    assert.deepEqual(await addOwnManualPayoutAccount(db, { userId: "nobody", tenantId: "t2" }), { ok: false, reason: "forbidden" });
    assert.equal(writes.length, 0);
  });

  it("a second click reuses the existing account instead of adding another", async () => {
    const { db, writes } = fakeDb(withRoster());
    assert.deepEqual(await addOwnManualPayoutAccount(db, { userId: U, tenantId: "t1" }), { ok: true, existed: true });
    assert.equal(writes.length, 0);
  });
});

describe("talent surface wiring", () => {
  const src = join(__dirname, "..", "..");
  const read = (rel: string) => readFileSync(join(src, rel), "utf8");
  const dir = "app/(workspace)/[tenantSlug]/talent/settings/payouts";

  it("the action validates the reference, checks impersonation, and takes the user from the session, not the form", () => {
    const s = read(`${dir}/manual-bank-actions.ts`);
    assert.match(s, /assertNotImpersonating\(\)/);
    assert.match(s, /parseBankReference\(/);
    assert.match(s, /userId: session\.user\.id/);
    assert.ok(!/userId: input\./.test(s));
    assert.ok(!/markPayoutAccountVerified/.test(s));
  });

  it("the add button calls the action, which uses the session user and the shared connect path", () => {
    const a = read(`${dir}/manual-bank-actions.ts`);
    assert.match(a, /addOwnManualPayoutAccount\(admin, \{ userId: session\.user\.id/);
    assert.match(a, /export async function addMyManualPayoutAccount[\s\S]{0,200}assertNotImpersonating\(\)/);
    const card = read(`${dir}/ManualBankReferenceCard.tsx`);
    assert.match(card, /addMyManualPayoutAccount\(\{ tenantId \}\)/);
    assert.match(card, /addable\.map/);
    const lib = read("lib/payments/talent-bank-reference.ts");
    assert.match(lib, /connectTalentPayoutAccount\(admin, \{[^}]*talentProfileId: tp/);
  });

  it("the card is mounted in the talent payouts shell and has ES text for every string", () => {
    assert.match(read(`${dir}/PayoutsShell.tsx`), /<ManualBankReferenceCard \/>/);
    const card = read(`${dir}/ManualBankReferenceCard.tsx`);
    const i18nDir = "components/admin/shell/internal";
    const es = readdirSync(join(src, i18nDir))
      .filter((f) => /^dashboard-i18n.*\.ts$/.test(f))
      .map((f) => read(`${i18nDir}/${f}`))
      .join("\n");
    const strings = [...card.matchAll(/copy\.t\(\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(strings.length >= 12);
    for (const str of strings) assert.ok(es.includes(`"${str}"`), `no ES for: ${str}`);
  });

  it("copy has no em dashes and the card uses no hex colours", () => {
    const card = read(`${dir}/ManualBankReferenceCard.tsx`);
    assert.ok(!card.includes("—"));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(card));
  });
});
