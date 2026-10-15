import assert from "node:assert/strict";
import { test } from "node:test";

import { displayHeadlinePrice, displayPrice, isAdvertisable } from "./display-price";
import { breakdownModel, countdownParts, isPromoGoneRefusal, normalizeTypedCode, promoCodeMessage } from "./public-view";
import type { Promo } from "./types";

const NOW = "2026-10-14T18:00:00Z";
const promo = (over: Partial<Promo> = {}): Promo => ({
  id: "p1", offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public",
  unlock: "auto", applies_on: "purchase", tz: "America/Mexico_City", ...over,
});
const svc = { id: "s1", list_cents: 50_000, currency: "MXN" };

test("no live promo: the catalog price, unchanged, no badge", () => {
  const d = displayPrice(svc, { promos: [], now: NOW });
  assert.deepEqual(d, { currency: "MXN", list_cents: 50_000, final_cents: 50_000, hasPromo: false, promoId: null, badge: null, left: null, leftLabel: null });
});

test("auto percent promo: strike price, -20% badge, whole pesos (L6)", () => {
  const d = displayPrice(svc, { promos: [promo()], now: NOW, locale: "es" });
  assert.equal(d.final_cents, 40_000);
  assert.equal(d.hasPromo, true);
  assert.deepEqual(d.badge, { kind: "percent", percent: 20, label: "-20%" });
  const odd = displayPrice({ ...svc, list_cents: 45_500 }, { promos: [promo({ value: 15 })], now: NOW });
  assert.equal(odd.final_cents, 38_700);
});

test("codes, links and personal offers never price a public card", () => {
  for (const p of [promo({ unlock: "code", code: "LUZ" }), promo({ unlock: "link" }), promo({ audience: "one_client", customer_id: "c" }), promo({ is_single_use: true })]) {
    assert.equal(isAdvertisable(p), false);
    assert.equal(displayPrice(svc, { promos: [p], now: NOW }).hasPromo, false);
  }
});

test("scarcity line only when <= 5 left", () => {
  const p = promo({ max_uses: 3 });
  const d = displayPrice(svc, { promos: [p], usage: { p1: { used: 1, usedByClient: 0 } }, now: NOW, locale: "es" });
  assert.equal(d.left, 2);
  assert.equal(d.leftLabel, "Quedan 2 de 3");
  const many = displayPrice(svc, { promos: [promo({ max_uses: 10 })], now: NOW, locale: "en" });
  assert.equal(many.leftLabel, null);
  const gone = displayPrice(svc, { promos: [p], usage: { p1: { used: 3, usedByClient: 0 } }, now: NOW });
  assert.equal(gone.hasPromo, false);
});

test("free add-on: no strike, Gratis badge", () => {
  const d = displayPrice(svc, {
    promos: [promo({ offer_kind: "free_addon", addon: { id: "a1", list_cents: 25_000 } })],
    now: NOW, locale: "es", addonLabels: { a1: "Pestañas" },
  });
  assert.equal(d.final_cents, 50_000);
  assert.deepEqual(d.badge, { kind: "gift", addonId: "a1", label: "Gratis: Pestañas" });
});

test("Desde: the headline offering goes through the same engine; promo elsewhere flags someOnPromo", () => {
  const rows = [
    { id: "a", amountCents: 50_000, currency: "MXN", priceType: "event", isFeatured: true },
    { id: "b", amountCents: 30_000, currency: "MXN", priceType: "hourly", isFeatured: false },
  ];
  const onHead = displayHeadlinePrice(rows, { promos: [promo({ target_ids: ["a"] })], now: NOW });
  assert.equal(onHead?.price.final_cents, 40_000);
  const elsewhere = displayHeadlinePrice(rows, { promos: [promo({ target_ids: ["b"], value: 30 })], now: NOW });
  assert.equal(elsewhere?.price.hasPromo, false);
  assert.equal(elsewhere?.someOnPromo, 30);
});

