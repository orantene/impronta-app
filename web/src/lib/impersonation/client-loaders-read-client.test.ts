import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClientUpcoming } from "@/app/(workspace)/[tenantSlug]/_data-bridge/client-upcoming";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const BRIDGE = "src/app/(workspace)/[tenantSlug]/_data-bridge";
const src = (f: string) => readFileSync(join(WEB_ROOT, BRIDGE, f), "utf8");

type FakeQuery = { eq: (k: string, v: unknown) => FakeQuery; [k: string]: unknown };

/** A read client that records which tables it served and answers per table. */
function fakeClient(answers: Record<string, unknown[]>) {
  const served: string[] = [];
  const client = {
    from: (table: string) => {
      served.push(table);
      const result = { data: answers[table] ?? [], error: null };
      const q: FakeQuery = {
        eq: () => q,
        select: () => q,
        in: () => q,
        gte: () => q,
        lte: () => q,
        neq: () => q,
        order: () => q,
        then: (res: (v: unknown) => void) => res(result),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, served };
}

const today = new Date().toISOString().slice(0, 10);

describe("client Today / inquiry loaders: the passed read client is the ONLY client used (#3128)", () => {
  it("loadClientUpcoming with a read client reads everything through it and returns the booking (no read-before-declare)", async () => {
    const f = fakeClient({
      inquiries: [{ id: "i1", event_date: today, event_location: "Playa", company: null, message: "Hi", status: "booked", interpreted_query: null, coordinator_id: null }],
      inquiry_participants: [],
    });
    const rows = await loadClientUpcoming("user-b", "tenant-1", f.client);
    assert.equal(rows.length, 1, "the row came back: the loader did not die on a shadowed read client");
    assert.equal(rows[0].inquiry_id, "i1");
    assert.ok(f.served.includes("inquiries") && f.served.includes("inquiry_participants"), "both reads went through the passed client");
  });

  it("loadClientUpcoming without a read client still resolves (own request client path), never rejects", async () => {
    await assert.doesNotReject(() => loadClientUpcoming("user-b", "tenant-1"));
  });

  for (const file of ["client-upcoming.ts", "client-inquiry-details.ts"]) {
    it(`${file}: the parameter is not shadowed, and a passed client means no service-role fan-out`, () => {
      const s = src(file);
      assert.match(s, /effectiveReadClient\?: SupabaseClient \| null/);
      // The crash: a parameter named readClient with a later `const readClient` in the same body.
      assert.doesNotMatch(s, /readClient\?: SupabaseClient/);
      assert.match(s, /const supabase = effectiveReadClient \?\? \(await createSupabaseServerClient\(\)\);/);
      assert.match(s, /const admin = effectiveReadClient \? null : createServiceRoleClient\(\);/);
      assert.match(s, /const readClient = effectiveReadClient \?\? admin \?\? supabase;/);
      // No other service-role client is minted in the loader.
      assert.equal((s.match(/createServiceRoleClient\(\)/g) ?? []).length, 1);
    });
  }
});
