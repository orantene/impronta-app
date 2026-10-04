/**
 * Order-backed purchase attribution: booking_talent + participants + snapshot.
 *
 * Pins the gap that left Linh's paid vanity checkout at $0 Collected:
 * createPurchase opened the booking/txn/order but never wrote the Money spine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { attributePurchaseBooking } from "./purchase-attribution";

const TENANT = "11111111-1111-1111-1111-111111111111";
const BOOKING = "22222222-2222-2222-2222-222222222222";
const ORDER = "33333333-3333-3333-3333-333333333333";
const INQUIRY = "44444444-4444-4444-4444-444444444444";
const TALENT = "4969d28b-9821-4905-8461-9eca760790a5";
const PARTICIPANT = "55555555-5555-5555-5555-555555555555";
const REQ_GROUP = "66666666-6666-6666-6666-666666666666";

type Call = { table: string; op: string; payload?: unknown };

function attributionFake(opts: {
  lines?: Array<{
    talent_profile_id: string | null;
    owner_tenant_id: string | null;
    total_cents: number;
    talent_cost_cents: number;
  }>;
  existingLeg?: boolean;
  existingParticipant?: boolean;
  persistFails?: boolean;
  /** Booking already linked — reuse instead of inserting a second inquiry. */
  existingBookingInquiryId?: string | null;
  existingOrderInquiryId?: string | null;
} = {}) {
  const calls: Call[] = [];
  const lines = opts.lines ?? [
    {
      talent_profile_id: TALENT,
      owner_tenant_id: null,
      total_cents: 10000,
      talent_cost_cents: 10000,
    },
  ];
  let bookingTalentSelectMode: "leg" | "header" = "leg";

  const from = (table: string) => {
    const api: Record<string, unknown> = {
      select: (cols?: string) => {
        if (
          table === "booking_talent"
          && typeof cols === "string"
          && cols.includes("talent_cost_total")
        ) {
          bookingTalentSelectMode = "header";
        } else if (table === "booking_talent") {
          bookingTalentSelectMode = "leg";
        }
        return api;
      },
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return api;
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload });
        return api;
      },
      eq: () => api,
      in: () => api,
      is: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        if (table === "booking_talent") {
          return {
            data: opts.existingLeg ? { id: "leg_1" } : null,
            error: null,
          };
        }
        if (table === "inquiry_participants") {
          return {
            data: opts.existingParticipant
              ? { id: PARTICIPANT, status: "active" }
              : null,
            error: null,
          };
        }
        if (table === "inquiry_requirement_groups") {
          return { data: null, error: null };
        }
        if (table === "agency_talent_roster") {
          return { data: null, error: null };
        }
        if (table === "agency_bookings") {
          return {
            data:
              opts.existingBookingInquiryId != null
                ? { source_inquiry_id: opts.existingBookingInquiryId }
                : { source_inquiry_id: null },
            error: null,
          };
        }
        if (table === "orders") {
          return {
            data:
              opts.existingOrderInquiryId != null
                ? { inquiry_id: opts.existingOrderInquiryId }
                : { inquiry_id: null },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (table === "inquiries") return { data: { id: INQUIRY }, error: null };
        if (table === "inquiry_requirement_groups") {
          return { data: { id: REQ_GROUP }, error: null };
        }
        return { data: null, error: null };
      },
      then: undefined,
    };

    (api as { then: unknown }).then = (
      resolve: (v: { data: unknown; error: null }) => unknown,
    ) => {
      if (table === "order_lines") return resolve({ data: lines, error: null });
      if (table === "agency_talent_roster") return resolve({ data: [], error: null });
      if (table === "booking_talent" && bookingTalentSelectMode === "header") {
        return resolve({
          data: [
            {
              talent_cost_total: 100,
              client_charge_total: 100,
              gross_profit: 0,
            },
          ],
          error: null,
        });
      }
      return resolve({ data: [], error: null });
    };
    return api;
  };

  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    calls.push({ table: `rpc:${fn}`, op: "rpc", payload: args });
    if (fn === "engine_load_commission_context") {
      return {
        data: {
          booking_id: BOOKING,
          home_tenant_id: TENANT,
          offer_id: null,
          currency_code: "USD",
          platform_config: {
            default_take_bps: 600,
            default_take_floor_cents: 0,
            plan_tier_bps: {},
            cash_settlement_threshold_cents: 0,
            cash_settlement_currency: "USD",
          },
          participants: [
            {
              participant_id: PARTICIPANT,
              talent_profile_id: TALENT,
              owning_party_type: "talent",
              owning_party_id: TALENT,
              tenant_id: null,
              workspace_plan: null,
              tenant_override: null,
              offer_line_items: [
                {
                  units: 1,
                  line_total_cents: 10000,
                  talent_cost_total_cents: 10000,
                },
              ],
            },
          ],
          source_workspace_id: TENANT,
          hub_referral_bps: 0,
        },
        error: null,
      };
    }
    if (fn === "engine_persist_booking_commission_snapshot") {
      if (opts.persistFails) {
        return { data: null, error: { message: "persist boom" } };
      }
      return { data: [], error: null };
    }
    if (fn === "engine_platform_commission_split") {
      return { data: null, error: null };
    }
    if (fn === "inquiry_audit_emit") return { data: null, error: null };
    return { data: null, error: null };
  };

  return {
    calls,
    admin: { from, rpc } as unknown as Parameters<typeof attributePurchaseBooking>[0],
  };
}