test("contract: card, page and checkout breakdown agree on the final number", () => {
  const d = displayPrice(svc, { promos: [promo()], now: NOW });
  const m = breakdownModel({ lines: [{ label: "Gel", list_cents: d.list_cents, final_cents: d.final_cents }], currency: "MXN", locale: "es" });
  assert.equal(m.total_cents, d.final_cents);
  assert.equal(m.saved_cents, 10_000);
});

test("code field copy: trims, upper-cases, honest wording", () => {
  assert.equal(normalizeTypedCode("  luz 10 "), "LUZ10");
  assert.equal(promoCodeMessage({ ok: false, reason: "promo_expired" }, "luz10", "es"), "LUZ10 ya terminó");
  assert.equal(promoCodeMessage({ ok: false, reason: "promo_expired" }, "luz10", "en"), "LUZ10 has ended");
  assert.equal(
    promoCodeMessage({ ok: false, reason: "better_deal", dealLabel: "-30%" }, "luz10", "en"),
    "You're already getting a better deal (-30%). Your code LUZ10 wasn't needed.",
  );
  assert.match(promoCodeMessage({ ok: true, discountCents: 100 }, "luz10", "es"), /LUZ10 aplicado/);
});

test("breakdown: promo line, free extra at $0 with struck value, total, summary", () => {
  const m = breakdownModel({
    lines: [{ label: "Gel mani", list_cents: 45_000, final_cents: 36_000, promoLabel: "Semana vacía (-20%)" }],
    gifts: [{ label: "Pestañas", value_cents: 25_000 }],
    currency: "MXN",
    locale: "es",
  });
  assert.deepEqual(m.rows.map((r) => r.kind), ["line", "promo", "gift", "total"]);
  assert.equal(m.rows[1]?.label, "Semana vacía (-20%)");
  assert.match(m.summary ?? "", /^Antes .* · Ahora .* · Ahorras /);
  assert.equal(m.usdLine, null, "Spanish pages print no USD line");
  const en = breakdownModel({ lines: [{ label: "x", list_cents: 37_000, final_cents: 37_000 }], currency: "MXN", locale: "en", usdRates: { rateDate: "2026-10-14", perUsd: { MXN: 18.5 } } });
  assert.equal(en.usdLine, "≈ US$20");
  assert.equal(en.summary, null);
});

test("sold out before payment is surfaced, and the countdown math", () => {
  assert.equal(isPromoGoneRefusal({ ok: false, code: "promo_exhausted" }), true);
  assert.equal(isPromoGoneRefusal({ ok: false, code: "full" }), false);
  assert.equal(isPromoGoneRefusal({ ok: true }), false);
  assert.deepEqual(countdownParts(Date.parse("2026-10-17T08:30:00Z"), Date.parse(NOW)), { d: 2, h: 14, m: 30 });
  assert.equal(countdownParts(0, 1), null);
});

test("hub Desde: plain string with no promo, promo text when the headline is on promo", async () => {
  const { hubHeadlinePriceText } = await import("./hub-price");
  const offerings = [
    { id: "a", priceDisplay: "exact", priceType: "event", amountCents: 50_000, currency: "MXN", isFeatured: true },
    { id: "q", priceDisplay: "quote", priceType: "custom", amountCents: null, currency: "MXN" },
  ];
  const { formatMoney } = await import("@/lib/talent/offerings-money");
  assert.equal(hubHeadlinePriceText(offerings, null, "es"), formatMoney(50_000, "MXN", "es"));
  assert.equal(hubHeadlinePriceText(offerings, { promos: [], now: NOW }, "es"), formatMoney(50_000, "MXN", "es"));
  const on = hubHeadlinePriceText(offerings, { promos: [promo()], now: NOW, locale: "es" }, "es");
  assert.match(on ?? "", /^Antes .*, ahora .* -20%$/);
  assert.equal(hubHeadlinePriceText([], null, "es"), null);
});
