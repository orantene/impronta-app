import assert from "node:assert/strict";
import test from "node:test";

import { pendingListingUpdates, pendingUpdateCopy, pendingUpdateLines } from "./service-hub-pending-updates";

const offerings = new Map([["o1", { title: "Sunrise paddle", priceCents: 10000, currency: "USD" }]]);
const names = new Map([["t1", "Blue Oar"]]);
const base = { tenant_id: "t1", offering_id: "o1", price_mode: "margin", margin_bps: 2000, currency: "USD", show_who: "name", client_contact: "workspace", booking_type: "instant", talent_lowest_cents: 9000 };

test("only offered listings become cards, with what changed", () => {
  const out = pendingListingUpdates({
    listings: [
      { ...base, id: "L1", status: "offered" },
      { ...base, id: "L2", status: "accepted" },
      { ...base, id: "L3", status: "hidden" },
    ],
    offerings,
    tenantNames: names,
  });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    listingId: "L1", workspaceName: "Blue Oar", serviceTitle: "Sunrise paddle", currency: "USD", bookingType: "instant",
    listPriceCents: 12000, priceMode: "margin", showWho: "name", clientContact: "workspace", minAcceptCents: 9000,
  });
});

test("a malformed row is dropped and an unknowable price stays unknown", () => {
  const out = pendingListingUpdates({
    listings: [
      { ...base, id: "L1", status: "offered", price_mode: "weird" },
      { ...base, id: "", status: "offered" },
      { ...base, id: "L4", status: "offered", price_mode: "fixed", price_cents: null },
    ],
    offerings,
    tenantNames: names,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.listPriceCents, null);
});

test("lines cover booking type, price shown, who is shown and client contact in EN and ES, no dashes", () => {
  const [u] = pendingListingUpdates({ listings: [{ ...base, id: "L1", status: "offered", price_mode: "from", price_cents: 8000, show_who: "hidden", client_contact: "talent", booking_type: "request" }], offerings, tenantNames: names });
  const money = (c: number, cur: string) => `${cur} ${c / 100}`;
  const en = pendingUpdateLines(u!, "en", money);
  assert.deepEqual(en.map((l) => l.key), ["booking", "price", "who", "contact"]);
  assert.equal(en[0]!.value, "Clients send a request");
  assert.equal(en[1]!.value, "from USD 80");
  assert.equal(en[2]!.value, "Nobody (hidden)");
  assert.equal(en[3]!.value, "Directly with you");
  const es = pendingUpdateLines(u!, "es", money);
  assert.equal(es[3]!.value, "Directo contigo");
  for (const l of ["en", "es"]) {
    const c = pendingUpdateCopy(l);
    for (const v of Object.values(c)) assert.doesNotMatch(v, /[—–]/);
  }
  assert.equal(pendingUpdateCopy("es").title, "Actualización pendiente");
  assert.equal(pendingUpdateCopy("es").accept, "Aceptar");
  assert.equal(pendingUpdateCopy("es").decline, "Rechazar");
});
