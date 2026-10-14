import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addMonths, buildDraft, dateChipRange, clampToTrial, draftToColumns, duplicateDraft, earnEstimate, localToInstant, nextCodeSuffix,
  nextHoliday, previewQuote, promoSlug, promoNudges, repeatDraft, suggestCode, validateDraft, TEMPLATE_ORDER,
  type ExistingPromo, type PromoDraft, type TemplateContext,
} from "./templates";
import { canGoLive } from "./plan-gating";
import { draftToPromo } from "./templates";

const MX = "America/Mexico_City";
// Mon 2026-10-12 10:00 Mexico City
const NOW = "2026-10-12T10:00:00-06:00";
const ctx = (over: Partial<TemplateContext> = {}): TemplateContext => ({ now: NOW, tz: MX, currency: "MXN", locale: "es", ...over });
const SVC = { id: "s1", title: "Gel", list_cents: 45_000 };

test("every template builds a valid draft", () => {
  for (const key of TEMPLATE_ORDER) {
    const d = buildDraft(key, ctx({ addon: { id: "a1", list_cents: 5000 }, customerId: null }));
    assert.deepEqual(validateDraft(d), [], key);
  }
});

test("fill my week: 20% for the next 7 days, first 3 bookings", () => {
  const d = buildDraft("fill_week", ctx());
  assert.equal(d.value, 20);
  assert.equal(d.starts_at, "2026-10-12");
  assert.equal(d.ends_at, "2026-10-18");
  assert.equal(d.max_uses, 3);
});

test("slow day repeats on Tuesdays with no end", () => {
  const d = buildDraft("slow_day", ctx());
  assert.deepEqual(d.weekdays, [2]);
  assert.equal(d.ends_at, null);
});

test("last minute fills one slot", () => {
  const d = buildDraft("last_minute", ctx({ slot: { id: "sl1", date: "2026-10-13", from: "16:00", to: "17:00" } }));
  assert.equal(d.max_uses, 1);
  assert.equal(d.slot_id, "sl1");
  assert.equal(d.time_from, "16:00");
  assert.equal(d.starts_at, "2026-10-13");
});

test("free extra needs its add-on", () => {
  const without = buildDraft("free_extra", ctx());
  assert.deepEqual(validateDraft(without), ["addon"]);
  const withIt = buildDraft("free_extra", ctx({ addon: { id: "a1", list_cents: 5000 } }));
  assert.equal(withIt.offer_kind, "free_addon");
  assert.deepEqual(validateDraft(withIt), []);
});

test("secret code gets a code; come back targets lapsed or one client", () => {
  const sc = buildDraft("secret_code", ctx());
  assert.equal(sc.unlock, "code");
  assert.equal(sc.code, "AMIGA10");
  assert.equal(buildDraft("come_back", ctx()).audience, "lapsed");
  const one = buildDraft("come_back", ctx({ customerId: "c1" }));
  assert.equal(one.audience, "one_client");
  assert.equal(one.customer_id, "c1");
});

test("holiday windows: Mother's Day is 7 days up to May 10; Buen Fin is Friday to Monday", () => {
  const h = nextHoliday("2026-05-01");
  assert.equal(h.key, "madres");
  assert.equal(h.start, "2026-05-04");
  assert.equal(h.end, "2026-05-10");
  const bf = nextHoliday("2026-10-12");
  assert.equal(bf.key, "buen_fin");
  assert.equal(bf.end, "2026-11-16"); // third Monday of Nov 2026
  assert.equal(bf.start, "2026-11-13");
  assert.equal(nextHoliday("2026-12-30").key, "valentine");
});

test("trial clamp keeps the draft inside the free trial rules", () => {
  for (const key of ["fill_week", "slow_day", "free_extra", "custom", "last_minute", "holiday"] as const) {
    const d = buildDraft(key, ctx({ trialAvailable: true, addon: { id: "a1", list_cents: 5000 } }));
    const gate = canGoLive({ plan: "free", trialUsed: false, promo: draftToPromo(d) });
    assert.equal(gate.allowed, true, `${key}: ${gate.reason}`);
  }
  const long = clampToTrial({ ...buildDraft("custom", ctx()), starts_at: "2026-10-12", ends_at: "2026-12-01", max_uses: 99 }, NOW);
  assert.equal(long.ends_at, "2026-10-18");
  assert.equal(long.max_uses, 5);
});

