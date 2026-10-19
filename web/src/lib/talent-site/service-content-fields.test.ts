import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_SERVICE_CONTENT,
  SERVICE_CONTENT_COLUMNS,
  effectiveServiceContent,
  serviceContentFromRow,
} from "./service-content-fields";
import { serviceMetaText, serviceSlug, type ServicePageOffering } from "./service-page";

const A: ServicePageOffering = {
  id: "3fa91c2b-1111-4222-8333-444455556666",
  kind: "service",
  title: "Corte de cabello",
  description: "Corte con tijera y máquina,   lavado incluido.",
  priceDisplay: "exact",
  amountCents: 45000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
};

test("the column list matches the held migration", () => {
  assert.deepEqual([...SERVICE_CONTENT_COLUMNS], [
    "slug",
    "slug_history",
    "summary",
    "seo_title",
    "seo_description",
    "og_media_id",
    "presentation",
    "page_id",
    "service_type",
    "tags",
  ]);
});

test("a row from before the migration (no new keys) reads as empty content", () => {
  assert.deepEqual(serviceContentFromRow({ id: A.id, title: A.title }), EMPTY_SERVICE_CONTENT);
  assert.deepEqual(serviceContentFromRow(null), EMPTY_SERVICE_CONTENT);
  assert.deepEqual(serviceContentFromRow("nope"), EMPTY_SERVICE_CONTENT);
});

test("a row with the columns is normalized; bad values fall back, never throw", () => {
  const c = serviceContentFromRow({
    slug: " Corte-Clasico ",
    slug_history: ["corte-viejo", "", 7, "Corte-Viejo", "corte clasico!"],
    summary: "  Corte rápido  ",
    seo_title: "",
    seo_description: "Descripción SEO",
    og_media_id: "6f1c2b3a-1111-4222-8333-444455556666",
    presentation: "carousel",
    page_id: "not-a-uuid",
    service_type: "Haircut",
    tags: ["Barbería", "barbería", "", null, "fade"],
  });
  assert.equal(c.slug, "corte-clasico");
  assert.deepEqual(c.slugHistory, ["corte-viejo"]);
  assert.equal(c.summary, "Corte rápido");
  assert.equal(c.seoTitle, null);
  assert.equal(c.seoDescription, "Descripción SEO");
  assert.equal(c.ogMediaId, "6f1c2b3a-1111-4222-8333-444455556666");
  assert.equal(c.presentation, null);
  assert.equal(c.pageId, null);
  assert.equal(c.serviceType, "Haircut");
  assert.deepEqual(c.tags, ["barbería", "fade"]);
  assert.equal(serviceContentFromRow({ presentation: "quick_view" }).presentation, "quick_view");
  assert.equal(serviceContentFromRow({ slug: "corte clasico" }).slug, null);
});

test("defaults: with no stored content nothing changes from today's page", () => {
  const meta = serviceMetaText(A, "Ana", { city: "Cancún", locale: "es" });
  const e = effectiveServiceContent(A, null, { talentName: "Ana", city: "Cancún", locale: "es" });
  assert.equal(e.slug, serviceSlug(A));
  assert.equal(e.seoTitle, meta.title);
  assert.equal(e.seoDescription, meta.description);
  assert.equal(e.summary, "Corte con tijera y máquina, lavado incluido.");
  assert.equal(e.presentation, null);
  assert.equal(e.ogMediaId, null);
  assert.equal(e.pageId, null);
  assert.equal(e.serviceType, null);
  assert.deepEqual(e.tags, []);
  assert.deepEqual(e.slugHistory, []);
});

test("defaults: no description gives a null summary and the derived meta line", () => {
  const bare = { ...A, description: null };
  const e = effectiveServiceContent(bare, EMPTY_SERVICE_CONTENT, { talentName: "Ana", locale: "en" });
  assert.equal(e.summary, null);
  assert.equal(e.seoDescription, "Corte de cabello by Ana");
});

test("defaults: long descriptions are clipped to 160 for the summary", () => {
  const long = { ...A, description: "palabra ".repeat(60) };
  const e = effectiveServiceContent(long, null, { talentName: null });
  assert.ok(e.summary && e.summary.length <= 160);
  assert.ok(e.summary?.endsWith("..."));
});

test("stored content overrides each default; summary feeds the meta description", () => {
  const stored = {
    ...EMPTY_SERVICE_CONTENT,
    slug: "corte-clasico",
    summary: "Corte clásico en 45 minutos.",
    seoTitle: "Corte clásico en Cancún",
    presentation: "quick_view" as const,
    tags: ["barberia"],
  };
  const e = effectiveServiceContent(A, stored, { talentName: "Ana", locale: "es" });
  assert.equal(e.slug, "corte-clasico");
  assert.equal(e.summary, "Corte clásico en 45 minutos.");
  assert.equal(e.seoTitle, "Corte clásico en Cancún");
  assert.equal(e.seoDescription, "Corte clásico en 45 minutos.");
  assert.equal(e.presentation, "quick_view");
  assert.deepEqual(e.tags, ["barberia"]);
  const withSeo = effectiveServiceContent(A, { ...stored, seoDescription: "Meta propia" }, { talentName: "Ana" });
  assert.equal(withSeo.seoDescription, "Meta propia");
});