test("attributePurchaseBooking writes booking_talent + talent participant + snapshot", async () => {
  const { calls, admin } = attributionFake();
  const r = await attributePurchaseBooking(admin, {
    tenantId: TENANT,
    bookingId: BOOKING,
    orderId: ORDER,
    inquiryId: INQUIRY,
  });

  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ok && r.talentLegs, 1);
  assert.equal(r.ok && r.snapshotOk, true);

  const leg = calls.find((c) => c.table === "booking_talent" && c.op === "insert");
  assert.ok(leg, "booking_talent leg must be inserted");
  const legPayload = leg.payload as Record<string, unknown>;
  assert.equal(legPayload.talent_profile_id, TALENT);
  assert.equal(legPayload.tenant_id, TENANT);
  assert.equal(legPayload.client_charge_total, 100);
  assert.equal(legPayload.talent_cost_total, 100);

  const part = calls.find(
    (c) => c.table === "inquiry_participants" && c.op === "insert",
  );
  assert.ok(part, "inquiry_participants talent row must be inserted");
  const partPayload = part.payload as Record<string, unknown>;
  assert.equal(partPayload.role, "talent");
  assert.equal(partPayload.status, "active");
  assert.equal(partPayload.talent_profile_id, TALENT);
  assert.equal(partPayload.owning_party_type, "talent");
  assert.equal(partPayload.owning_party_id, TALENT);
  assert.equal(partPayload.requirement_group_id, REQ_GROUP);
  assert.ok(
    calls.some((c) => c.table === "inquiry_requirement_groups" && c.op === "insert"),
    "M5.6 default requirement group must be created",
  );

  assert.ok(
    calls.some((c) => c.table === "rpc:engine_load_commission_context"),
    "commission context must load",
  );
  assert.ok(
    calls.some((c) => c.table === "rpc:engine_persist_booking_commission_snapshot"),
    "commission snapshot must persist",
  );
});

test("attributePurchaseBooking is idempotent when leg + participant already exist", async () => {
  const { calls, admin } = attributionFake({
    existingLeg: true,
    existingParticipant: true,
  });
  const r = await attributePurchaseBooking(admin, {
    tenantId: TENANT,
    bookingId: BOOKING,
    orderId: ORDER,
    inquiryId: INQUIRY,
  });
  assert.equal(r.ok, true);
  assert.ok(
    !calls.some((c) => c.table === "booking_talent" && c.op === "insert"),
    "must not re-insert booking_talent",
  );
  assert.ok(
    !calls.some((c) => c.table === "inquiry_participants" && c.op === "insert"),
    "must not re-insert participant",
  );
  assert.ok(
    calls.some((c) => c.table === "booking_talent" && c.op === "update"),
    "existing leg totals are refreshed",
  );
});

test("attributePurchaseBooking no-ops when order lines have no payee", async () => {
  const { calls, admin } = attributionFake({
    lines: [
      {
        talent_profile_id: null,
        owner_tenant_id: null,
        total_cents: 1000,
        talent_cost_cents: 0,
      },
    ],
  });
  const r = await attributePurchaseBooking(admin, {
    tenantId: TENANT,
    bookingId: BOOKING,
    orderId: ORDER,
    inquiryId: null,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.talentLegs, 0);
  assert.ok(
    !calls.some((c) => c.table === "booking_talent"),
    "no booking_talent writes without a payee",
  );
  assert.ok(
    !calls.some((c) => c.table.startsWith("rpc:engine_")),
    "no commission RPCs without a payee",
  );
});

test("attributePurchaseBooking fails closed when snapshot persist fails", async () => {
  const { admin } = attributionFake({ persistFails: true });
  const r = await attributePurchaseBooking(admin, {
    tenantId: TENANT,
    bookingId: BOOKING,
    orderId: ORDER,
    inquiryId: INQUIRY,
  });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /snapshot/i);
});