test("secret code is not clamped: it stays a code", () => {
  const d = buildDraft("secret_code", ctx({ trialAvailable: true }));
  assert.equal(d.unlock, "code");
});

test("localToInstant converts the talent's local midnight", () => {
  assert.equal(localToInstant("2026-10-14T00:00:00", MX), "2026-10-14T06:00:00.000Z");
  assert.equal(localToInstant("2026-10-14T23:59:59", MX), "2026-10-15T05:59:59.000Z");
  assert.equal(localToInstant("2026-07-01T12:00:00", "America/New_York"), "2026-07-01T16:00:00.000Z");
});

test("columns: percent, fixed, free_addon use the right kind and value", () => {
  const pct = draftToColumns(buildDraft("fill_week", ctx()));
  assert.equal(pct.kind, "percent");
  assert.equal(pct.offer_kind, "percent");
  assert.equal(pct.value, 20);
  assert.equal(pct.starts_at, "2026-10-12T06:00:00.000Z");
  assert.equal(pct.code, null);
  const free = draftToColumns(buildDraft("free_extra", ctx({ addon: { id: "a1", list_cents: 5000 } })));
  assert.equal(free.kind, "fixed");
  assert.equal(free.value, 0);
  assert.equal(free.offer_kind, "free_addon");
  assert.equal(free.addon_id, "a1");
  const fixed = draftToColumns({ ...buildDraft("custom", ctx()), offer_kind: "fixed", value: 9000 });
  assert.equal(fixed.kind, "fixed");
  assert.equal(fixed.value, 9000);
  const fp = draftToColumns({ ...buildDraft("custom", ctx()), offer_kind: "fixed_price", value: 30000 });
  assert.equal(fp.kind, "fixed");
  assert.equal(fp.offer_kind, "fixed_price");
  const code = draftToColumns(buildDraft("secret_code", ctx()));
  assert.equal(code.code, "AMIGA10");
});

test("validation: 90% cap, code shape, dates, time pair", () => {
  const d = buildDraft("custom", ctx());
  assert.deepEqual(validateDraft({ ...d, value: 95 }), ["value_cap"]);
  assert.deepEqual(validateDraft({ ...d, value: 0 }), ["value"]);
  assert.deepEqual(validateDraft({ ...d, unlock: "code", code: "x" }), ["code"]);
  assert.deepEqual(validateDraft({ ...d, starts_at: "2026-10-12", ends_at: "2026-10-10" }), ["dates"]);
  assert.deepEqual(validateDraft({ ...d, time_from: "10:00" }), ["time"]);
  assert.deepEqual(validateDraft({ ...d, name: " " }), ["name"]);
  assert.deepEqual(validateDraft({ ...d, max_uses: 0 }), ["max_uses"]);
});

