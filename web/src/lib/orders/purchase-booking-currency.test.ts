/**
 * The booking row carries the ORDER's currency (2026-09-23). It used to write
 * "USD" whatever was sold, so a 950 MXN appointment was recorded as US$950.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { openPurchaseBooking } from "./purchase-booking";

function fakeAdmin() {
  const inserted: Record<string, unknown>[] = [];
  const admin = {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select() {
              return { single: async () => ({ data: { id: "bk-1" }, error: null }) };
            },
          };
        },
      };
    },
  };
  return { admin, inserted };
}

const base = {
  tenantId: "t-1",
  orderId: "o-1",
  title: "Volumen ruso 4D",
  collectCents: 30000,
  window: null,
  subtotalCents: 150000,
  contact: { displayName: "Sofía", email: "s@example.com", phone: null },
};

test("an MXN order opens an MXN booking", async () => {
  const { admin, inserted } = fakeAdmin();
  const res = await openPurchaseBooking(admin as never, { ...base, currency: "MXN" });
  assert.equal(res.ok, true);
  assert.equal(inserted[0]?.currency_code, "MXN");
  assert.equal(inserted[0]?.total_client_revenue, 1500);
});

test("a USD order still opens a USD booking", async () => {
  const { admin, inserted } = fakeAdmin();
  await openPurchaseBooking(admin as never, { ...base, currency: "USD" });
  assert.equal(inserted[0]?.currency_code, "USD");
});
