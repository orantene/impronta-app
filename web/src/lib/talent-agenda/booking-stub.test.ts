import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readTimelessBookingStub, type StubDb } from "./booking-stub";

type Rows = Record<string, Array<Record<string, unknown>>>;

/** Minimal chainable fake: select().eq()...maybeSingle() over in-memory rows. */
function fake(rows: Rows): StubDb {
  return {
    from(table) {
      return {
        select() {
          const filters: Array<[string, string]> = [];
          const f = {
            eq(c: string, v: string) {
              filters.push([c, v]);
              return f;
            },
            order() {
              return f;
            },
            limit() {
              return f;
            },
            maybeSingle: async () => ({
              data: (rows[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
            }),
          };
          return f;
        },
      };
    },
  };
}

const HUB = "talent-hub-1";
const rows: Rows = {
  talent_bookings: [
    // Past (7 days), another workspace's tenant_id, completed: no window, tenant or status gate.
    { id: "past-1", talent_profile_id: HUB, title: "Shoot", client_label: "Eva", status: "completed", starts_at: "2026-10-12T17:00:00Z", tenant_id: "other-workspace" },
    { id: "null-tenant-1", talent_profile_id: HUB, title: "Fitting", client_label: null, status: "cancelled", starts_at: "2026-10-01T10:00:00Z", tenant_id: null },
    { id: "timed-1", talent_profile_id: HUB, title: "Cut and colour", client_label: "Ana", status: "confirmed" },
  ],
  agency_bookings: [
    { id: "purchase-1", order_id: "order-1", contact_name: "Luis", status: "cancelled" },
    { id: "other-1", order_id: "order-2", contact_name: "Not hers", status: "confirmed" },
  ],
  booking_talent: [{ booking_id: "purchase-1", talent_profile_id: HUB }, { booking_id: "other-1", talent_profile_id: "someone-else" }],
  order_lines: [{ order_id: "order-1", label: "Haircut pack", sort_order: 0 }],
};
const db = { supabase: fake(rows), admin: fake(rows) };

describe("readTimelessBookingStub (hub talent)", () => {
  it("loads a timed booking from talent_bookings with its real status", async () => {
    const s = await readTimelessBookingStub(db, HUB, "timed-1");
    assert.deepEqual(s, { title: "Cut and colour", service: "Cut and colour", clientName: "Ana", status: "confirmed" });
  });

  it("loads a purchase booking from agency_bookings and keeps it cancelled", async () => {
    const s = await readTimelessBookingStub(db, HUB, "purchase-1");
    assert.equal(s?.status, "cancelled");
    assert.equal(s?.clientName, "Luis");
    assert.equal(s?.service, "Haircut pack");
  });

  it("resolves the order id of a purchase to its booking", async () => {
    assert.equal((await readTimelessBookingStub(db, HUB, "order-1"))?.status, "cancelled");
  });

  it("never reads another talent's booking", async () => {
    assert.equal(await readTimelessBookingStub(db, HUB, "other-1"), null);
    assert.equal(await readTimelessBookingStub(db, "someone-else-2", "timed-1"), null);
  });

  it("multi-role user (talent and workspace admin): a past booking of another tenant or none still loads, with its real status", async () => {
    const past = await readTimelessBookingStub(db, HUB, "past-1");
    assert.equal(past?.status, "completed");
    assert.equal(past?.service, "Shoot");
    const nul = await readTimelessBookingStub(db, HUB, "null-tenant-1");
    assert.equal(nul?.status, "cancelled");
  });
});