test("code helpers and duplicate / repeat", () => {
  assert.equal(nextCodeSuffix("LUZ10"), "LUZ10-2");
  assert.equal(nextCodeSuffix("LUZ10-2"), "LUZ10-3");
  assert.equal(suggestCode("Ámbar Luz", 15), "AMBARLUZ15");
  const base: PromoDraft = { ...buildDraft("secret_code", ctx()), id: "p1", code: "LUZ10", starts_at: "2026-05-04", ends_at: "2026-05-10" };
  const dup = duplicateDraft(base);
  assert.equal(dup.id, null);
  assert.equal(dup.code, "LUZ10-2");
  assert.equal(dup.starts_at, null);
  const rep = repeatDraft(base, { months: 12 });
  assert.equal(rep.starts_at, "2027-05-04");
  assert.equal(rep.ends_at, "2027-05-10");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("preview uses quote(): 20% off 450 is 360", () => {
  const p = previewQuote(buildDraft("fill_week", ctx()), SVC, NOW);
  assert.equal(p.list_cents, 45_000);
  assert.equal(p.final_cents, 36_000);
  assert.equal(p.pct, 20);
  assert.equal(p.applies, true);
});

test("preview of a free extra shows the gift, no price change", () => {
  const p = previewQuote(buildDraft("free_extra", ctx({ addon: { id: "a1", list_cents: 5000 } })), SVC, NOW);
  assert.equal(p.final_cents, 45_000);
  assert.equal(p.gift_cents, 5000);
});

test("preview on a Tuesday-only promo samples a Tuesday", () => {
  const p = previewQuote(buildDraft("slow_day", ctx()), SVC, NOW);
  assert.equal(p.applies, true);
  assert.equal(p.final_cents, 38_300); // 15% off 450 = 382.50 -> whole pesos
});

test("earn estimate: net of platform fee and card cost, times spots", () => {
  const d = buildDraft("fill_week", ctx());
  const e = earnEstimate(d, SVC, NOW);
  // 36000 - fee(1.5% = 540) - card(3.6% = 1296 + 300)
  assert.equal(e.net_per_booking_cents, 36_000 - 540 - 1_596);
  assert.equal(e.bookings, 3);
  assert.equal(e.total_cents, e.net_per_booking_cents * 3);
  const open = earnEstimate({ ...d, max_uses: null }, SVC, NOW);
  assert.equal(open.total_cents, null);
});

test("nudges: big discount over 50%", () => {
  const d = { ...buildDraft("custom", ctx()), value: 60 };
  assert.deepEqual(promoNudges(d, [], 45_000), [{ kind: "big_discount", pct: 60 }]);
  assert.deepEqual(promoNudges({ ...d, value: 50 }, [], 45_000), []);
});

test("nudges: overlap tells which promo is better", () => {
  const existingDraft = { ...buildDraft("slow_day", ctx()), id: "e1", value: 15 };
  const existing: ExistingPromo[] = [{ id: "e1", name: "Martes", status: "live", promo: draftToPromo(existingDraft, "e1") }];
  const mine = { ...buildDraft("fill_week", ctx()), value: 20 };
  const n = promoNudges(mine, existing, 45_000);
  assert.deepEqual(n, [{ kind: "overlap", promoId: "e1", name: "Martes", otherPct: 15, thisIsBetter: true }]);
  // no overlap when the other is paused or ended
  assert.deepEqual(promoNudges(mine, [{ ...existing[0]!, status: "paused" }], 45_000), []);
  // disjoint weekdays
  const wed = { ...mine, weekdays: [3] };
  assert.deepEqual(promoNudges(wed, existing, 45_000), []);
});

test("promo slug is ascii, lowercase and valid for share links", () => {
  assert.equal(promoSlug("Semana vacía!", "K3F9X2"), "semana-vacia-k3f9x2");
  assert.equal(promoSlug("???", "ab"), "promo-ab");
  assert.match(promoSlug("Ñandú ".repeat(20), "abcdef"), /^[a-z0-9][a-z0-9-]{0,63}$/);
});

test("date chips: inclusive local ranges", () => {
  // Wed 2026-10-14
  assert.deepEqual(dateChipRange("today", "2026-10-14"), { start: "2026-10-14", end: "2026-10-14" });
  assert.deepEqual(dateChipRange("week", "2026-10-14"), { start: "2026-10-14", end: "2026-10-18" });
  assert.deepEqual(dateChipRange("weekend", "2026-10-14"), { start: "2026-10-16", end: "2026-10-18" });
  assert.deepEqual(dateChipRange("next", "2026-10-14"), { start: "2026-10-19", end: "2026-10-25" });
  // Sunday: week is just today, weekend is today, next starts tomorrow
  assert.deepEqual(dateChipRange("week", "2026-10-18"), { start: "2026-10-18", end: "2026-10-18" });
  assert.deepEqual(dateChipRange("weekend", "2026-10-18"), { start: "2026-10-18", end: "2026-10-18" });
  assert.deepEqual(dateChipRange("next", "2026-10-18"), { start: "2026-10-19", end: "2026-10-25" });
});
