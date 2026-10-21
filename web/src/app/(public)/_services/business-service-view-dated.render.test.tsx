/**
 * TUL-1411: a business service page that sells dated places mounts the booking
 * step in its protected booking panel instead of the generic /book link.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { businessServiceFacts } from "@/lib/services/business-pages/page-model";
import { BusinessServiceView } from "./business-service-view";

const O = {
  id: "1a2b3c4d-0000-4000-8000-000000000000",
  kind: "service",
  title: "Sunrise paddle",
  description: "",
  priceDisplay: "exact",
  amountCents: 4500,
  currency: "USD",
  durationMinutes: 120,
  visibility: "public",
  imageUrls: [],
  cancellationHours: 24,
  reserveMode: "full" as const,
};

const base = {
  locale: "en",
  title: O.title,
  description: "",
  facts: businessServiceFacts(O, "en"),
  faq: [],
  homeHref: "/",
};

describe("BusinessServiceView booking slot", () => {
  it("renders the slot inside the protected panel and replaces the /book link", () => {
    const html = renderToStaticMarkup(
      <BusinessServiceView {...base} bookHref="/book" bookingSlot={<div data-testid="slot">STEP</div>} />,
    );
    assert.match(html, /data-business-service-booking=""[\s\S]*id="dated-places"[\s\S]*STEP/);
    assert.doesNotMatch(html, /href="\/book"/);
    // the phone bar keeps its button and points at the step
    assert.match(html, /class="bsp-sticky"[\s\S]*href="#dated-places"/);
  });

  it("without a slot nothing changes: the /book link stays", () => {
    const html = renderToStaticMarkup(<BusinessServiceView {...base} bookHref="/book" />);
    assert.equal((html.match(/href="\/book"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /dated-places/);
  });

  it("a hidden CTA still hides the slot (the owner switched booking off)", () => {
    const html = renderToStaticMarkup(<BusinessServiceView {...base} bookHref={null} bookingSlot={<div>STEP</div>} />);
    assert.doesNotMatch(html, /STEP/);
  });
});
