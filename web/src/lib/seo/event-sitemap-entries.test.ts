import test from "node:test";
import assert from "node:assert/strict";

import { eventSitemapEntries, type EventSitemapRow } from "@/lib/seo/event-sitemap-entries";

const NOW = new Date("2026-10-19T12:00:00.000Z");
const BASE = {
  origin: "https://venue.example",
  defaultLocale: "en",
  supportedLocales: ["en", "es"],
  now: NOW,
};

function row(over: Partial<EventSitemapRow>): EventSitemapRow {
  return {
    slug: "noche-de-salsa",
    status: "published",
    updatedAt: "2026-10-01T00:00:00.000Z",
    latestStartsAt: "2026-11-01T02:00:00.000Z",
    ...over,
  };
}

test("a public published future event is listed in every language with hreflang", () => {
  const out = eventSitemapEntries([row({})], BASE);
  assert.deepEqual(out.map((e) => e.url), [
    "https://venue.example/events/noche-de-salsa",
    "https://venue.example/es/eventos/noche-de-salsa",
  ]);
  assert.equal(out[0].lastModified instanceof Date, true);
  assert.equal(out[0].alternates?.languages?.es, "https://venue.example/es/eventos/noche-de-salsa");
});

test("a solo-language tenant gets one entry and no alternates", () => {
  const out = eventSitemapEntries([row({})], { ...BASE, supportedLocales: ["en"] });
  assert.equal(out.length, 1);
  assert.equal(out[0].alternates, undefined);
});

test("draft, pending and cancelled events are excluded", () => {
  const out = eventSitemapEntries(
    [row({ status: "draft" }), row({ status: "pending_review" }), row({ status: "cancelled" })],
    BASE,
  );
  assert.deepEqual(out, []);
});

test("an event whose last night ended long ago is excluded, a recent one is kept", () => {
  const old = row({ slug: "old", latestStartsAt: "2026-06-01T02:00:00.000Z" });
  const recent = row({ slug: "recent", latestStartsAt: "2026-10-15T02:00:00.000Z" });
  const urls = eventSitemapEntries([old, recent], { ...BASE, supportedLocales: ["en"] }).map((e) => e.url);
  assert.deepEqual(urls, ["https://venue.example/events/recent"]);
});

test("an event with no scheduled night is excluded", () => {
  assert.deepEqual(eventSitemapEntries([row({ latestStartsAt: null })], BASE), []);
});

test("a malformed slug is never emitted", () => {
  assert.deepEqual(eventSitemapEntries([row({ slug: "Bad Slug/../x" })], BASE), []);
});
