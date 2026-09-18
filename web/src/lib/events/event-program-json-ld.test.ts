import assert from "node:assert/strict";
import { test } from "node:test";

import { programSubEvents, withEventProgramJsonLd } from "./event-program-json-ld";
import type { PublicEventProgram } from "./schedule/public-loader";

const ready: PublicEventProgram = {
  enabled: true, heading: "Programa", setTimesPublic: true, groupBy: "day", zone: "America/Cancun",
  nights: [], spaces: [{ id: "main", name: "Main stage", kind: "stage" }],
  items: [
    { id: "a", kind: "set", title: "Opening", subtitle: null, description: "Warm-up.", startsAt: "2026-11-22T02:00:00.000Z", endsAt: "2026-11-22T03:00:00.000Z", timeTba: false, sessionId: null, spaceId: "main", performer: { name: "DJ Ana", tba: false, profileHref: "/t/ana", heroUrl: null, instagram: null, bio: null }, coverUrl: "https://cdn.example/a.jpg", media: { gallery: [], video: null }, links: { href: null, label: null, instagram: null, website: null }, sponsor: null, tags: [], sortOrder: 0 },
    { id: "b", kind: "set", title: "Secret", subtitle: null, description: null, startsAt: null, endsAt: null, timeTba: true, sessionId: null, spaceId: null, performer: { name: "", tba: true, profileHref: null, heroUrl: null, instagram: null, bio: null }, coverUrl: null, media: { gallery: [], video: null }, links: { href: null, label: null, instagram: null, website: null }, sponsor: null, tags: [], sortOrder: 1 },
  ],
};

test("subEvents: one Event per item; performer, dates, image and place only when known", () => {
  const out = programSubEvents(ready);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    "@type": "Event", name: "Opening", startDate: "2026-11-22T02:00:00.000Z", endDate: "2026-11-22T03:00:00.000Z",
    description: "Warm-up.", image: "https://cdn.example/a.jpg", performer: { "@type": "Person", name: "DJ Ana" }, location: { "@type": "Place", name: "Main stage" },
  });
  assert.deepEqual(out[1], { "@type": "Event", name: "Secret" }, "TBA performer and time add nothing");
  assert.deepEqual(programSubEvents({ enabled: false }), []);
});

test("an Event page document gets its subEvent replaced; the operator's fields survive", () => {
  const base = { "@context": "https://schema.org", "@type": "Event", name: "LUMINA", subEvent: [{ "@type": "Event", name: "stale" }], url: "https://x/y" };
  const { merged, extra } = withEventProgramJsonLd(base, ready, { title: "ignored" });
  assert.equal(extra, null);
  assert.equal((merged as Record<string, unknown>).name, "LUMINA");
  assert.equal((merged as Record<string, unknown>).url, "https://x/y");
  assert.equal(((merged as Record<string, unknown>).subEvent as unknown[]).length, 2);
});

test("a non-Event (or missing) page document is left alone and a minimal Event is added", () => {
  const org = { "@context": "https://schema.org", "@type": "Organization", name: "Casa" };
  const a = withEventProgramJsonLd(org, ready, { title: "LUMINA", url: "https://casa/events/lumina" });
  assert.deepEqual(a.merged, org);
  assert.equal((a.extra as Record<string, unknown>)["@type"], "Event");
  assert.equal((a.extra as Record<string, unknown>).name, "LUMINA");
  assert.equal((a.extra as Record<string, unknown>).url, "https://casa/events/lumina");
  const b = withEventProgramJsonLd(null, ready, { title: "LUMINA" });
  assert.equal(b.merged, null);
  assert.equal((b.extra as Record<string, unknown>).url, undefined);
});

test("nothing is emitted for an off or empty program", () => {
  assert.deepEqual(withEventProgramJsonLd(null, { enabled: false }, { title: "x" }), { merged: null, extra: null });
  assert.deepEqual(withEventProgramJsonLd(null, { ...ready, items: [] }, { title: "x" }), { merged: null, extra: null });
});
