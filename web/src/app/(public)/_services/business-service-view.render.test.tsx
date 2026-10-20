/**
 * TUL-1272 #5: the business service page body. 390 px: one column, sticky
 * booking bar. Desktop (>= 900 px): content + sticky booking panel.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { businessServiceFacts } from "@/lib/services/business-pages/page-model";
import { BUSINESS_SERVICE_PAGE_CSS, BusinessServiceView } from "./business-service-view";

const O = {
  id: "1a2b3c4d-0000-4000-8000-000000000000",
  kind: "service",
  title: "Masaje relajante",
  description: "Sesión de 60 minutos.",
  priceDisplay: "exact",
  amountCents: 120000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
  imageUrls: ["https://cdn.example/m.jpg"],
  cancellationHours: 24,
  reserveMode: "full" as const,
};

describe("BusinessServiceView", () => {
  it("renders title, facts, photo, FAQ, protected booking panel and the sticky bar", () => {
    const html = renderToStaticMarkup(
      <BusinessServiceView
        locale="es"
        title={O.title}
        description={O.description}
        facts={businessServiceFacts(O, "es")}
        faq={[{ question: "¿Cuánto dura?", answer: "60 min." }]}
        homeHref="/"
        bookHref="/book"
      />,
    );
    assert.match(html, /<h1>Masaje relajante<\/h1>/);
    assert.match(html, /Sesión de 60 minutos\./);
    assert.match(html, /cdn\.example\/m\.jpg/);
    assert.match(html, /Preguntas frecuentes/);
    assert.match(html, /data-business-service-booking=""/);
    assert.match(html, /Cancelación gratuita hasta 24 h antes/);
    assert.equal((html.match(/href="\/book"/g) ?? []).length, 2);
    assert.match(html, />Inicio</);
  });

  it("on_request: no amount anywhere, the quote CTA; hidden CTA: no booking link", () => {
    const html = renderToStaticMarkup(
      <BusinessServiceView
        locale="en"
        title={O.title}
        description=""
        facts={businessServiceFacts({ ...O, visibility: "on_request" }, "en")}
        faq={[]}
        homeHref="/en"
        bookHref={null}
      />,
    );
    assert.doesNotMatch(html, /1,200|1200/);
    assert.match(html, /Price on request/);
    assert.doesNotMatch(html, /href="\/book"/);
  });

  it("CSS: one column + sticky bar on phones, two columns + sticky panel from 900 px, no hex", () => {
    assert.match(BUSINESS_SERVICE_PAGE_CSS, /\.bsp-grid \{ display: grid; grid-template-columns: 1fr;/);
    assert.match(BUSINESS_SERVICE_PAGE_CSS, /@media \(min-width: 900px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) 340px[\s\S]*\.bsp-sticky \{ display: none; \}/);
    assert.doesNotMatch(BUSINESS_SERVICE_PAGE_CSS, /#[0-9a-fA-F]{3,8}\b/);
  });
});
