/**
 * The payout receiver a payment link's money row gets (solo MXN talent fix),
 * on an injected fake. The fake records every `agencies` read: the only column ever read is
 * `workspace_type` (is the tenant talent-type), so the lane/currency never come from the tenant default.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLinkPayoutReceiver } from "./link-payout-receiver";

type Row = Record<string, unknown>;
type Tables = { inquiry_participants?: Row[]; talent_profiles?: Row[]; payout_accounts?: Row[]; agencies?: Row[] };
const agencyReads: string[] = [];

function fake(tables: Tables, opts: { failTable?: string } = {}): SupabaseClient {
  return {
    from: (table: string) => {
      let rows = (tables as Record<string, Row[] | undefined>)[table] ?? [];
      const b: Record<string, unknown> = {};
      b.select = (cols?: string) => {
        if (table === "agencies") agencyReads.push(cols ?? "*");
        return b;
      };
      b.maybeSingle = () => Promise.resolve(opts.failTable === table ? { data: null, error: { message: "db down" } } : { data: rows[0] ?? null, error: null });
      b.eq = (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return b;
      };
      b.in = (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return b;
      };
      b.then = (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
        resolve(opts.failTable === table ? { data: null, error: { message: "db down" } } : { data: rows, error: null });
      return b;
    },
  } as unknown as SupabaseClient;
}

const TENANT = "tenant-1";
const INQ = "inq-1";
const part = (talent: string): Row => ({ inquiry_id: INQ, role: "talent", status: "active", talent_profile_id: talent });
const profile = (id: string): Row => ({ id, default_currency: "MXN", stripe_account_platform: "mx" });
const account = (id: string, owner: string, type = "talent", status = "connected"): Row => ({
  id, tenant_id: TENANT, owner_type: type, owner_id: owner, status, display_name: `Acct ${id}`,
});

describe("resolveLinkPayoutReceiver", () => {
  it("one active talent seller with one connected account gives that account", async () => {
    const r = await resolveLinkPayoutReceiver(
      fake({ inquiry_participants: [part("t1")], talent_profiles: [profile("t1")], payout_accounts: [account("pa1", "t1")] }),
      { tenantId: TENANT, inquiryId: INQ },
    );
    assert.deepEqual(r, { payoutAccountId: "pa1", receiverKind: "talent", displayName: "Acct pa1" });
  });

  it("OWNER-talent (the Jorgelina shape): resolves through her talent profile, not the workspace's own account", async () => {
    const r = await resolveLinkPayoutReceiver(
      fake({
        inquiry_participants: [part("t1")],
        talent_profiles: [profile("t1")],
        payout_accounts: [account("pa-agency", TENANT, "agency"), account("pa-talent", "t1")],
      }),
      { tenantId: TENANT, inquiryId: INQ },
    );
    assert.equal(r?.payoutAccountId, "pa-talent");
  });

  it("several sellers give null", async () => {
    const r = await resolveLinkPayoutReceiver(
      fake({ inquiry_participants: [part("t1"), part("t2")], talent_profiles: [profile("t1"), profile("t2")], payout_accounts: [account("pa1", "t1"), account("pa2", "t2")] }),
      { tenantId: TENANT, inquiryId: INQ },
    );
    assert.equal(r, null);
  });

  it("no seller, or a link with no inquiry, gives null", async () => {
    assert.equal(await resolveLinkPayoutReceiver(fake({ payout_accounts: [account("pa1", "t1")] }), { tenantId: TENANT, inquiryId: INQ }), null);
    assert.equal(await resolveLinkPayoutReceiver(fake({ inquiry_participants: [part("t1")], talent_profiles: [profile("t1")], payout_accounts: [account("pa1", "t1")] }), { tenantId: TENANT, inquiryId: null }), null);
  });

  it("no connected account, or two, gives null", async () => {
    const base = { inquiry_participants: [part("t1")], talent_profiles: [profile("t1")] };
    assert.equal(await resolveLinkPayoutReceiver(fake({ ...base, payout_accounts: [account("pa1", "t1", "talent", "pending_verification")] }), { tenantId: TENANT, inquiryId: INQ }), null);
    assert.equal(await resolveLinkPayoutReceiver(fake({ ...base, payout_accounts: [account("pa1", "t1"), account("pa2", "t1")] }), { tenantId: TENANT, inquiryId: INQ }), null);
  });

  it("a read error on the seller or the account gives null (never a guess)", async () => {
    const t: Tables = { inquiry_participants: [part("t1")], talent_profiles: [profile("t1")], payout_accounts: [account("pa1", "t1")] };
    assert.equal(await resolveLinkPayoutReceiver(fake(t, { failTable: "inquiry_participants" }), { tenantId: TENANT, inquiryId: INQ }), null);
    assert.equal(await resolveLinkPayoutReceiver(fake(t, { failTable: "payout_accounts" }), { tenantId: TENANT, inquiryId: INQ }), null);
  });

  it("another tenant's account for the same talent is not used", async () => {
    const other = { ...account("pa-other", "t1"), tenant_id: "tenant-2" };
    const r = await resolveLinkPayoutReceiver(
      fake({ inquiry_participants: [part("t1")], talent_profiles: [profile("t1")], payout_accounts: [other] }),
      { tenantId: TENANT, inquiryId: INQ },
    );
    assert.equal(r, null);
  });
});

describe("resolveLinkPayoutReceiver: a sale on a talent-type workspace uses the talent's own connected account", () => {
  const HUB = "hub-tenant";
  const base = { inquiry_participants: [part("t1")], talent_profiles: [profile("t1")] };
  const elsewhere = (id: string, status = "connected", providerAccountId = "acct_1"): Row => ({
    id, tenant_id: "rosa-business", owner_type: "talent", owner_id: "t1", status, display_name: `Acct ${id}`, provider_account_id: providerAccountId,
  });
  const hub = { agencies: [{ id: HUB, workspace_type: "talent" }] };

  it("the account is registered under ANOTHER tenant: a talent-type tenant uses it", async () => {
    const r = await resolveLinkPayoutReceiver(fake({ ...base, ...hub, payout_accounts: [elsewhere("pa-rosa")] }), { tenantId: HUB, inquiryId: INQ });
    assert.deepEqual(r, { payoutAccountId: "pa-rosa", receiverKind: "talent", displayName: "Acct pa-rosa" });
  });

  it("the same Stripe account registered under two tenants counts once; two different accounts give null", async () => {
    const same = await resolveLinkPayoutReceiver(fake({ ...base, ...hub, payout_accounts: [elsewhere("pa1"), elsewhere("pa2")] }), { tenantId: HUB, inquiryId: INQ });
    assert.equal(same?.payoutAccountId, "pa1");
    const two = await resolveLinkPayoutReceiver(fake({ ...base, ...hub, payout_accounts: [elsewhere("pa1"), elsewhere("pa2", "connected", "acct_2")] }), { tenantId: HUB, inquiryId: INQ });
    assert.equal(two, null);
  });

  it("a BUSINESS tenant never borrows another tenant's account (no redirect of a workspace sale)", async () => {
    const r = await resolveLinkPayoutReceiver(fake({ ...base, agencies: [{ id: HUB, workspace_type: "business" }], payout_accounts: [elsewhere("pa-rosa")] }), { tenantId: HUB, inquiryId: INQ });
    assert.equal(r, null);
  });

  it("not connected, a read error on the tenant or the accounts, or several sellers give null", async () => {
    assert.equal(await resolveLinkPayoutReceiver(fake({ ...base, ...hub, payout_accounts: [elsewhere("pa1", "pending_verification")] }), { tenantId: HUB, inquiryId: INQ }), null);
    const t: Tables = { ...base, ...hub, payout_accounts: [elsewhere("pa1")] };
    assert.equal(await resolveLinkPayoutReceiver(fake(t, { failTable: "agencies" }), { tenantId: HUB, inquiryId: INQ }), null);
    assert.equal(await resolveLinkPayoutReceiver(fake(t, { failTable: "payout_accounts" }), { tenantId: HUB, inquiryId: INQ }), null);
    const many: Tables = { inquiry_participants: [part("t1"), part("t2")], talent_profiles: [profile("t1"), profile("t2")], ...hub, payout_accounts: [elsewhere("pa1")] };
    assert.equal(await resolveLinkPayoutReceiver(fake(many), { tenantId: HUB, inquiryId: INQ }), null);
  });

  it("an account under this tenant still wins, and the only column ever read from agencies is workspace_type", async () => {
    const own = { ...account("pa-here", "t1"), tenant_id: HUB };
    const r = await resolveLinkPayoutReceiver(fake({ ...base, ...hub, payout_accounts: [own, elsewhere("pa-rosa")] }), { tenantId: HUB, inquiryId: INQ });
    assert.equal(r?.payoutAccountId, "pa-here");
    assert.ok(agencyReads.every((c) => c === "workspace_type"), `agencies reads: ${agencyReads.join(",")}`);
  });
});
