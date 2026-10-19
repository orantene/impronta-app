import assert from "node:assert/strict";
import { test } from "node:test";

import { offeringRowFor, parseEssentialService, planOfferingWrites, servicesFromFacts, type EssentialService } from "./essentials";
import { applyPriceChoice, applySuggestedPrices, chooseFixed, chooseQuote, confirmAllPrices, confirmPrice, hasUnconfirmedPrice, setPrice } from "./service-price-choice";
import { cleanServices, setupIssues } from "./setup";
import { suggestedEssentials } from "./essentials";

const base: EssentialService = { name: "Manicure", durationMin: 45, priceCents: 3500, quote: false, currency: "USD", packKey: "nails", nameI18n: { en: "Manicure", es: "Manicura" } };
const rowOf = (s: EssentialService) => planOfferingWrites([], [s]).insert[0];

test("TUL-633: an unconfirmed suggestion is never published as a price", () => {
  const row = rowOf({ ...base, priceSuggested: true });
  assert.equal(row.status, "draft");
  assert.equal(row.amount_cents, null);
  assert.equal(rowOf(confirmPrice({ ...base, priceSuggested: true })).status, "published");
  assert.equal(rowOf(confirmPrice({ ...base, priceSuggested: true })).amount_cents, 3500);
});

test("TUL-633: editing the amount confirms it", () => {
  const s = setPrice({ ...base, priceSuggested: true }, 4200);
  assert.equal(s.priceSuggested, false);
  assert.equal(rowOf(s).amount_cents, 4200);
});

test("TUL-633: Get a quote publishes as Request a quote; an unpriced non-quote row stays a draft (TUL-567)", () => {
  const chosen = rowOf(chooseQuote(base));
  assert.equal(chosen.status, "published");
  assert.equal(chosen.price_display, "quote");
  assert.equal(chosen.amount_cents, null);
  assert.equal(chosen.booking_mode, "request");
  // main's TUL-805: "Price on quote" is itself a deliberate choice, so a quote row goes live even
  // without the PR's quoteChosen flag; only a row with neither a price nor a quote stays a draft.
  const unchosen = rowOf({ ...base, priceCents: null, quote: true });
  assert.equal(unchosen.status, "published");
  assert.equal(unchosen.price_display, "quote");
  const unpriced = rowOf({ ...base, priceCents: null, quote: false });
  assert.equal(unpriced.status, "draft");
  assert.equal(unpriced.price_display, "exact");
  const back = rowOf(chooseFixed(chooseQuote(base)));
  assert.equal(back.status, "draft", "fixed with no number yet is not published");
});

test("TUL-633: applyPriceChoice leaves a plain priced row alone", () => {
  const row = offeringRowFor(base, 0);
  assert.deepEqual(applyPriceChoice(row, base), row);
});

test("TUL-633: flags survive parsing; a stale flag does not", () => {
  const p = parseEssentialService({ name: "A", priceCents: 100, priceSuggested: true });
  assert.equal(p?.priceSuggested, true);
  assert.equal(parseEssentialService({ name: "A", quote: true, quoteChosen: true })?.quoteChosen, true);
  assert.equal(parseEssentialService({ name: "A", priceCents: 100, quoteChosen: true })?.quoteChosen, false);
  assert.equal(parseEssentialService({ name: "A", priceCents: null, priceSuggested: true })?.priceSuggested, false);
});

test("TUL-633: Continue is blocked until every suggestion is confirmed", () => {
  const e = { ...suggestedEssentials({ country: "Spain", locale: "en", name: "A" }), services: [{ ...base, priceSuggested: true }], place: { mode: "studio" as const, area: null }, timezone: "Europe/Madrid" };
  const args = { choice: "myself" as const, country: "Spain", providerEmailDraft: "" };
  assert.ok(setupIssues({ ...args, essentials: e }).includes("confirmPrices"));
  const ok = { ...e, services: confirmAllPrices(e.services) };
  assert.ok(!setupIssues({ ...args, essentials: ok }).includes("confirmPrices"));
  assert.equal(hasUnconfirmedPrice(ok.services), false);
});

test("TUL-633: cleanServices keeps quoteChosen only for a quote row", () => {
  const [q] = cleanServices([chooseQuote(base)]);
  assert.equal(q.quoteChosen, true);
  const [f] = cleanServices([{ ...base, quoteChosen: true }]);
  assert.equal(f.quoteChosen, false);
});

test("TUL-633: suggested prices come from the injected resolver (fakes), flagged unconfirmed", async () => {
  const services = servicesFromFacts(["Manicure", "Pedicure", "Balayage"], { trade: "nails", country: "Spain", locale: "en" });
  const calls: string[] = [];
  const out = await applySuggestedPrices(services, "Spain", {
    serviceKeyFor: (p, en) => `${p}:${en.toLowerCase()}`,
    getSuggestedPrice: async ({ serviceKey }) => {
      calls.push(serviceKey);
      return serviceKey === "nails:manicure" ? { amountMinor: 4000, currency: "USD", durationMinutes: 50 } : null;
    },
  });
  assert.deepEqual(calls.sort(), ["nails:manicure", "nails:pedicure"]);
  assert.equal(out[0].priceCents, 4000);
  assert.equal(out[0].priceSuggested, true);
  assert.equal(out[0].quote, false);
  assert.equal(out[0].durationMin, 45, "pack duration wins over the resolver's");
  assert.equal(out[1].priceCents, null, "no suggestion: left for the person to fill");
  assert.equal(out[2].priceSuggested, undefined, "non-pack service untouched");
  assert.equal(rowOf(out[0]).status, "draft");
});

test("TUL-633: a resolver outage never blocks signup", async () => {
  const s = servicesFromFacts(["Manicure"], { trade: "nails", country: "Spain", locale: "en" });
  const out = await applySuggestedPrices(s, "Spain", { serviceKeyFor: () => "k", getSuggestedPrice: async () => { throw new Error("down"); } });
  assert.equal(out[0].priceCents, null);
});

test("TUL-633: a Mexico pack price is flagged for confirmation too", async () => {
  const s = servicesFromFacts(["Manicure"], { trade: "nails", country: "MX", locale: "en" });
  const out = await applySuggestedPrices(s, "MX", { serviceKeyFor: () => "k", getSuggestedPrice: async () => null });
  assert.equal(out[0].priceSuggested, true);
});

test("TUL-633: a non-MX workspace with NO approved suggestion rows still ends with a non-empty, bookable catalog", async () => {
  // The table has no approved rows (migration unapplied or prices still draft): every lookup is null.
  const { getSuggestedPrice, serviceKeyFor } = await import("../pricing/suggested-price");
  for (const country of ["US", "ES", "GB", "CO"]) {
    const ess = suggestedEssentials({ discipline: "nails", country, locale: "en" });
    assert.ok(ess.services.length >= 3, `${country}: pack services exist`);
    const priced = await applySuggestedPrices(ess.services, country, {
      getSuggestedPrice: (i) => getSuggestedPrice(i, { readApproved: async () => null }),
      serviceKeyFor,
    });
    const rows = priced.map((s, i) => offeringRowFor(s, i));
    assert.ok(rows.every((r) => r.status === "published"), `${country}: all published as quote, not draft`);
    assert.ok(rows.every((r) => r.price_display === "quote" && r.booking_mode === "request"), `${country}: request-a-quote`);
    assert.ok(rows.every((r) => (r.duration_minutes ?? 0) > 0), `${country}: every row has a duration so slots exist`);
    assert.ok(priced.every((s) => !s.priceSuggested), `${country}: nothing awaits an unconfirmed price`);
  }
});
