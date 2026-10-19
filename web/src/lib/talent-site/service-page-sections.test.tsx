import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { FLOATING_CHROME_STACK_CSS, SERVICE_STICKY_CTA_SELECTOR } from "./floating-chrome-stack";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { serviceMainNode, serviceSeo } from "./server/service-main";
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

const FAQ = [{ question: "¿Cuánto dura?", answer: "45 min." }];
const SEO = { title: "Home", noindex: false, canonical: "https://j.example/servicio-corte-3fa91c2b" };

test("TUL-795 FAQ: the section renders each shown question, and nothing when empty", () => {
  const out = html(A, "es", { faq: FAQ });
  assert.match(out, /data-talent-service-faq=""/);
  assert.match(out, /Preguntas frecuentes/);
  assert.match(out, /<summary[^>]*>¿Cuánto dura\?<\/summary>/);
  assert.doesNotMatch(html(A, "es", { faq: [] }), /data-talent-service-faq/);
});

test("TUL-795 FAQ: JSON-LD carries Service + FAQPage only when an FAQ is shown", () => {
  const withFaq = serviceSeo(SEO, A, { talentName: "Ana", locale: "es", faq: FAQ }).jsonLd as { "@context": string; "@graph": { "@type": string }[] };
  assert.equal(withFaq["@context"], "https://schema.org");
  assert.deepEqual(withFaq["@graph"].map((n) => n["@type"]), ["Service", "BreadcrumbList", "FAQPage"]);
  const plain = serviceSeo(SEO, A, { talentName: "Ana", locale: "es" }).jsonLd as { "@graph": { "@type": string }[] };
  assert.deepEqual(plain["@graph"].map((n) => n["@type"]), ["Service", "BreadcrumbList"]);
});

test("TUL-795 FAQ wiring: the renderer loads the talent's published FAQ for the service page", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"), "utf8");
  assert.match(src, /loadPublishedFaqForProfile\(talentProfileId, locale\)/);
  assert.match(src, /serviceFaqItems\(serviceOffering, talentFaq, locale\)/);
  assert.match(src, /faq: serviceFaq/);
});

test("TUL-795 photos: the service's own images render (deduped, capped), none -> no block", () => {
  const urls = Array.from({ length: 8 }, (_, i) => `https://img.example/${i}.jpg`);
  const out = html({ ...A, imageUrls: [urls[0], urls[0], ...urls.slice(1)] });
  assert.match(out, /data-talent-service-photos=""/);
  assert.equal((out.match(/<img /g) ?? []).length, 6);
  assert.match(out, /alt="Corte"/);
  assert.match(out, /alt="Corte \(2\)"/);
  assert.doesNotMatch(html({ ...A, imageUrls: [] }), /data-talent-service-photos/);
  assert.doesNotMatch(html(A), /<img /);
});

const REVIEWS = { average: 4.8, count: 12, reviews: [{ id: "r1", body: "Excelente", clientName: "Ana", rating: 5, createdAt: "2026-09-01T00:00:00Z" }] };

test("TUL-795 reviews: rating line + review cards render when data exists, nothing otherwise", () => {
  const out = html(A, "es", { reviews: REVIEWS });
  assert.match(out, /data-talent-service-reviews=""/);
  assert.match(out, /★ 4,8 · 12 reseñas/);
  assert.match(out, /Excelente/);
  assert.match(html(A, "en", { reviews: { ...REVIEWS, reviews: [{ ...REVIEWS.reviews[0], demo: true }] } }), /Ana · Demo review/);
  assert.doesNotMatch(html(A, "es", { reviews: null }), /data-talent-service-reviews/);
});

test("TUL-795 reviews: Service JSON-LD never carries AggregateRating or Review", () => {
  // TUL-1085: the Service is the first node of an @graph that also carries the BreadcrumbList.
  const serviceNode = (jsonLd: unknown) => (jsonLd as { "@graph": Record<string, unknown>[] })["@graph"][0]!;
  const ld = serviceNode(serviceSeo(SEO, A, { talentName: "Ana", locale: "es", reviews: REVIEWS }).jsonLd) as { aggregateRating?: { reviewCount: number }; review?: unknown[] };
  assert.equal(ld.aggregateRating, undefined);
  assert.equal(ld.review, undefined);
  const demo = serviceNode(serviceSeo(SEO, A, { talentName: "Ana", locale: "es", reviews: REVIEWS, demo: true }).jsonLd);
  assert.equal("aggregateRating" in demo, false);
  const none = serviceNode(serviceSeo(SEO, A, { talentName: "Ana", locale: "es" }).jsonLd);
  assert.equal("aggregateRating" in none, false);
});

test("TUL-795 reviews wiring: renderer loads published reviews + rating summary and passes demo", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"), "utf8");
  assert.match(src, /loadReviewsSources\(talentProfileId/);
  assert.match(src, /loadTalentRatingSummary\(talentProfileId\)/);
  assert.match(src, /reviews: serviceReviews, demo: isDemo/);
});

test("TUL-586: no description renders the generated sentence (ES + EN) and no empty photo block", () => {
  const es = html(A, "es", { talentName: "Ana", city: "Cancun" });
  assert.match(es, /data-talent-service-description=""[^>]*>Corte por Ana en Cancun</);
  assert.doesNotMatch(es, /data-talent-service-photos/);
  const en = html(A, "en", { talentName: "Ana", city: "Cancun" });
  assert.match(en, />Corte by Ana in Cancun</);
  assert.doesNotMatch(en, /data-talent-service-photos/);
  const real = html({ ...A, description: "Incluye lavado" }, "es", { talentName: "Ana" });
  assert.match(real, />Incluye lavado</);
});
