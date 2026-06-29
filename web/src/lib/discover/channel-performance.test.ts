/**
 * UNIT TEST — channel-performance aggregation shape (Phase F).
 *
 * Pins the rollup the report depends on: leads keyed off
 * source_workspace_id grouped by source_channel with conversion counts,
 * plus referral earnings summed from booking_commission_snapshot rows
 * where channel_referral_party_id is this workspace.
 *
 * Drives an in-process fake supabase (no DB, no network), the same style
 * as commission-engine-xtenant.test.ts. The fake is injected via the
 * loader's optional `client` seam. It is keyed by table name and returns
 * a chain whose terminal `.eq()` resolves to the scripted rows — matching
 * exactly the `.from(t).select(c).eq(col,val)` shape the loader uses.
 *
 * Run: npx tsx --test src/lib/discover/channel-performance.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadChannelPerformance } from "./channel-performance";

type Outcome = { data?: unknown; error?: { message: string } | null };

function makeSupabase(script: Record<string, Outcome>): SupabaseClient {
  const from = (table: string) => {
    const out = script[table] ?? { data: [], error: null };
    const result = { data: out.data ?? [], error: out.error ?? null };
    const chain = {
      select: () => chain,
      // terminal — the loader awaits the result of `.eq(...)`
      eq: () => Promise.resolve(result),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const HUB = "tenant-hub";

describe("loadChannelPerformance — aggregation shape", () => {
  it("groups leads by source_channel and counts conversions", async () => {
    const client = makeSupabase({
      inquiries: {
        data: [
          { status: "new", source_channel: "hub_site" },
          { status: "booked", source_channel: "hub_site" },
          { status: "converted", source_channel: "discover_shortlist" },
          { status: "closed_lost", source_channel: "discover_shortlist" },
          { status: "approved", source_channel: "hub_site" },
        ],
      },
      booking_commission_snapshot: { data: [] },
    });

    const perf = await loadChannelPerformance({ tenantId: HUB, client });

    assert.equal(perf.tenantId, HUB);
    assert.equal(perf.totalLeads, 5);
    // booked + converted + approved = 3
    assert.equal(perf.totalConversions, 3);

    // sorted by leads desc → hub_site (3) then discover_shortlist (2)
    assert.equal(perf.byChannel.length, 2);
    assert.deepEqual(perf.byChannel[0], {
      channel: "hub_site",
      leads: 3,
      conversions: 2,
    });
    assert.deepEqual(perf.byChannel[1], {
      channel: "discover_shortlist",
      leads: 2,
      conversions: 1,
    });
  });

  it("sums channel_referral_cents only for positive legs and counts distinct bookings", async () => {
    const client = makeSupabase({
      inquiries: { data: [] },
      booking_commission_snapshot: {
        data: [
          { booking_id: "bk-1", channel_referral_cents: 2_000, channel_referral_party_id: HUB },
          { booking_id: "bk-1", channel_referral_cents: 1_500, channel_referral_party_id: HUB },
          { booking_id: "bk-2", channel_referral_cents: 500, channel_referral_party_id: HUB },
          // zero/null legs are ignored
          { booking_id: "bk-3", channel_referral_cents: 0, channel_referral_party_id: HUB },
          { booking_id: "bk-4", channel_referral_cents: null, channel_referral_party_id: HUB },
        ],
      },
    });

    const perf = await loadChannelPerformance({ tenantId: HUB, client });

    assert.equal(perf.referralEarnedCents, 4_000); // 2000 + 1500 + 500
    assert.equal(perf.referralBookingCount, 2); // bk-1, bk-2 (bk-3/bk-4 carry no money)
  });

  it("returns an empty shape when there are no rows", async () => {
    const client = makeSupabase({
      inquiries: { data: [] },
      booking_commission_snapshot: { data: [] },
    });

    const perf = await loadChannelPerformance({ tenantId: HUB, client });
    assert.equal(perf.totalLeads, 0);
    assert.equal(perf.totalConversions, 0);
    assert.equal(perf.referralEarnedCents, 0);
    assert.equal(perf.referralBookingCount, 0);
    assert.deepEqual(perf.byChannel, []);
  });

  it("does not let a referral-query error zero out the lead rollup", async () => {
    const client = makeSupabase({
      inquiries: {
        data: [{ status: "booked", source_channel: "hub_site" }],
      },
      booking_commission_snapshot: {
        data: null,
        error: { message: "column channel_referral_cents does not exist" },
      },
    });

    const perf = await loadChannelPerformance({ tenantId: HUB, client });
    assert.equal(perf.totalLeads, 1);
    assert.equal(perf.totalConversions, 1);
    assert.equal(perf.referralEarnedCents, 0);
    assert.equal(perf.byChannel.length, 1);
  });
});
