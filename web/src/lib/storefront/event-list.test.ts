import assert from "node:assert/strict";
import { test } from "node:test";

import { readEventListCore } from "./event-list.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);
const NOW = new Date("2026-09-15T12:00:00Z");

function setup() {
  const { admin } = fakeAdmin({
    events: [
      { id: uuid(10), tenant_id: TENANT, slug: "jazz", title: "Jazz", description: null, venue_id: uuid(5), status: "published" },
      { id: uuid(11), tenant_id: TENANT, slug: "old", title: "Old", description: "gone", venue_id: null, status: "published" },
      { id: uuid(12), tenant_id: TENANT, slug: "draft", title: "Draft", description: null, venue_id: null, status: "draft" },
      { id: uuid(13), tenant_id: TENANT, slug: null, title: "No slug", description: null, venue_id: null, status: "published" },
    ],
    sessions: [
      { id: uuid(20), tenant_id: TENANT, event_id: uuid(10), status: "scheduled", starts_at: "2026-09-20T20:00:00Z", ends_at: "2026-09-20T23:00:00Z" },
      { id: uuid(21), tenant_id: TENANT, event_id: uuid(10), status: "scheduled", starts_at: "2026-09-21T20:00:00Z", ends_at: "2026-09-21T23:00:00Z" },
      { id: uuid(22), tenant_id: TENANT, event_id: uuid(11), status: "scheduled", starts_at: "2026-09-01T20:00:00Z", ends_at: "2026-09-01T23:00:00Z" },
    ],
    venues: [{ id: uuid(5), timezone: "America/Cancun" }],
  });
  return { deps: { admin, now: () => NOW } };
}

test("read: upcoming keeps events with a night to come, shaped as cards with a path", async () => {
  const { deps } = setup();
  const r = await readEventListCore(deps, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.events, [
    { id: uuid(10), slug: "jazz", title: "Jazz", description: null, path: "/events/jazz", nextStartsAtIso: "2026-09-20T20:00:00.000Z", lastStartsAtIso: "2026-09-21T20:00:00.000Z", timezone: "America/Cancun", nightsCount: 2 },
  ]);
});

test("read: all keeps past events too, count caps, invalid tenant refused", async () => {
  const { deps } = setup();
  const all = await readEventListCore(deps, TENANT, { filter: "all", layout: "list" });
  assert.ok(all.ok && all.data.events.length === 2 && all.data.layout === "list");
  assert.equal(all.ok ? all.data.events[0]!.slug : "", "old", "earliest first");
  const one = await readEventListCore(deps, TENANT, { filter: "all", count: 1 });
  assert.ok(one.ok && one.data.events.length === 1);
  assert.deepEqual(await readEventListCore(deps, "x", {}), { ok: false, reason: "invalid_request" });
});
