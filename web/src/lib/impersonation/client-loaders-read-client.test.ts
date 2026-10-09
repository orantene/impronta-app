import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClientUpcoming } from "@/app/(workspace)/[tenantSlug]/_data-bridge/client-upcoming";
import { loadClientInquiryDetails } from "@/app/(workspace)/[tenantSlug]/_data-bridge/client-inquiry-details";
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

  it("client-upcoming.ts: the parameter is not shadowed, and a passed client means no service-role fan-out", () => {
    const s = src("client-upcoming.ts");
    assert.match(s, /effectiveReadClient\?: SupabaseClient \| null/);
    assert.doesNotMatch(s, /readClient\?: SupabaseClient/);
    assert.match(s, /const supabase = effectiveReadClient \?\? \(await createSupabaseServerClient\(\)\);/);
    assert.match(s, /const admin = effectiveReadClient \? null : createServiceRoleClient\(\);/);
    assert.match(s, /const readClient = effectiveReadClient \?\? admin \?\? supabase;/);
    assert.equal((s.match(/createServiceRoleClient\(\)/g) ?? []).length, 1);
  });

  it("client-inquiry-details.ts: not shadowed; the verified client is ALSO the privileged one (approval + signed files)", () => {
    const s = src("client-inquiry-details.ts");
    assert.match(s, /effectiveReadClient\?: SupabaseClient \| null/);
    assert.doesNotMatch(s, /readClient\?: SupabaseClient/);
    assert.match(s, /const admin = effectiveReadClient \?\? createServiceRoleClient\(\);/);
    assert.match(s, /const readClient = admin \?\? supabase;/);
    assert.equal((s.match(/createServiceRoleClient\(\)/g) ?? []).length, 1, "no second service-role client");
  });

  it("inquiry details under impersonation still returns the offer approval and the signed attachments", async () => {
    const served: string[] = [];
    const tables: Record<string, unknown[]> = {
      inquiries: [{
        id: "inq1", tenant_id: "tenant-1", status: "approved", version: 3, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
        contact_name: "C", contact_email: null, contact_phone: null, company: null, event_date: null, event_location: null, quantity: null, message: "Hi",
        source_channel: "web", source_context: null, source_pitch_id: null, interpreted_query: {}, coordinator_id: null, coordinator_assigned_at: null,
        current_offer_id: "off1", policy_version_id: null,
      }],
      inquiry_offers: [{
        id: "off1", status: "sent", version: 1, total_client_price: 900, currency_code: "MXN", notes: null, valid_until: null, sent_at: "2026-10-01T00:00:00Z",
        rejection_reason: null, rejection_reason_text: null, deposit_pct: null, deposit_amount_cents: null, balance_collection_method: null, refund_policy_key: null,
        policy_version_id: null, inquiry_offer_line_items: [],
      }],
      inquiry_participants: [{ id: "cp1" }],
      inquiry_approvals: [{ status: "accepted" }],
      inquiry_attachments: [{ id: "a1", filename: "brief.pdf", mime_type: "application/pdf", storage_path: "inq1/brief.pdf", byte_size: 10, created_at: "2026-10-02T00:00:00Z" }],
    };
    const client = {
      from: (table: string) => {
        served.push(table);
        const rows = tables[table] ?? [];
        const q: FakeQuery = {
          eq: () => q, select: () => q, in: () => q, neq: () => q, order: () => q, limit: () => q, is: () => q, not: () => q, gte: () => q, lte: () => q,
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
        };
        return q;
      },
      storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })), error: null }) }) },
    } as unknown as SupabaseClient;

    const d = await loadClientInquiryDetails("tenant-1", "inq1", client);
    assert.ok(d, "the details came back (no read-before-declare)");
    assert.equal(d.offer?.myApprovalStatus, "accepted", "the offer approval is read through the passed (verified) client");
    assert.deepEqual(d.attachments.files.map((f) => f.url), ["https://signed.test/inq1/brief.pdf"], "signed attachments are produced");
    assert.ok(served.includes("inquiry_approvals"), "approval was read via the passed client");
  });
});