test("attributePurchaseBooking creates an inquiry when the thread was never opened", async () => {
  const { calls, admin } = attributionFake();
  const r = await attributePurchaseBooking(admin, {
    tenantId: TENANT,
    bookingId: BOOKING,
    orderId: ORDER,
    inquiryId: null,
    contact: { email: "buyer@example.com", displayName: "Buyer" },
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.inquiryId, INQUIRY);

  const inq = calls.find((c) => c.table === "inquiries" && c.op === "insert");
  assert.ok(inq, "attribution must open an inquiry for the snapshot PK");
  const bookingLink = calls.find(
    (c) =>
      c.table === "agency_bookings"
      && c.op === "update"
      && (c.payload as { source_inquiry_id?: string }).source_inquiry_id === INQUIRY,
  );
  assert.ok(bookingLink, "booking.source_inquiry_id must be stamped");
  const txnLink = calls.find(
    (c) =>
      c.table === "booking_transactions"
      && c.op === "update"
      && (c.payload as { source_inquiry_id?: string }).source_inquiry_id === INQUIRY,
  );
  assert.ok(txnLink, "txn.source_inquiry_id must be stamped with the first inquiry");
  const header = calls.find(
    (c) =>
      c.table === "agency_bookings"
      && c.op === "update"
      && typeof (c.payload as { total_talent_cost?: unknown }).total_talent_cost === "number",
  );
  assert.ok(header, "booking header totals must refresh after talent legs");
  assert.equal((header.payload as { total_talent_cost: number }).total_talent_cost, 100);
});

test("attributePurchaseBooking reuses booking.source_inquiry_id instead of opening a second inquiry", async () => {
  const EXISTING = "77777777-7777-7777-7777-777777777777";
  const { calls, admin } = attributionFake({
    existingBookingInquiryId: EXISTING,
  });
  const r = await attributePurchaseBooking(admin, {
    tenantId: TENANT,
    bookingId: BOOKING,
    orderId: ORDER,
    inquiryId: null,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.inquiryId, EXISTING);
  assert.ok(
    !calls.some((c) => c.table === "inquiries" && c.op === "insert"),
    "must not insert a second inquiry when booking already has one",
  );
  assert.ok(
    calls.some(
      (c) =>
        c.table === "booking_transactions"
        && c.op === "update"
        && (c.payload as { source_inquiry_id?: string }).source_inquiry_id === EXISTING,
    ),
    "heal must stamp the txn onto the existing inquiry",
  );
});

test("createPurchase wires attributePurchaseBooking after the thread", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/lib/orders/purchase.ts"),
    "utf8",
  );
  assert.match(src, /attributePurchaseBooking/);
  const threadAt = src.indexOf("openPurchaseThread");
  const attrAt = src.indexOf("attributePurchaseBooking");
  assert.ok(threadAt > 0 && attrAt > threadAt, "attribution must follow the thread");
});

test("markPaid heals attribution before transfers", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/lib/bookings/transactions.ts"),
    "utf8",
  );
  // Skip imports — assert the call order inside the paid-transition block.
  const paidBlock = src.slice(src.indexOf("Audit #6: disburse"));
  const attrAt = paidBlock.indexOf("attributePurchaseBooking");
  const transferAt = paidBlock.indexOf("executeBookingTransfers");
  assert.ok(attrAt > 0 && transferAt > attrAt, "heal before transfers");
});

test("migration teaches commission context to accept order-backed bookings", () => {
  const mig = readFileSync(
    path.join(
      process.cwd(),
      "../supabase/migrations/20261231341000_commission_context_order_backed.sql",
    ),
    "utf8",
  );
  assert.match(mig, /v_order_id/);
  assert.match(mig, /commission_line_items_for/);
  assert.match(mig, /FROM public\.orders/);
  // Order branch resolves currency from orders; offer gate stays in the ELSE.
  assert.match(mig, /IF v_order_id IS NOT NULL THEN/);
  assert.match(mig, /ELSE[\s\S]*no accepted offer for booking/);
});
