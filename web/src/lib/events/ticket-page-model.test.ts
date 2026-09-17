import assert from "node:assert/strict";
import test from "node:test";

import {
  clockLabel,
  dateBadge,
  isVipTier,
  nightClocks,
  orderPosition,
  receiptTag,
  refundEligibility,
  ticketLocale,
  whatsappShareHref,
} from "./ticket-page-model";

// 2026-10-03 23:00Z is Saturday 3 October 17:00 in Mexico City (UTC-6, no DST since 2022).
const NIGHT = "2026-10-03T23:00:00.000Z";
const CDMX = "America/Mexico_City";

test("ticketLocale reads Spanish variants and defaults to English", () => {
  assert.equal(ticketLocale("es"), "es");
  assert.equal(ticketLocale("es-AR"), "es");
  assert.equal(ticketLocale("ES"), "es");
  assert.equal(ticketLocale("en"), "en");
  assert.equal(ticketLocale("fr"), "en");
  assert.equal(ticketLocale(null), "en");
  assert.equal(ticketLocale(undefined), "en");
});

test("dateBadge formats the night in the venue's zone, per locale, and refuses without one", () => {
  assert.deepEqual(dateBadge(NIGHT, CDMX, "es"), { weekday: "SÁB", day: "03", month: "OCT" });
  assert.deepEqual(dateBadge(NIGHT, CDMX, "en"), { weekday: "SAT", day: "03", month: "OCT" });
  // 23:00Z is already Sunday 4 October in Madrid: the zone decides the day.
  assert.equal(dateBadge(NIGHT, "Europe/Madrid", "es")?.day, "04");
  assert.equal(dateBadge(NIGHT, null, "es"), null);
  assert.equal(dateBadge(null, CDMX, "es"), null);
  assert.equal(dateBadge("not a date", CDMX, "es"), null);
});

test("clockLabel is 24h in Spanish, 12h in English, empty without a zone", () => {
  assert.equal(clockLabel(NIGHT, CDMX, "es"), "17:00");
  assert.match(clockLabel(NIGHT, CDMX, "en"), /^5:00\s?PM$/);
  assert.equal(clockLabel(NIGHT, null, "es"), "");
  assert.equal(clockLabel(null, CDMX, "es"), "");
});

test("nightClocks subtracts doors from the show and omits doors at offset zero", () => {
  assert.deepEqual(nightClocks(NIGHT, 60, CDMX, "es"), { doors: "16:00", show: "17:00" });
  assert.deepEqual(nightClocks(NIGHT, 0, CDMX, "es"), { doors: null, show: "17:00" });
  assert.deepEqual(nightClocks(NIGHT, 30, null, "es"), { doors: null, show: null });
  assert.deepEqual(nightClocks(null, 30, CDMX, "es"), { doors: null, show: null });
});

test("isVipTier reads VIP, Mesa and Table as whole words", () => {
  assert.equal(isVipTier("Mesa VIP para 10"), true);
  assert.equal(isVipTier("vip"), true);
  assert.equal(isVipTier("Table 4"), true);
  assert.equal(isVipTier("Mesa"), true);
  assert.equal(isVipTier("Entrada general"), false);
  assert.equal(isVipTier("Vipers night"), false);
  assert.equal(isVipTier(null), false);
});

test("orderPosition numbers siblings by line_seq then id, and is null for a lone ticket", () => {
  const sibs = [
    { id: "b", lineSeq: 2 },
    { id: "a", lineSeq: 1 },
    { id: "c", lineSeq: null },
  ];
  assert.deepEqual(orderPosition("a", sibs), { n: 1, m: 3 });
  assert.deepEqual(orderPosition("b", sibs), { n: 2, m: 3 });
  assert.deepEqual(orderPosition("c", sibs), { n: 3, m: 3 });
  assert.equal(orderPosition("zz", sibs), null);
  assert.equal(orderPosition("a", [{ id: "a", lineSeq: 1 }]), null);
  assert.equal(orderPosition("a", []), null);
});

test("receiptTag is the receipt's last four, upper-cased", () => {
  assert.equal(receiptTag("k7x2mq9pl3f9a"), "#R-3F9A");
  assert.equal(receiptTag("abcd1234"), "#R-1234");
  assert.equal(receiptTag("  ab  "), "#R-AB");
  assert.equal(receiptTag(""), null);
  assert.equal(receiptTag(null), null);
});

const eligible = {
  refundsOpen: true,
  refundsCloseAt: null,
  now: "2026-10-01T00:00:00Z",
  admissionStatus: "valid",
  admittedCount: 0,
  eventStatus: "published",
  lineTotalCents: 5000,
  lineRefundedCents: 0,
  alreadyRequested: false,
};

test("refundEligibility says yes only when every gate is open", () => {
  assert.deepEqual(refundEligibility(eligible), { ok: true });
});

test("refundEligibility names why not, and an absent switch reads closed", () => {
  assert.deepEqual(refundEligibility({ ...eligible, refundsOpen: false }), { ok: false, reason: "refunds_closed" });
  assert.deepEqual(refundEligibility({ ...eligible, refundsOpen: undefined }), { ok: false, reason: "refunds_closed" });
  assert.deepEqual(refundEligibility({ ...eligible, refundsOpen: null }), { ok: false, reason: "refunds_closed" });
  assert.deepEqual(refundEligibility({ ...eligible, refundsCloseAt: "2026-09-30T00:00:00Z" }), { ok: false, reason: "refunds_closed" });
  assert.deepEqual(refundEligibility({ ...eligible, refundsCloseAt: "2026-10-01T00:00:00Z" }), { ok: false, reason: "refunds_closed" }, "exactly on the close is closed");
  assert.deepEqual(refundEligibility({ ...eligible, refundsCloseAt: "2026-10-02T00:00:00Z" }), { ok: true });
  assert.deepEqual(refundEligibility({ ...eligible, admittedCount: 1 }), { ok: false, reason: "already_used" });
  assert.deepEqual(refundEligibility({ ...eligible, admissionStatus: "void" }), { ok: false, reason: "not_valid" });
  assert.deepEqual(refundEligibility({ ...eligible, eventStatus: "cancelled" }), { ok: false, reason: "event_cancelled" });
  assert.deepEqual(refundEligibility({ ...eligible, lineTotalCents: 0 }), { ok: false, reason: "nothing_to_refund" });
  assert.deepEqual(refundEligibility({ ...eligible, lineRefundedCents: 5000 }), { ok: false, reason: "nothing_to_refund" });
  assert.deepEqual(refundEligibility({ ...eligible, alreadyRequested: true }), { ok: false, reason: "already_requested" });
});

test("refundEligibility ranks the ticket's own state above the venue's switch", () => {
  // A used ticket on a closed event is "used", not "closed": the holder's
  // situation is the more useful sentence.
  assert.deepEqual(refundEligibility({ ...eligible, refundsOpen: false, admittedCount: 2 }), { ok: false, reason: "already_used" });
  assert.deepEqual(refundEligibility({ ...eligible, refundsOpen: false, eventStatus: "cancelled" }), { ok: false, reason: "event_cancelled" });
});

test("whatsappShareHref encodes the text and the link", () => {
  assert.equal(whatsappShareHref("Mi entrada", "https://x.test/ticket/a b"), "https://wa.me/?text=Mi%20entrada%20https%3A%2F%2Fx.test%2Fticket%2Fa%20b");
  assert.equal(whatsappShareHref("", "https://x.test"), "https://wa.me/?text=https%3A%2F%2Fx.test");
});
