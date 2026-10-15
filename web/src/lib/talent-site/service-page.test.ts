import test from "node:test";
import assert from "node:assert/strict";

import {
  buildServicePageJsonLd,
  parseServiceSlug,
  resolveServiceBySlug,
  serviceBookHref,
  serviceMetaText,
  servicePageCopy,
  serviceSitemapPaths,
  serviceSlug,
  type ServicePageOffering,
} from "./service-page";

const off = (id: string, title: string, o: Partial<ServicePageOffering> = {}): ServicePageOffering => ({
  id,
  kind: "service",
  title,
  description: null,
  priceDisplay: "exact",
  amountCents: 45000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
  ...o,
});

const A = off("3fa91c2b-1111-4222-8333-444455556666", "Corte de cabello y barba");

test("slug is stable, accent-free and ends in the id fragment", () => {
  assert.equal(serviceSlug(A), "servicio-corte-de-cabello-y-barba-3fa91c2b");
  assert.equal(serviceSlug({ id: A.id, title: "Ñandú Súper!" }), "servicio-nandu-super-3fa91c2b");
  assert.equal(serviceSlug({ id: A.id, title: "!!!" }), "servicio-3fa91c2b");
});

test("parseServiceSlug accepts only service slugs", () => {
  assert.equal(parseServiceSlug("servicio-corte-3fa91c2b"), "3fa91c2b");
  assert.equal(parseServiceSlug("servicio-3fa91c2b"), "3fa91c2b");
  assert.equal(parseServiceSlug("about"), null);
  assert.equal(parseServiceSlug("servicio-corte"), null);
  assert.equal(parseServiceSlug("servicios"), null);
  assert.equal(parseServiceSlug(null), null);
});

test("resolution uses the id, so a renamed service still resolves", () => {
  const list = [A, off("aaaaaaaa-1111-4222-8333-444455556666", "Otro")];
  assert.equal(resolveServiceBySlug(list, "servicio-nombre-viejo-3fa91c2b")?.id, A.id);
  assert.equal(resolveServiceBySlug(list, "servicio-x-deadbeef"), null);
});

test("agency-only, products and untitled entries get no page", () => {
  const list = [
    off("11111111-1111-4222-8333-444455556666", "Hidden", { visibility: "agency_only" }),
    off("22222222-1111-4222-8333-444455556666", "Mug", { kind: "product" }),
    off("33333333-1111-4222-8333-444455556666", "  "),
    A,
  ];
  assert.deepEqual(serviceSitemapPaths(list), ["/servicio-corte-de-cabello-y-barba-3fa91c2b"]);
  assert.equal(resolveServiceBySlug(list, "servicio-hidden-11111111"), null);
});

test("booking CTA is the existing deep link, per language home", () => {
  assert.equal(serviceBookHref(A.id.toUpperCase(), "/en"), `/en?book=${A.id}#book`);
  assert.equal(serviceBookHref(A.id, ""), `/?book=${A.id}#book`);
});

test("meta text: title with talent name, trimmed description, no em dash", () => {
  const m = serviceMetaText({ title: "Corte", description: "x ".repeat(400) }, "Jorge");
  assert.equal(m.title, "Corte | Jorge");
  assert.ok(m.description.length <= 160 && m.description!.endsWith("..."));
  assert.equal(serviceMetaText({ title: "Corte", description: null }, null).description, "Corte");
  assert.equal(
    serviceMetaText({ title: "Gel", description: null }, "Ana", { city: "Cancun", locale: "es" }).description,
    "Gel por Ana en Cancun",
  );
  assert.equal(
    serviceMetaText({ title: "Gel", description: "  " }, "Ana", { city: "Cancun", locale: "en" }).description,
    "Gel by Ana in Cancun",
  );
  for (const l of ["es", "en"]) {
    const c = servicePageCopy(l);
    assert.ok(!/—/.test(`${c.book}${c.back}${c.priceFrom}`));
  }
  assert.match(servicePageCopy("en").book, /Book/);
  assert.match(servicePageCopy("es").book, /Reservar/);
});

type Ld = {
  "@type": string;
  name: string;
  description?: string;
  image?: string;
  provider: { name?: string };
  offers?: { price?: string; priceCurrency?: string };
};

test("Service JSON-LD: real data only", () => {
  const ld = buildServicePageJsonLd({
    offering: { ...A, description: "Incluye lavado", imageUrls: ["https://x/y.jpg"] },
    canonicalUrl: "https://j.example/servicio-corte-3fa91c2b",
    talentName: "Jorge",
    inLanguage: "es",
  }) as unknown as Ld;
  assert.equal(ld["@type"], "Service");
  assert.equal(ld.name, "Corte de cabello y barba");
  assert.equal(ld.description, "Incluye lavado");
  assert.equal(ld.provider.name, "Jorge");
  assert.equal(ld.offers?.price, "450.00");
  assert.equal(ld.offers?.priceCurrency, "MXN");
  assert.equal(ld.image, "https://x/y.jpg");
  const quote = buildServicePageJsonLd({
    offering: { ...A, priceDisplay: "quote", amountCents: null },
    canonicalUrl: "https://j.example/s",
    talentName: null,
    inLanguage: "en",
  }) as unknown as Ld;
  assert.equal(quote.offers?.price, undefined);
});

test("TUL-797: all-services link lands on the services section in both languages", async () => {
  const { serviceBackHref } = await import("./service-page");
  assert.equal(serviceBackHref("/"), "/#services");
  assert.equal(serviceBackHref("/en"), "/en/#services");
  assert.equal(serviceBackHref(""), "/#services");
});

test("TUL-795: related services prefer the same category, skip self and ineligible rows", async () => {
  const { pickRelatedServices } = await import("./service-page");
  const mk = (id: string, category: string | null, extra: object = {}) => ({
    id, kind: "service", title: id, description: null, priceDisplay: "quote", amountCents: null, currency: "MXN",
    durationMinutes: null, visibility: "public", category, ...extra,
  });
  const list = [mk("a", "hair"), mk("b", "nails"), mk("c", "hair"), mk("d", "hair", { visibility: "agency_only" }), mk("e", null, { kind: "product" })];
  assert.deepEqual(pickRelatedServices(list, "a").map((o) => o.id), ["c", "b"]);
  assert.deepEqual(pickRelatedServices(list, "a", 1).map((o) => o.id), ["c"]);
});

test("TUL-795: copy carries the related heading and free-cancel line in both languages", async () => {
  const { servicePageCopy } = await import("./service-page");
  assert.equal(servicePageCopy("es").related, "Otros servicios");
  assert.equal(servicePageCopy("en").freeCancel(24), "Free cancellation up to 24 h before");
  assert.match(servicePageCopy("es").freeCancel(24), /24 h/);
});
