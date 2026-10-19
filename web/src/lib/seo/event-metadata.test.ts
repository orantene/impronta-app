import test from "node:test";
import assert from "node:assert/strict";

import { eventDetailMetadataFields, eventsListMetadata } from "@/lib/seo/event-metadata";

test("list page has an English and a Spanish title and description", () => {
  const en = eventsListMetadata("en");
  const es = eventsListMetadata("es");
  assert.equal(en.title, "Events");
  assert.equal(es.title, "Eventos");
  assert.ok(String(en.description).length > 20);
  assert.ok(String(es.description).length > 20);
  assert.notEqual(en.description, es.description);
  for (const m of [en, es]) assert.equal(/—|–/.test(`${m.title}${m.description}`), false);
});

test("event page metadata has description and Open Graph with image", () => {
  const f = eventDetailMetadataFields({
    title: "Noche de Salsa",
    description: "  Live band\nand dancing. ",
    imageUrl: "https://venue.example/cover.jpg",
    imageAlt: "Dancers",
    canonical: "https://venue.example/events/noche-de-salsa",
    locale: "en",
  });
  assert.equal(f.description, "Live band and dancing.");
  assert.equal(f.openGraph?.title, "Noche de Salsa");
  assert.equal(f.openGraph?.description, "Live band and dancing.");
  assert.equal(f.openGraph?.url, "https://venue.example/events/noche-de-salsa");
  assert.deepEqual(f.openGraph?.images, [{ url: "https://venue.example/cover.jpg", alt: "Dancers" }]);
});

test("long descriptions are trimmed to 160 characters; no image means no og images", () => {
  const f = eventDetailMetadataFields({ title: "T", description: "x".repeat(400), locale: "es" });
  assert.ok(String(f.description).length <= 160);
  assert.equal(f.openGraph?.images, undefined);
});

test("no description falls back to a localized line naming the event", () => {
  const es = eventDetailMetadataFields({ title: "Noche", description: "", locale: "es" });
  assert.match(String(es.description), /Noche/);
  assert.match(String(es.description), /entradas|evento/i);
});
