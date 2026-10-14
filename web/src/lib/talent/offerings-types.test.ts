import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rowToOffering,
  validateOffering,
  resolveOfferingCta,
  offeringIsDirectlyBookable,
  offeringPriceLabel,
  blankOffering,
  offeringToRowPatch,
  offeringText,
  type TalentOfferingRow,
} from "./offerings-types";
import { offeringToOfferLineSeed, offeringIsOfferPriceable } from "./offerings-offer";

function row(over: Partial<TalentOfferingRow> = {}): TalentOfferingRow {
  return {
    id: "o1",
    talent_profile_id: "t1",
    tenant_id: null,
    kind: "service",
    title: "Deep-tissue massage",
    description: "60 minutes of focused work",
    price_type: "per_contact",
    price_display: "exact",
    amount_cents: 12000,
    currency: "USD",
    booking_mode: "request",
    reserve_mode: "full",
    deposit_pct: null,
    cancellation_hours: null,
    free_reserve_expires_days: null,
    allow_pay_in_person: false,
    duration_minutes: 60,
    category: null,
    inventory_qty: null,
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    is_featured: false,
    sort_order: 0,
    attributes: {},
    title_i18n: { en: "Deep-tissue massage" },
    description_i18n: null,
    ...over,
  };
}

describe("rowToOffering", () => {
  it("maps a clean row and tolerates junk enums", () => {
    const o = rowToOffering(row());
    assert.equal(o.title, "Deep-tissue massage");
    assert.equal(o.priceType, "per_contact");
    assert.equal(o.amountCents, 12000);
    assert.equal(o.bookingMode, "request");
    assert.equal(o.requireAccountToBook, false);

    assert.equal(
      rowToOffering(row({ require_account_to_book: true })).requireAccountToBook,
      true,
    );

    const junk = rowToOffering(row({ kind: "nonsense", price_type: "??", booking_mode: "x", price_display: "y" }));
    assert.equal(junk.kind, "service");
    assert.equal(junk.priceType, "flat_package");
    // WSF-B: an unknown mode reads as null = inherit the talent default (not a hard request).
    assert.equal(junk.bookingMode, null);
    assert.equal(rowToOffering(row({ booking_mode: null })).bookingMode, null);
    assert.equal(rowToOffering(row({ booking_mode: "inquiry" })).bookingMode, "inquiry");
    assert.equal(junk.priceDisplay, "exact");
  });
  it("prefers the locale i18n title", () => {
    const o = rowToOffering(row({ title_i18n: { en: "Massage", es: "Masaje" } }), "es");
    assert.equal(o.title, "Masaje");
  });
});

describe("validateOffering", () => {
  it("requires a title and a price unless quote/custom", () => {
    const o = blankOffering("t1", "USD", 0);
    assert.ok(validateOffering(o).length >= 2); // no title, no price
    o.title = "Fade";
    o.amountCents = 4000;
    assert.deepEqual(validateOffering(o), []);
    o.amountCents = null;
    o.priceDisplay = "quote";
    o.bookingMode = "request";
    assert.deepEqual(validateOffering(o), []); // contact-for-price is valid without amount
  });
  it("instant booking demands one exact price, including free", () => {
    const o = { ...blankOffering("t1", "USD", 0), title: "Fade", bookingMode: "instant" as const };
    assert.ok(validateOffering(o).length > 0); // no amount
    o.amountCents = 0;
    assert.deepEqual(validateOffering(o), []);
    o.amountCents = 4000;
    assert.deepEqual(validateOffering(o), []);
    o.priceDisplay = "from";
    assert.ok(validateOffering(o).length > 0); // "from" price can't instant-book
  });
});

describe("resolveOfferingCta + offeringIsDirectlyBookable (the money guard)", () => {
  it("routes by behavior", () => {
    const base = rowToOffering(row());
    assert.equal(resolveOfferingCta(base), "request_to_book");
    assert.equal(resolveOfferingCta({ ...base, bookingMode: "instant" }), "book_now");
    assert.equal(resolveOfferingCta({ ...base, bookingMode: "instant", kind: "product" }), "buy_now");
    assert.equal(resolveOfferingCta({ ...base, priceDisplay: "quote" }), "ask_quote");
    assert.equal(resolveOfferingCta({ ...base, priceType: "custom", amountCents: null }), "ask_quote");
    assert.equal(resolveOfferingCta({ ...base, visibility: "on_request" }), "request");
  });
  it("quote/custom/draft/agency_only offerings are NEVER directly bookable", () => {
    const ok = rowToOffering(row({ booking_mode: "instant" }));
    assert.equal(offeringIsDirectlyBookable(ok), true);
    assert.equal(offeringIsDirectlyBookable({ ...ok, priceDisplay: "quote" }), false);
    assert.equal(offeringIsDirectlyBookable({ ...ok, priceType: "custom" }), false);
    assert.equal(offeringIsDirectlyBookable({ ...ok, status: "draft" }), false);
    assert.equal(offeringIsDirectlyBookable({ ...ok, visibility: "agency_only" }), false);
    assert.equal(offeringIsDirectlyBookable({ ...ok, amountCents: null }), false);
    assert.equal(offeringIsDirectlyBookable({ ...ok, amountCents: 0 }), true);
    assert.equal(offeringIsDirectlyBookable({ ...ok, bookingMode: "request" }), false);
  });
});

