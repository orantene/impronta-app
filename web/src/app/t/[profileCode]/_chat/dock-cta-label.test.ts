import test from "node:test";
import assert from "node:assert/strict";

import type { OfferingCtaKind } from "@/lib/talent/offerings-types";
import { dockServiceCtaLabel, dockStorefrontCtaLabel } from "./dock-cta-label";

const CASES: Array<[OfferingCtaKind, string, string]> = [
  ["book_now", "Select", "Seleccionar"],
  ["request_to_book", "Request", "Solicitar cita"],
  ["ask_quote", "Request a quote", "Pedir cotización"],
  ["request", "Ask", "Consultar"],
];

test("dock service label per mode per locale", () => {
  for (const [cta, en, es] of CASES) {
    assert.equal(dockServiceCtaLabel(cta, "en"), en, `${cta} en`);
    assert.equal(dockServiceCtaLabel(cta, "es"), es, `${cta} es`);
    assert.equal(dockServiceCtaLabel(cta, "es-MX"), es, `${cta} es-MX`);
  }
});

test("no derived CTA reads as an inquiry", () => {
  assert.equal(dockServiceCtaLabel(undefined, "en"), "Ask");
  assert.equal(dockServiceCtaLabel(null, "es"), "Consultar");
});

test("service and class storefront rows never say Buy now", () => {
  for (const locale of ["en", "es"]) {
    for (const cat of ["service", "class"] as const) {
      const label = dockStorefrontCtaLabel(cat, locale, "Buy now");
      assert.notEqual(label, "Buy now");
      assert.ok(!/buy|cart|comprar/i.test(label), label);
    }
  }
  assert.equal(dockStorefrontCtaLabel("ticket", "en", "Buy now"), "Buy now");
});
