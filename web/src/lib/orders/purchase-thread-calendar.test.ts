/**
 * Path A calendar + guest-thread wiring on createPurchase.
 *
 * After instant book the buyer lands on `/c/[inquiryId]`. That page owns by
 * cookie === inquiries.guest_session_id; the talent agenda reads
 * talent_bookings; public slots already see the hold. These asserts pin the
 * three seams that were missing on the pay-in-person path.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPurchase, type PurchaseInput } from "@/lib/orders/purchase";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TENANT = "11111111-1111-1111-1111-111111111111";
const OFFERING = "22222222-2222-2222-2222-222222222222";
const POOL = "33333333-3333-3333-3333-333333333333";
const TALENT = "44444444-4444-4444-4444-444444444444";
const GUEST = "55555555-5555-5555-5555-555555555555";
const ACTOR = "66666666-6666-6666-6666-666666666666";

type Call = { table: string; op: string; payload?: unknown };

test("createPurchase keeps cookie guest_session_id even when actorUserId is set", () => {
  const thread = readFileSync(join(WEB_ROOT, "src/lib/orders/purchase-thread.ts"), "utf8");
  assert.doesNotMatch(
    thread,
    /guest_session_id:\s*input\.actorUserId\s*\?\s*null/,
    "clearing guest_session_id when signed-in is how /c/ 404s after instant book",
  );
  assert.match(
    thread,
    /guest_session_id:\s*input\.guestSessionId/,
    "thread insert must stamp the cookie session whenever it is present",
  );
});

test("createPurchase attaches holds, links the booking, and mirrors talent_bookings", () => {
  const purchase = readFileSync(join(WEB_ROOT, "src/lib/orders/purchase.ts"), "utf8");
  const thread = readFileSync(join(WEB_ROOT, "src/lib/orders/purchase-thread.ts"), "utf8");
  assert.match(purchase, /openPurchaseThread\(admin,/);
  // Call sites only — the import line also names these helpers.
  const attach = thread.indexOf("await attachReservationHoldToInquiry(");
  const bookingSrc = thread.indexOf("source_inquiry_id: inquiryId");
  const enrich = thread.indexOf("await enrichBookingFromReservation(admin, {");
  const threadInsert = thread.indexOf('.from("inquiries")');
  assert.ok(attach > threadInsert, "hold attach must follow the inquiry insert");
  assert.ok(bookingSrc > attach, "agency_bookings.source_inquiry_id must follow hold attach");
  assert.ok(enrich > bookingSrc, "talent_bookings mirror must follow the booking link");
});

function threadFakeAdmin() {
  const calls: Call[] = [];
  const holdsById = new Map<string, { inquiry_id: string | null; talent_profile_id: string; tenant_id: string; starts_at: string; ends_at: string; title: string | null; expires_at: string | null }>();

  const offeringRow = {
    id: OFFERING,
    tenant_id: TENANT,
    title: "Bozo",
    status: "published",
    price_type: "fixed",
    amount_cents: 10000,
    talent_profile_id: TALENT,
    reserve_mode: "full",
    deposit_pct: null,
    allow_pay_in_person: true,
    require_account_to_book: false,
    cancellation_hours: null,
    kind: "service",
    duration_minutes: 15,
  };

  const from = (table: string) => {
    let lastUpdate: unknown = null;
    let lastEq: Array<[string, unknown]> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return api;
      },
      update: (payload: unknown) => {
        lastUpdate = payload;
        lastEq = [];
        calls.push({ table, op: "update", payload });
        return api;
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return api;
      },
      eq: (col: string, val: unknown) => {
        lastEq.push([col, val]);
        if (table === "talent_holds" && lastUpdate && typeof lastUpdate === "object") {
          const idEq = lastEq.find((e) => e[0] === "id");
          if (idEq && typeof idEq[1] === "string") {
            const row = holdsById.get(idEq[1]);
            if (row && "inquiry_id" in (lastUpdate as object)) {
              row.inquiry_id = (lastUpdate as { inquiry_id: string }).inquiry_id;
            }
            if (row && "expires_at" in (lastUpdate as object)) {
              row.expires_at = (lastUpdate as { expires_at: string | null }).expires_at;
            }
          }
        }
        return api;
      },
      in: () => api,
      is: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        if (table === "talent_bookings") return { data: null, error: null };
        if (table === "inquiries") {
          return {
            data: {
              id: "inq_1",
              tenant_id: TENANT,
              source_context: null,
              event_timezone: "America/Argentina/Buenos_Aires",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (table === "orders") return { data: { id: "order_1" }, error: null };
        if (table === "customers") return { data: { id: "cust_1" }, error: null };
        if (table === "agency_bookings") return { data: { id: "booking_1" }, error: null };
        if (table === "booking_transactions") return { data: { id: "txn_1" }, error: null };
        if (table === "inquiries") return { data: { id: "inq_1" }, error: null };
        return { data: null, error: null };
      },
      then: undefined,
    };

    (api as { then: unknown }).then = (
      resolve: (v: { data: unknown; error: null }) => unknown,
    ) => {
      if (table === "talent_offerings") return resolve({ data: [offeringRow], error: null });
      if (table === "talent_profiles") {
        return resolve({
          data: [{ id: TALENT, user_id: ACTOR, claimed_at: "2026-01-01T00:00:00Z" }],
          error: null,
        });
      }
      if (table === "order_lines") {
        return resolve({
          data: [{ id: "line_1", offering_id: OFFERING, sort_order: 0 }],
          error: null,
        });
      }
      if (table === "capacity_pools") {
        return resolve({ data: [{ id: POOL, tenant_id: TENANT }], error: null });
      }
      if (table === "talent_holds") {
        // commitOrderTalentHolds + loadLiveHoldForInquiry + releaseHoldsForInquiry
        const rows = [...holdsById.entries()].map(([id, h]) => ({ id, ...h }));
        return resolve({ data: rows, error: null });
      }
      return resolve({ data: [], error: null });
    };
    return api;
  };

  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    calls.push({ table: `rpc:${fn}`, op: "rpc", payload: args });
    if (fn === "ensure_customer_for_tenant") return { data: "cust_1", error: null };
    if (fn === "reserve_resource_set_v2") {
      holdsById.set("hold_1", {
        inquiry_id: null,
        talent_profile_id: TALENT,
        tenant_id: TENANT,
        starts_at: "2026-09-28T16:15:00.000Z",
        ends_at: "2026-09-28T16:30:00.000Z",
        title: "Bozo",
        expires_at: "2026-09-27T18:30:00.000Z",
      });
      return {
        data: {
          ok: true,
          allocation_ids: ["alloc_1"],
          hold_ids: ["hold_1"],
        },
        error: null,
      };
    }
    if (fn === "messaging_sync_record_state") return { data: null, error: null };
    return { data: null, error: null };
  };

  return {
    calls,
    holdsById,
    admin: { from, rpc } as unknown as Parameters<typeof createPurchase>[0],
  };
}

function threadInput(overrides: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    tenantId: TENANT,
    clientOrderKey: "path-a-thread-1",
    actorUserId: ACTOR,
    guestSessionId: GUEST,
    openThread: true,
    paymentChoice: "in_person",
    sourceChannel: "instant_book",
    contact: { email: "qa@example.com", displayName: "QA" },
    lines: [{ offeringId: OFFERING, units: 1 }],
    reservation: {
      talentProfileId: TALENT,
      startsAt: "2026-09-28T16:15:00.000Z",
      endsAt: "2026-09-28T16:30:00.000Z",
      title: "Bozo",
      poolId: POOL,
    },
    ...overrides,
  };
}

test("openThread stamps guest_session_id with actorUserId, attaches hold, links booking, mirrors talent", async () => {
  const { calls, holdsById, admin } = threadFakeAdmin();
  const r = await createPurchase(admin, threadInput());
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(r.ok && r.inquiryId, "inq_1");
  assert.equal(r.ok && r.bookingId, "booking_1");

  const inq = calls.find((c) => c.table === "inquiries" && c.op === "insert");
  assert.ok(inq, "inquiry must be inserted");
  const inqPayload = inq.payload as Record<string, unknown>;
  assert.equal(inqPayload.guest_session_id, GUEST);
  assert.equal(inqPayload.client_user_id, ACTOR);

  assert.equal(holdsById.get("hold_1")?.inquiry_id, "inq_1", "hold must link to inquiry");

  const bookingLink = calls.find(
    (c) =>
      c.table === "agency_bookings"
      && c.op === "update"
      && (c.payload as { source_inquiry_id?: string }).source_inquiry_id === "inq_1",
  );
  assert.ok(bookingLink, "agency_bookings.source_inquiry_id must be stamped");

  const mirror = calls.find((c) => c.table === "talent_bookings" && c.op === "insert");
  assert.ok(mirror, "talent_bookings mirror must be written");
  const mirrorPayload = mirror.payload as Record<string, unknown>;
  assert.equal(mirrorPayload.inquiry_id, "inq_1");
  assert.equal(mirrorPayload.talent_profile_id, TALENT);
  assert.equal(mirrorPayload.status, "confirmed");
});
