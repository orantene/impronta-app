/**
 * The payout receiver a payment link's money row gets (solo MXN talent fix),
 * on an injected fake. A fake that THROWS on any read of `agencies` pins that
 * the lane/currency never come from the tenant default.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLinkPayoutReceiver } from "./link-payout-receiver";

type Row = Record<string, unknown>;
type Tables = { inquiry_participants?: Row[]; talent_profiles?: Row[]; payout_accounts?: Row[] };

function fake(tables: Tables, opts: { failTable?: string } = {}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "agencies") throw new Error("the tenant default must never be read for the receiver");
      let rows = (tables as Record<string, Row[] | undefined>)[table] ?? [];
      const b: Record<string, unknown> = {};
      b.select = () => b;
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
