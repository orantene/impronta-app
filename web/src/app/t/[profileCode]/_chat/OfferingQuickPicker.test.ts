import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { offeringChipPriceLabel, type ChatOffering } from "./OfferingQuickPicker";

function offering(over: Partial<ChatOffering> = {}): ChatOffering {
  return {
    offeringId: "o1",
    talentProfileId: "t1",
    title: "Wedding photography",
    kind: "service",
    priceType: "flat_package",
    amountCents: 50000,
    currency: "USD",
    durationMinutes: null,
    allowPayInPerson: false,
    reserveMode: "full",
    depositPct: null,
    imageUrl: null,
    ...over,
  };
}

describe("offeringChipPriceLabel", () => {
  it("formats a real amount as currency", () => {
    assert.equal(offeringChipPriceLabel(offering({ amountCents: 50000, currency: "USD" }), "en"), "$500");
  });

  it("returns the localized quote word for a priceless real offering", () => {
    const o = offering({ offeringId: "svc-1", title: "Portrait session", amountCents: null });
    assert.equal(offeringChipPriceLabel(o, "en"), "quote");
    assert.equal(offeringChipPriceLabel(o, "es"), "cotización");
  });

  it("suppresses the price label for the synthetic default-custom-quote offering (W0-G)", () => {
    const o = offering({
      offeringId: "default-custom-quote",
      title: "Custom quote",
      amountCents: null,
    });
    assert.equal(offeringChipPriceLabel(o, "en"), "");
    assert.equal(offeringChipPriceLabel(offering({ ...o, title: "Cotización a medida" }), "es"), "");
  });

  it("suppresses the price label when a real offering's title already ends with the price word", () => {
    const o = offering({ offeringId: "svc-2", title: "Wedding Quote", amountCents: null });
    assert.equal(offeringChipPriceLabel(o, "en"), "");

    const trailingPunct = offering({ offeringId: "svc-3", title: "Ask for a quote!", amountCents: null });
    assert.equal(offeringChipPriceLabel(trailingPunct, "en"), "");
  });

  it("does not suppress when the title merely contains the word mid-sentence", () => {
    const o = offering({ offeringId: "svc-4", title: "Quote request for events", amountCents: null });
    assert.equal(offeringChipPriceLabel(o, "en"), "quote");
  });
});
