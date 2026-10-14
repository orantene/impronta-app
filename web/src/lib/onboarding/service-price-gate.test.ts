import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { offeringNeedsPrice } from "../talent/offering-needs-price";
import { missingTitleLocale } from "../talent/offering-missing-translation";
import { blankOffering, validateOffering } from "../talent/offerings-types";
import { DEFAULT_SERVICE_MINUTES, offeringRowFor, parseEssentialService, planOfferingWrites, servicesFromFacts, suggestedServices } from "./essentials";

const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const es = { trade: "hair", locale: "es" as const, country: "MX" };

test("TUL-567: onboarding never publishes a service without a price", () => {
  const priced = offeringRowFor({ name: "Corte", durationMin: 45, priceCents: 35000, quote: false, currency: "MXN" }, 0);
  assert.equal(priced.status, "published");
  for (const s of [
    { name: "Corte", durationMin: 45, priceCents: null, quote: true, currency: "MXN" },
    { name: "Corte", durationMin: 45, priceCents: 0, quote: false, currency: "MXN" },
    { name: "Corte", durationMin: 45, priceCents: 35000, quote: true, currency: "MXN" },
  ]) {
    const row = offeringRowFor(s, 0);
    assert.equal(row.status, "draft", JSON.stringify(s));
    assert.equal(row.amount_cents, null);
  }
});

test("TUL-567: Publish on an unpriced onboarding draft is refused until it has a price", () => {
  const row = offeringRowFor({ name: "Corte", durationMin: 45, priceCents: null, quote: true, currency: "MXN" }, 0);
  const asOffering = {
    ...blankOffering("tp-1", row.currency, 0),
    title: row.title,
    priceType: row.price_type,
    priceDisplay: row.price_display,
    amountCents: row.amount_cents,
    bookingMode: row.booking_mode,
  };
  assert.deepEqual(validateOffering({ ...asOffering, status: "draft" }), []);
  assert.ok(validateOffering({ ...asOffering, status: "published" }).some((e) => e.includes("needs a price")));
  assert.deepEqual(validateOffering({ ...asOffering, status: "published", amountCents: 35000 }), []);
  assert.equal(offeringNeedsPrice({ status: "draft", priceDisplay: row.price_display, amountCents: row.amount_cents }), true);
});

test("TUL-567: a Spanish flow names pack services in Spanish even when the AI said them in English", () => {
  const out = servicesFromFacts(["Haircuts", "Color", "Styling"], es);
  assert.deepEqual(out.map((s) => s.name), ["Corte de cabello", "Color", "Peinado y secado"]);
  assert.deepEqual(out[0].nameI18n, { en: "Haircut", es: "Corte de cabello" });
  assert.equal(out[0].saidAs, "Haircuts");
  assert.ok(out.every((s) => s.priceCents && !s.quote), "MX pack prices carry over");
  assert.deepEqual(servicesFromFacts(["Cortes", "Peinados"], es).map((s) => s.name), ["Corte de cabello", "Peinado y secado"]);
  assert.deepEqual(servicesFromFacts(["Balayage"], es).map((s) => [s.name, s.nameI18n]), [["Balayage", null]], "non-pack names are kept as said");
});

test("TUL-567: pack services carry both titles, so a bilingual site does not flag them as missing English", () => {
  const [first] = suggestedServices(es);
  const row = offeringRowFor(first, 0);
  assert.deepEqual(row.title_i18n, { en: "Haircut", es: "Corte de cabello" });
  assert.equal(missingTitleLocale({ title: row.title, titleI18n: row.title_i18n }, "es", ["es", "en"]), null);
  assert.equal(missingTitleLocale({ title: "Balayage", titleI18n: null }, "es", ["es", "en"]), "en", "own words still get the cue");
});

test("TUL-567: an edited name drops the pack translations; JSON round-trip keeps them otherwise", () => {
  const [first] = servicesFromFacts(["Haircuts"], es);
  assert.deepEqual(parseEssentialService(JSON.parse(JSON.stringify(first)))?.nameI18n, { en: "Haircut", es: "Corte de cabello" });
  assert.equal(parseEssentialService({ ...first, name: "Corte con barba" })?.nameI18n, null);
});

test("TUL-567: the AI draft 'Haircuts' is renamed in place, never left behind as an English duplicate", () => {
  const services = servicesFromFacts(["Haircuts", "Styling"], es);
  const plan = planOfferingWrites([{ id: "d1", title: "Haircuts", status: "draft" }, { id: "d2", title: "Styling", status: "draft" }], services);
  assert.equal(plan.insert.length, 0);
  assert.deepEqual(plan.update.map((u) => [u.id, u.patch.title]), [["d1", "Corte de cabello"], ["d2", "Peinado y secado"]]);
});

test("TUL-567: 'Falta precio' cue is on draft services without a price only", () => {
  assert.equal(offeringNeedsPrice({ status: "draft", priceDisplay: "quote", amountCents: null }), true);
  assert.equal(offeringNeedsPrice({ status: "draft", priceDisplay: "exact", amountCents: 0 }), true);
  assert.equal(offeringNeedsPrice({ status: "draft", priceDisplay: "exact", amountCents: 35000 }), false);
  assert.equal(offeringNeedsPrice({ status: "published", priceDisplay: "quote", amountCents: null }), false);
  assert.equal(offeringNeedsPrice({ status: "archived", priceDisplay: "quote", amountCents: null }), false);
});

test("TUL-567: both service lists draw the cue, with EN and ES copy", () => {
  assert.match(read("src/components/talent/services/ItemStateChips.tsx"), /<NeedsPriceChip item=\{item\}/);
  assert.equal((read("src/components/admin/shell/internal/page-modules/catalog/CatalogList.tsx").match(/<NeedsPriceChip item=\{o\}/g) ?? []).length, 2);
  const en = JSON.parse(read("messages/en.json")).dashboard.catalog.list;
  const esMsg = JSON.parse(read("messages/es.json")).dashboard.catalog.list;
  assert.equal(esMsg.needsPrice, "Falta precio");
  assert.ok(en.needsPrice && en.needsPriceHint && esMsg.needsPriceHint);
  assert.match(read("src/components/onboarding/steps/setup-services.tsx"), /copy\.hiddenUntilPriced/);
});

test("TUL-633: an AI-read service with no known length still gets a default duration, so it is never a dead row", () => {
  const [custom] = servicesFromFacts(["Balayage"], { trade: "hair", country: "United States", locale: "en" });
  assert.equal(custom.durationMin, null, "the essentials keep what was really said");
  const row = offeringRowFor(custom, 0);
  assert.equal(row.duration_minutes, DEFAULT_SERVICE_MINUTES);
  assert.equal(row.status, "draft", "unpriced stays a draft: the default length never publishes anything");
  assert.equal(offeringRowFor({ ...custom, durationMin: 45 }, 0).duration_minutes, 45, "a real length wins");
});
