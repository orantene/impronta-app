import assert from "node:assert/strict";
import test from "node:test";

import { calendarByChannel, type CalendarEntry } from "./service-hub-calendar";

const NOW = new Date("2026-11-01T00:00:00Z");
const base = { ownTenantIds: new Set(["own"]), hubTenantIds: new Set(["hub"]), tenantNames: new Map([["ws-1", "Blue Oar"], ["ws-2", "Studio Sol"]]), now: NOW };
const e = (over: Partial<CalendarEntry>): CalendarEntry => ({
  id: "a",
  kind: "booking",
  title: "Paddle",
  startsAt: "2026-11-10T15:00:00Z",
  endsAt: "2026-11-10T17:00:00Z",
  tenantId: "ws-1",
  status: "confirmed",
  holdStrength: null,
  expiresAt: null,
  ...over,
});

test("each entry is labelled by its placing workspace; own and hub tenants read 'My site / hub'", () => {
  const out = calendarByChannel({
    ...base,
    entries: [
      e({ id: "1", tenantId: "ws-1", startsAt: "2026-11-12T10:00:00Z", endsAt: "2026-11-12T11:00:00Z" }),
      e({ id: "2", tenantId: "own", startsAt: "2026-11-11T10:00:00Z", endsAt: "2026-11-11T11:00:00Z" }),
      e({ id: "3", tenantId: "hub", startsAt: "2026-11-13T10:00:00Z", endsAt: "2026-11-13T11:00:00Z" }),
    ],
  });
  assert.deepEqual(out.map((r) => [r.id, r.channelKey, r.channelType, r.channelName]), [
    ["2", "my_site_hub", "mine", null],
    ["1", "ws:1", "workspace", "Blue Oar"],
    ["3", "my_site_hub", "mine", null],
  ]);
});

test("a workspace with no readable name is 'another workspace': name null, never the raw id, never 'mine'", () => {
  const out = calendarByChannel({ ...base, entries: [e({ tenantId: "ws-9" })] });
  assert.equal(out[0].channelType, "workspace");
  assert.equal(out[0].channelName, null);
  assert.equal(Object.values(out[0]).filter((v) => v === "ws-9").length, 0);
  assert.equal(JSON.stringify(out[0]).includes("ws-9"), false);
});

test("another workspace's booking title (it can carry the client's name) is never exposed; own and hub titles are", () => {
  const out = calendarByChannel({
    ...base,
    entries: [
      e({ id: "x", tenantId: "ws-1", title: "Boda de Maria Lopez" }),
      e({ id: "y", tenantId: "own", title: "My own session", startsAt: "2026-11-11T10:00:00Z", endsAt: "2026-11-11T11:00:00Z" }),
    ],
  });
  assert.equal(out.find((r) => r.id === "x")!.title, null);
  assert.ok(!JSON.stringify(out.find((r) => r.id === "x")).includes("Maria"));
  assert.equal(out.find((r) => r.id === "y")!.title, "My own session");
});

test("sorted by start; past, cancelled and expired entries are dropped; bad windows dropped", () => {
  const out = calendarByChannel({
    ...base,
    entries: [
      e({ id: "late", startsAt: "2026-12-01T10:00:00Z", endsAt: "2026-12-01T11:00:00Z" }),
      e({ id: "soon", startsAt: "2026-11-02T10:00:00Z", endsAt: "2026-11-02T11:00:00Z" }),
      e({ id: "past", startsAt: "2026-10-01T10:00:00Z", endsAt: "2026-10-01T11:00:00Z" }),
      e({ id: "cancelled", status: "cancelled" }),
      e({ id: "expired", kind: "hold", holdStrength: "soft", expiresAt: "2026-10-31T00:00:00Z", status: "held" }),
      e({ id: "bad", startsAt: "nope" }),
      e({ id: "backwards", startsAt: "2026-11-05T12:00:00Z", endsAt: "2026-11-05T10:00:00Z" }),
    ],
  });
  assert.deepEqual(out.map((r) => r.id), ["soon", "late"]);
});

test("a hold that has not expired stays, and its strength is carried", () => {
  const out = calendarByChannel({ ...base, entries: [e({ id: "h", kind: "hold", holdStrength: "firm", expiresAt: "2026-11-20T00:00:00Z", status: "held" })] });
  assert.equal(out[0].kind, "hold");
  assert.equal(out[0].holdStrength, "firm");
});

test("an entry already under way (started, not ended) still shows", () => {
  const out = calendarByChannel({ ...base, entries: [e({ id: "now", startsAt: "2026-10-31T23:00:00Z", endsAt: "2026-11-01T02:00:00Z" })] });
  assert.deepEqual(out.map((r) => r.id), ["now"]);
});

test("no entries, no rows", () => {
  assert.deepEqual(calendarByChannel({ ...base, entries: [] }), []);
});

test("no tenant id appears anywhere in any row; the same workspace shares one opaque key per response", () => {
  const out = calendarByChannel({
    ...base,
    entries: [
      e({ id: "1", tenantId: "ws-1", startsAt: "2026-11-10T10:00:00Z", endsAt: "2026-11-10T11:00:00Z" }),
      e({ id: "2", tenantId: "ws-2", startsAt: "2026-11-11T10:00:00Z", endsAt: "2026-11-11T11:00:00Z" }),
      e({ id: "3", tenantId: "ws-1", startsAt: "2026-11-12T10:00:00Z", endsAt: "2026-11-12T11:00:00Z" }),
      e({ id: "4", tenantId: "own", startsAt: "2026-11-13T10:00:00Z", endsAt: "2026-11-13T11:00:00Z" }),
    ],
  });
  const json = JSON.stringify(out);
  for (const id of ["ws-1", "ws-2", "own", "hub"]) assert.ok(!json.includes(`"${id}"`) && !json.includes(`:${id}`), id);
  assert.deepEqual(out.map((r) => r.channelKey), ["ws:1", "ws:2", "ws:1", "my_site_hub"]);
});
