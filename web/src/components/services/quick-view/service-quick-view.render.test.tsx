/**
 * TUL-1272 #3, #9: the quick view layer puts every fact in the list page's HTML
 * (crawlable), one <dialog> per quick-view service, with a real booking link and
 * "see full page" only when a page exists. Desktop popup and 390 px bottom sheet
 * are one dialog styled by a media query.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildServiceQuickView } from "@/lib/services/presentation/quick-view-model";
import { ServiceQuickViewLayer } from "./ServiceQuickViewLayer";
import { SERVICE_QUICK_VIEW_CSS } from "./quick-view-css";

const O = {
  id: "1a2b3c4d-0000-4000-8000-000000000000",
  kind: "service",
  title: "Clase de cocina",
  description: "Pasta fresca en casa.",
  priceDisplay: "exact",
  amountCents: 90000,
  currency: "MXN",
  durationMinutes: 120,
  visibility: "public",
  imageUrls: ["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"],
  cancellationHours: 48,
  reserveMode: "full" as const,
};

describe("ServiceQuickViewLayer", () => {
  it("renders one dialog per quick view with photos, price, FAQ, policies and a real booking link", () => {
    const qv = buildServiceQuickView(O, {
      locale: "es",
      homePath: "/",
      pageHref: "/servicio-clase-de-cocina-1a2b3c4d",
      domId: "servicio-1a2b3c4d--n1",
      reviews: { average: 4.8, count: 12, reviews: [{ id: "r1", rating: 5, body: "Excelente", clientName: "Ana" } as never] },
    });
    const html = renderToStaticMarkup(<ServiceQuickViewLayer nodeId="n1" views={[qv]} />);
    // DOM id unique per widget; the permanent share id travels in data-sqv-key.
    assert.match(html, /<dialog[^>]*id="servicio-1a2b3c4d--n1"/);
    assert.match(html, /data-sqv-key="servicio-1a2b3c4d"/);
    assert.match(html, /aria-labelledby="servicio-1a2b3c4d--n1-title"/);
    assert.match(html, /Clase de cocina/);
    assert.match(html, /Pasta fresca en casa\./);
    assert.match(html, /https:\/\/cdn\.example\/p2\.jpg/);
    assert.match(html, /900/);
    assert.match(html, /Preguntas frecuentes/);
    assert.match(html, /Cancelación gratuita hasta 48 h antes/);
    assert.match(html, /Reseñas/);
    assert.match(html, /Excelente/);
    assert.match(html, /href="\/\?book=1a2b3c4d-0000-4000-8000-000000000000#book"[^>]*data-sqv-book="1a2b3c4d-0000-4000-8000-000000000000"/);
    assert.match(html, /href="\/servicio-clase-de-cocina-1a2b3c4d"[^>]*>Ver página completa</);
    assert.match(html, /<button type="button" class="sqv-close" aria-label="Cerrar" data-sqv-close="">/);
  });

  it("no page, no CTA: neither link is rendered; on_request shows no amount", () => {
    const qv = buildServiceQuickView(
      { ...O, visibility: "on_request", publicCtaHidden: true },
      { locale: "en", homePath: "/en", pageHref: null },
    );
    const html = renderToStaticMarkup(<ServiceQuickViewLayer nodeId="n1" views={[qv]} />);
    assert.doesNotMatch(html, /See full page/);
    assert.doesNotMatch(html, /data-sqv-book/);
    assert.doesNotMatch(html, /900/);
    assert.match(html, /Price on request/);
  });

  it("renders nothing when there is no quick view", () => {
    assert.equal(renderToStaticMarkup(<ServiceQuickViewLayer nodeId="n1" views={[]} />), "");
  });

  it("CSS: centered popup on desktop, bottom sheet under 640 px, no hex colours", () => {
    assert.match(SERVICE_QUICK_VIEW_CSS, /@media \(max-width: 639px\)/);
    assert.match(SERVICE_QUICK_VIEW_CSS, /border-radius: 16px 16px 0 0/);
    assert.doesNotMatch(SERVICE_QUICK_VIEW_CSS, /#[0-9a-fA-F]{3,8}\b/);
  });
});
