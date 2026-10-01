import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { guestVisibleOfferVersion } from "@/lib/messages-v5/client-thread-view";
import { localiseEngineLine } from "@/lib/messages-v5/engine-lines";
import { paymentLineItemName, paymentPortion } from "@/lib/payments/line-item-name";
import { COLLECT_LATER_NOTE, mapAgencyBookingPayment } from "@/lib/talent-agenda/load-map";
import { looksEmailDerived, publicNameOrGeneric, safePublicName } from "./public-name";

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");

test("no email-derived string reaches a public name", () => {
  for (const bad of ["orantene+jorgbeauty", "oran@example.com", "jane+tag"]) {
    assert.equal(looksEmailDerived(bad), true, bad);
    assert.equal(safePublicName(bad), null);
    assert.equal(publicNameOrGeneric(bad, "en"), "the talent");
    assert.equal(publicNameOrGeneric(bad, "es"), "la talento");
  }
  assert.equal(safePublicName("oranjor", ["oranjor@x.com"]), null);
  assert.equal(publicNameOrGeneric("Jorg Beauty", "en"), "Jorg Beauty");
  assert.equal(publicNameOrGeneric(null, "en"), "the talent");
});

test("the chat header/greeting name goes through the public-name gate", () => {
  assert.match(read("src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx"), /publicNameOrGeneric\(profile\?\.display_name/);
  assert.match(read("src/lib/inquiry/inquiry-receipt-data.ts"), /safePublicName\(data\.display_name/);
  assert.match(read("src/lib/messaging/client-link.ts"), /safePublicName\(/);
});

test("guest sees version only with more than one visible offer, starting at 1", () => {
  const one = [{ id: "a", version: 3 }];
  assert.equal(guestVisibleOfferVersion(one[0], one), null);
  const two = [{ id: "a", version: 3 }, { id: "b", version: 4 }];
  assert.equal(guestVisibleOfferVersion(two[0], two), 1);
  assert.equal(guestVisibleOfferVersion(two[1], two), 2);
});

test("Stripe line item names the service and the portion, by locale", () => {
  assert.equal(paymentLineItemName({ serviceName: "Lash lift", portion: "deposit", locale: "en" }), "Lash lift · deposit");
  assert.equal(paymentLineItemName({ serviceName: "Lash lift", portion: "full", locale: "es" }), "Lash lift · pago completo");
  assert.equal(paymentPortion(5000, 10000), "deposit");
  assert.equal(paymentPortion(10000, 10000), "full");
});

test("engine line 'A talent accepted the invitation.' localises", () => {
  const kit = { card: { cat: { offer: "Oferta" } }, offer: { sentPlain: "Enviada", talentAcceptedLine: "Una talento aceptó la invitación." } };
  assert.equal(localiseEngineLine("A talent accepted the invitation.", kit), "Una talento aceptó la invitación.");
});

test("a booking saved with Request payment is awaiting, not due at appointment", () => {
  const base = {
    agencyStatus: "confirmed", talentBookingStatus: "confirmed", paidCents: 0, latestTxStatus: null,
    linkOpen: false, now: new Date("2026-10-01T00:00:00Z"), startsAt: "2026-10-05T10:00:00Z",
  };
  const mk = (notes: string | null) =>
    mapAgencyBookingPayment({ ...base, agency: { payment_status: "unpaid", total_client_revenue: 100, payment_notes: notes } });
  assert.equal(mk(COLLECT_LATER_NOTE), "awaiting");
  assert.equal(mk(null), "due");
});

test("solo greeting key exists in EN and ES and is first person", () => {
  for (const f of ["en", "es"]) {
    const j = JSON.parse(read(`messages/${f}.json`));
    const line = JSON.stringify(j).match(/"homeHeroLineSolo":"([^"]+)"/)?.[1] ?? "";
    assert.ok(line.length > 0 && !/talent|talento/i.test(line), f);
  }
});