describe("offeringPriceLabel", () => {
  it("renders exact, from, quote, and on-request", () => {
    const base = rowToOffering(row());
    assert.match(offeringPriceLabel(base, "en"), /\$120/);
    assert.match(offeringPriceLabel(base, "en"), /session/);
    assert.match(offeringPriceLabel({ ...base, priceDisplay: "from" }, "en"), /^from /);
    assert.equal(offeringPriceLabel({ ...base, priceDisplay: "quote" }, "en"), "Quote on request");
    assert.equal(offeringPriceLabel({ ...base, visibility: "on_request" }, "en"), "On request");
    assert.equal(offeringPriceLabel({ ...base, visibility: "on_request" }, "es"), "Bajo consulta");
  });

  it("uses the Spanish price suffix on es (TUL-494: no English / session)", () => {
    const base = rowToOffering(row());
    assert.match(offeringPriceLabel(base, "es"), /sesión/);
    assert.doesNotMatch(offeringPriceLabel(base, "es"), /session/);
  });

  it("zero amount shows Consultar / Ask, never $0 MXN (TUL-533 GRK-064)", () => {
    const base = rowToOffering(row({ amount_cents: 0 }));
    assert.equal(offeringPriceLabel(base, "es"), "Consultar");
    assert.equal(offeringPriceLabel(base, "en"), "Ask");
    assert.equal(offeringPriceLabel(base, "es-MX"), "Consultar");
  });
});

describe("offeringToOfferLineSeed", () => {
  it("stamps source_service_id and multiplies quantity units only", () => {
    const o = rowToOffering(row());
    const line = offeringToOfferLineSeed(o, 3);
    assert.ok(line);
    assert.equal(line.source_service_id, "o1");
    assert.equal(line.pricing_unit, "per_contact");
    assert.equal(line.units, 3);
    assert.equal(line.unit_price, 120);
    assert.equal(line.total_price, 360);

    const flat = offeringToOfferLineSeed({ ...o, priceType: "flat_package" }, 3);
    assert.ok(flat);
    assert.equal(flat.units, 1); // flat lines never multiply
    assert.equal(flat.total_price, 120);
  });
  it("refuses custom/unpriced offerings", () => {
    const o = rowToOffering(row({ price_type: "custom", amount_cents: null }));
    assert.equal(offeringToOfferLineSeed(o), null);
    assert.equal(offeringIsOfferPriceable(o), false);
  });
});

it("WSF B2: validateOffering holds an inherited Instant default to instant rules", async () => {
  const { blankOffering, validateOffering } = await import("./offerings-types");
  const base = { ...blankOffering("t1", "USD", 0), title: "Cut", bookingMode: null, status: "published" as const };
  const priced = { ...base, amountCents: 5000 };
  assert.deepEqual(validateOffering(priced, "instant"), []);
  const quote = { ...base, priceDisplay: "quote" as const };
  assert.ok(validateOffering(quote, "instant").some((e) => e.includes("follows your Instant default")));
  assert.deepEqual(validateOffering(quote, "request"), []);
  const dep = { ...priced, reserveMode: "deposit" as const };
  assert.ok(validateOffering(dep, "instant").some((e) => e.includes("deposit percent")));
  assert.deepEqual(validateOffering({ ...dep, depositPct: 30 }, "instant"), []);
});

describe("offering translations round-trip (PR 2)", () => {
  it("EN-primary callers with no maps write exactly { en: title }", () => {
    const o = { ...blankOffering("t1", "USD", 0), title: "Haircut", description: "Wash and cut" };
    const p = offeringToRowPatch(o);
    assert.deepEqual(p.title_i18n, { en: "Haircut" });
    assert.deepEqual(p.description_i18n, { en: "Wash and cut" });
    const empty = offeringToRowPatch({ ...o, description: null });
    assert.equal(empty.description_i18n, null);
  });

  it("a Spanish translation survives an English-primary save", () => {
    const loaded = rowToOffering(
      row({ title_i18n: { en: "Deep-tissue massage", es: "Masaje profundo" } }),
    );
    assert.deepEqual(loaded.titleI18n, { en: "Deep-tissue massage", es: "Masaje profundo" });
    const p = offeringToRowPatch({ ...loaded, title: "Deep massage" });
    assert.deepEqual(p.title_i18n, { en: "Deep massage", es: "Masaje profundo" });
  });

  it("an ES-primary save writes the primary into es and keeps en", () => {
    const loaded = rowToOffering(
      row({ title: "Masaje profundo", title_i18n: { es: "Masaje profundo", en: "Deep massage" } }),
      "es",
      [],
      ["es"],
    );
    assert.equal(loaded.title, "Masaje profundo");
    const p = offeringToRowPatch({ ...loaded, title: "Masaje relajante" }, "es");
    assert.equal(p.title, "Masaje relajante");
    assert.deepEqual(p.title_i18n, { es: "Masaje relajante", en: "Deep massage" });
  });

  it("offeringText walks the chain, then the plain column", () => {
    const r = row({ title: "Masaje", title_i18n: { es: "Masaje" } });
    assert.equal(offeringText(r, "title", "en", ["en", "es"]), "Masaje");
    assert.equal(offeringText(row({ title: "Plain", title_i18n: null }), "title", "fr"), "Plain");
    assert.equal(offeringText(row({ title_i18n: { en: "Eng" } }), "title", "es"), "Eng");
  });

  it("offeringText uses the platform title dictionary when ES is missing (TUL-189)", () => {
    const r = row({ title: "Semi-permanent gel", title_i18n: { en: "Semi-permanent gel" } });
    assert.equal(offeringText(r, "title", "es"), "Gel semipermanente");
    assert.equal(offeringText(r, "title", "en"), "Semi-permanent gel");
    // Talent-authored Spanish still wins over the dictionary.
    assert.equal(
      offeringText(row({ title: "Semi-permanent gel", title_i18n: { en: "Semi-permanent gel", es: "Mi gel" } }), "title", "es"),
      "Mi gel",
    );
  });
});
