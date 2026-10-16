import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pendingOfferContextLines,
  pendingOfferMoney,
  projectPendingOffers,
  type SentOfferLineRow,
  type SentOfferRow,
} from "./sent-offers";

const ME = "talent-me";
const offer = (over: Partial<SentOfferRow> = {}): SentOfferRow => ({
  id: "offer-1",
  inquiry_id: "inq-1",
  tenant_id: "hub",
  status: "sent",
  currency_code: "MXN",
  total_client_price: "300.00",
  sent_at: "2026-10-14T17:59:33Z",
  created_at: "2026-10-14T17:50:00Z",
  ...over,
});
const line = (over: Partial<SentOfferLineRow> = {}): SentOfferLineRow => ({
  offer_id: "offer-1",
  talent_profile_id: ME,
  label: "Manicure",
  units: 1,
  unit_price: "300.00",
  talent_cost: "300.00",
  ...over,
});

test("TUL-957: a sent 300 MXN offer with no order projects as a pending item", () => {
  const [row] = projectPendingOffers({
    profileId: ME,
    offers: [offer()],
    lines: [line()],
    clientNames: new Map([["inq-1", "QA Guest"]]),
  });
  assert.ok(row);
  assert.equal(row.herCents, 30000);
  assert.equal(row.currency, "MXN");
  assert.equal(row.clientName, "QA Guest");
  assert.equal(row.label, "Manicure");
});

test("drafts, accepted and other talents' offers are not pending for her", () => {
  const rows = projectPendingOffers({
    profileId: ME,
    offers: [offer({ id: "d", status: "draft" }), offer({ id: "a", status: "accepted" }), offer({ id: "x" })],
    lines: [line({ offer_id: "d" }), line({ offer_id: "a" }), line({ offer_id: "x", talent_profile_id: "someone-else" })],
  });
  assert.deepEqual(rows, []);
});

test("thread money for a pending offer: nothing paid, all due, flagged pending", () => {
  const [row] = projectPendingOffers({ profileId: ME, offers: [offer()], lines: [line()] });
  assert.ok(row);
  assert.deepEqual(pendingOfferMoney(row, true), {
    totalCents: 30000,
    paidCents: 0,
    balanceCents: 30000,
    currency: "MXN",
    pending: true,
  });
});

test("a rostered talent sees her net and only her own lines", () => {
  const lines = [line({ talent_cost: "200.00" }), line({ talent_profile_id: "other", label: "Other", talent_cost: "100.00" })];
  const [row] = projectPendingOffers({ profileId: ME, offers: [offer()], lines });
  assert.ok(row);
  assert.equal(pendingOfferMoney(row, false).totalCents, 20000);
  const ctx = pendingOfferContextLines(lines, row, ME, false);
  assert.equal(ctx.length, 1);
  assert.equal(ctx[0]?.unitCents, 20000);
  assert.equal(pendingOfferContextLines(lines, row, ME, true).length, 2);
});
