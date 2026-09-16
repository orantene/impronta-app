import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookableOffering } from "./appointment-picker.core";
import { readServiceCollectionCore } from "./service-collection.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);
const CUT = uuid(2);
const COLOR = uuid(3);
const PRODUCT = uuid(4);

const offering = (over: Partial<BookableOffering>): BookableOffering =>
  ({ id: CUT, talentProfileId: uuid(9), kind: "service", title: "Cut", description: null, amountCents: 3000, currency: "USD", priceDisplay: "exact", bookingMode: "instant", durationMinutes: 30, category: "Hair", seatsLabel: null, ...over }) as BookableOffering;

test("read: services with a from-price across options, products excluded, ids filter", async () => {
  const { admin } = fakeAdmin({
    talent_offering_variants: [
      { offering_id: CUT, amount_cents: 2500 },
      { offering_id: COLOR, amount_cents: null },
    ],
  });
  const deps = {
    admin,
    locale: "en" as const,
    loadOfferings: async () => [
      offering({}),
      offering({ id: COLOR, title: "Color", amountCents: null, priceDisplay: "quote", bookingMode: "request" }),
      offering({ id: PRODUCT, title: "Wax", kind: "product" }),
    ],
  };
  const r = await readServiceCollectionCore(deps, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.services.map((s) => [s.id, s.fromCents, s.bookingMode]), [[CUT, 2500, "instant"], [COLOR, null, "request"]]);
  assert.deepEqual(Object.keys(r.data.services[0]!).sort(), ["bookingMode", "category", "currency", "description", "durationMinutes", "fromCents", "id", "personId", "priceDisplay", "seatsLabel", "title"]);
  const one = await readServiceCollectionCore(deps, TENANT, { serviceIds: [COLOR], showFromPrice: false });
  assert.ok(one.ok && one.data.services.length === 1 && one.data.services[0]!.fromCents === null);
  assert.deepEqual(await readServiceCollectionCore(deps, "x", {}), { ok: false, reason: "invalid_request" });
});
