import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicEntry } from "@/lib/service-hub/public-hub";
import { PublicHubEntries } from "./PublicHubEntries";

const E = (over: Partial<PublicEntry> = {}): PublicEntry => ({ id: "e1", name: "Massage", category: "Massage", photoUrl: null, priceCents: 45000, from: true, currency: "USD", who: ["Ana", "Blas"], cta: "request", ...over });

describe("PublicHubEntries", () => {
  it("renders request buttons only, with who and a from-price, in English", () => {
    const html = renderToStaticMarkup(<PublicHubEntries entries={[E()]} locale="en" />);
    assert.match(html, />Request</);
    assert.match(html, /From \$450/);
    assert.match(html, /With Ana, Blas/);
    assert.doesNotMatch(html, /Book now|Buy|Comprar|checkout|cart/i);
  });
  it("speaks Spanish", () => {
    const html = renderToStaticMarkup(<PublicHubEntries entries={[E()]} locale="es" />);
    assert.match(html, />Solicitar</);
    assert.match(html, /Desde /);
    assert.match(html, /Con Ana/);
  });
  it("renders nothing for no entries, and no names when none are shown", () => {
    assert.equal(renderToStaticMarkup(<PublicHubEntries entries={[]} locale="en" />), "");
    assert.doesNotMatch(renderToStaticMarkup(<PublicHubEntries entries={[E({ who: [] })]} locale="en" />), /With /);
  });
  it("uses the request link the site gives it", () => {
    const html = renderToStaticMarkup(<PublicHubEntries entries={[E()]} locale="en" requestHref={(e) => `/chat?entry=${e.id}`} />);
    assert.match(html, /href="\/chat\?entry=e1"/);
  });
});
