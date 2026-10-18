/**
 * TUL-690 guard: the booking sheet's live picker and the next-free-time chip both load slots through
 * fetchLiveSlots. On a hub `/w/<slug>` storefront the request must carry `workspace=<slug>`, or the
 * proxy resolves the hub workspace and the picker shows no times and no price (QA, hub.staging
 * /w/qa-journeys/book). The existing tests pin the helper and the SlotPicker; this pins this path.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { fetchLiveSlots } from "./catalog-booking-live-slots";

type G = { window?: unknown; fetch?: unknown };

/** Runs `fn` as if the visitor were on `pathname`, capturing the URL fetchLiveSlots requests. */
async function urlRequestedOn(pathname: string): Promise<URL> {
  const g = globalThis as unknown as G;
  const priorWindow = g.window;
  const priorFetch = g.fetch;
  let requested = "";
  g.window = { location: { pathname } };
  g.fetch = async (input: unknown) => {
    requested = String(input);
    return { ok: true, json: async () => ({ slots: [] }) };
  };
  try {
    await fetchLiveSlots("offering-1", 60);
  } finally {
    g.window = priorWindow;
    g.fetch = priorFetch;
  }
  return new URL(requested, "https://example.test");
}

test("on a hub /w/<slug> storefront the live picker asks for that workspace's slots", async () => {
  const url = await urlRequestedOn("/w/qa-journeys/book");
  assert.equal(url.pathname, "/api/public/booking/slots");
  assert.equal(url.searchParams.get("workspace"), "qa-journeys");
  assert.equal(url.searchParams.get("offering"), "offering-1");
  assert.equal(url.searchParams.get("duration"), "60");
});

test("the Spanish /es/w/<slug> storefront carries the workspace too", async () => {
  const url = await urlRequestedOn("/es/w/qa-journeys/book");
  assert.equal(url.searchParams.get("workspace"), "qa-journeys");
});

test("a talent profile or any other page stays bare: no workspace param", async () => {
  for (const path of ["/t/TAL-93030", "/es/t/TAL-93030", "/book", "/"]) {
    const url = await urlRequestedOn(path);
    assert.equal(url.searchParams.has("workspace"), false, `${path} must not send a workspace`);
  }
});

test("fetchLiveSlots builds its URL through publicSlotsUrl (not a hand-written path)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/public-booking/catalog-booking-live-slots.ts"), "utf8");
  assert.match(src, /fetch\(\s*publicSlotsUrl\(/);
  assert.doesNotMatch(src, /fetch\(\s*[`"']\/api\/public\/booking\/slots/);
});
