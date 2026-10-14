import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { FLOATING_CHROME_STACK_CSS, SERVICE_STICKY_CTA_SELECTOR } from "./floating-chrome-stack";
import { serviceMainNode } from "./server/service-main";
import type { ServicePageOffering } from "./service-page";

const A: ServicePageOffering = {
  id: "3fa91c2b-1111-4222-8333-444455556666",
  kind: "service",
  title: "Corte",
  description: null,
  priceDisplay: "from",
  amountCents: 30000,
  currency: "MXN",
  durationMinutes: 45,
  visibility: "public",
};

const html = (o: ServicePageOffering, locale = "es", extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(serviceMainNode(o, { locale, homePath: locale === "es" ? "/" : "/en", ...extra }) as never);

test("TUL-795 sticky CTA: phone bar shows the price and opens this service's booking", () => {
  const es = html(A);
  assert.match(es, /data-talent-service-sticky=""/);
  assert.match(es, /Desde/);
  assert.match(es, new RegExp(`href="/\\?book=${A.id}#book"[^>]*>Reservar<`));
  assert.match(html(A, "en"), /href="\/en\?book=[^"]+#book"[^>]*>Book</);
});

test("TUL-795 sticky CTA: hidden when the public CTA is hidden", () => {
  assert.doesNotMatch(html({ ...A, publicCtaHidden: true }), /data-talent-service-sticky/);
});

test("TUL-795 sticky CTA: phone-only, reserves its height and lifts the chat bubble above it", () => {
  assert.equal(SERVICE_STICKY_CTA_SELECTOR, "[data-talent-service-sticky]");
  assert.match(FLOATING_CHROME_STACK_CSS, /@media \(min-width:640px\)\{\[data-talent-service-sticky\]\{display:none!important\}\}/);
  assert.match(FLOATING_CHROME_STACK_CSS, /:root:has\(\[data-talent-service-sticky\]\)\{--cb-bar-h:calc\(64px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-talent-service-sticky\]\) \[data-guest-chat-launcher\]\{bottom:calc\(var\(--cb-bar-h\) \+ 12px\)!important\}/);
});
