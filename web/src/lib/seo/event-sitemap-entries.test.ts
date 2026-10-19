import test from "node:test";
import assert from "node:assert/strict";

import { eventSitemapEntries, loadEventSitemapEntries, type EventSitemapRow } from "@/lib/seo/event-sitemap-entries";

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
    publiclyListed: true,
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

test("future events only: past and just-ended events are excluded", () => {
  const old = row({ slug: "old", latestStartsAt: "2026-06-01T02:00:00.000Z" });
  const recent = row({ slug: "recent", latestStartsAt: "2026-10-15T02:00:00.000Z" });
  const later = row({ slug: "later", latestStartsAt: "2026-10-19T12:00:01.000Z" });
  const urls = eventSitemapEntries([old, recent, later], { ...BASE, supportedLocales: ["en"] }).map((e) => e.url);
  assert.deepEqual(urls, ["https://venue.example/events/later"]);
});

test("unlisted, private or pending events (offering not public) are excluded", () => {
  assert.deepEqual(eventSitemapEntries([row({ publiclyListed: false })], BASE), []);
});

test("an event with no scheduled night is excluded", () => {
  assert.deepEqual(eventSitemapEntries([row({ latestStartsAt: null })], BASE), []);
});

test("a malformed slug is never emitted", () => {
  assert.deepEqual(eventSitemapEntries([row({ slug: "Bad Slug/../x" })], BASE), []);
});

// ---- loader: chunking, paging, offering gate --------------------------------

type Q = { table: string; filters: Record<string, unknown>; ins: Record<string, unknown[]>; range?: [number, number] };

/** Minimal PostgREST fake that enforces a 1000-row cap and records every request. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>, log: Q[]) {
  return {
    from(table: string) {
      const q: Q = { table, filters: {}, ins: {} };
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => ((q.filters[c] = v), chain),
        in: (c: string, v: unknown[]) => ((q.ins[c] = v), chain),
        order: () => chain,
        range: (a: number, b: number) => ((q.range = [a, b]), chain),
        then(res: (v: unknown) => unknown) {
          log.push(q);
          let rows = tables[table] ?? [];
          for (const [c, v] of Object.entries(q.filters)) rows = rows.filter((r) => r[c] === v);
          for (const [c, v] of Object.entries(q.ins)) rows = rows.filter((r) => v.includes(r[c]));
          const [a, b] = q.range ?? [0, 999];
          return Promise.resolve({ data: rows.slice(a, Math.min(b, a + 999) + 1), error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

test("loader: >100 events are chunked, sessions beyond 1000 rows are paged, unlisted are dropped", async () => {
  const N = 250;
  const events = Array.from({ length: N }, (_, i) => ({
    id: `e${i}`, slug: `ev-${i}`, status: "published", tenant_id: "t", updated_at: "2026-10-01T00:00:00.000Z", offering_id: `o${i}`,
  }));
  const offerings = events.map((e, i) => ({
    id: `o${i}`, tenant_id: "t", status: "published", moderation_state: "approved", visibility: i === 7 ? "agency_only" : "public",
  }));
  // 5 future nights per event = 1250 rows, over the 1000-row cap.
  const sessions = events.flatMap((e) =>
    [1, 2, 3, 4, 5].map((d) => ({ event_id: e.id, status: "scheduled", starts_at: `2026-11-0${d}T02:00:00.000Z` })));
  const log: Q[] = [];
  const out = await loadEventSitemapEntries({
    supabase: fakeDb({ events, talent_offerings: offerings, sessions }, log) as never,
    tenantId: "t", origin: "https://venue.example", defaultLocale: "en", supportedLocales: ["en"], now: NOW,
  });
  assert.equal(out.length, N - 1);
  assert.equal(out.some((e) => e.url.endsWith("/events/ev-7")), false);
  assert.ok(out.some((e) => e.url.endsWith("/events/ev-249")));
  for (const q of log.filter((x) => x.table !== "events")) {
    for (const ids of Object.values(q.ins)) assert.ok(ids.length <= 100, `${q.table} asked for ${ids.length} ids`);
  }
  assert.equal(log.filter((q) => q.table === "sessions").length >= 3, true);
});
