import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_COPY,
  channelCopy,
  channelKey,
  earningsByChannel,
  listingsBelowMinimum,
  planLeaveWorkspace,
  summariseHolds,
  whereItsSold,
  youGetCents,
  type ChannelHold,
  type SoldListing,
} from "./service-hub-channels";

const WS = { kind: "workspace", tenantId: "t-1", name: "Blue Oar" } as const;
const WS2 = { kind: "workspace", tenantId: "t-2", name: "Studio Sol" } as const;

test("you get: price minus the workspace's cut; Tulala's fee is on top of the client, never from you", () => {
  assert.equal(youGetCents(10000, { model: "percent", percentBps: 2000 }), 8000);
  assert.equal(youGetCents(10000, { model: "fixed", fixedCents: 1500 }), 8500);
  assert.equal(youGetCents(10000, { model: "none" }), 10000);
  // never below zero
  assert.equal(youGetCents(1000, { model: "fixed", fixedCents: 5000 }), 0);
  // rounds the cut to a whole cent, the talent never gets a fraction
  assert.equal(youGetCents(999, { model: "percent", percentBps: 3333 }), 666);
});

test("you get: refuses what it cannot compute (null), never a guessed number", () => {
  assert.equal(youGetCents(-1, { model: "none" }), null);
  assert.equal(youGetCents(Number.NaN, { model: "none" }), null);
  assert.equal(youGetCents(1000.5, { model: "none" }), null);
  assert.equal(youGetCents(1000, { model: "percent", percentBps: 10001 }), null);
  assert.equal(youGetCents(1000, { model: "percent", percentBps: -1 }), null);
  assert.equal(youGetCents(1000, { model: "fixed", fixedCents: -5 }), null);
});

test("you get: per-hour, rent and other custom shapes are unknown (null), not guessed", () => {
  assert.equal(youGetCents(10000, { model: "custom" }), null);
});

test("channel key is stable per channel", () => {
  assert.equal(channelKey({ kind: "my_site" }), "my_site");
  assert.equal(channelKey({ kind: "hub" }), "hub");
  assert.equal(channelKey(WS), "ws:t-1");
});

test("where it's sold: My site, hub, then each workspace by name, with 'you get' and the minimum", () => {
  const listings: SoldListing[] = [
    { channel: WS2, listPriceCents: 9000, terms: { model: "percent", percentBps: 1000 }, minAcceptCents: null },
    { channel: WS, listPriceCents: 10000, terms: { model: "percent", percentBps: 2000 }, minAcceptCents: 9000 },
    { channel: { kind: "hub" }, listPriceCents: 10000, terms: { model: "none" }, minAcceptCents: null },
    { channel: { kind: "my_site" }, listPriceCents: 10000, terms: { model: "none" }, minAcceptCents: null },
  ];
  const rows = whereItsSold(listings);
  assert.deepEqual(rows.map((r) => channelKey(r.channel)), ["my_site", "hub", "ws:t-1", "ws:t-2"]);
  assert.equal(rows[2].youGetCents, 8000);
  assert.equal(rows[2].minAcceptCents, 9000);
  assert.equal(rows[3].youGetCents, 8100);
});

test("a price raise alerts workspaces whose listing falls below the talent's minimum", () => {
  const listings: SoldListing[] = [
    { channel: WS, listPriceCents: 8000, terms: { model: "none" }, minAcceptCents: 9000 },
    { channel: WS2, listPriceCents: 8000, terms: { model: "none" }, minAcceptCents: 7000 },
    { channel: { kind: "hub" }, listPriceCents: 5000, terms: { model: "none" }, minAcceptCents: null },
  ];
  // only workspaces can be alerted; no minimum set = never below
  assert.deepEqual(listingsBelowMinimum(listings).map((l) => channelKey(l.channel)), ["ws:t-1"]);
  assert.deepEqual(listingsBelowMinimum([]), []);
});

test("earnings by channel: my site, hub and each workspace, with each share", () => {
  const rows = [
    { source: "personal_page", grossCents: 10000, netCents: 10000, tenantId: undefined, agencyName: "" },
    { source: "hub", grossCents: 5000, netCents: 5000, tenantId: undefined, agencyName: "" },
    { source: "agency_routed", grossCents: 10000, netCents: 8000, tenantId: "t-1", agencyName: "Blue Oar" },
    { source: "agency_routed", grossCents: 10000, netCents: 8000, tenantId: "t-1", agencyName: "Blue Oar" },
    { source: "agency_routed", grossCents: 4000, netCents: 3600, tenantId: "t-2", agencyName: "Studio Sol" },
    { source: "unknown", grossCents: 1000, netCents: 1000, tenantId: undefined, agencyName: "" },
  ] as const;
  const out = earningsByChannel(rows);
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.deepEqual(out.map((c) => c.key), ["my_site", "hub", "ws:t-1", "ws:t-2", "other"]);
  assert.equal(by["ws:t-1"].netCents, 16000);
  assert.equal(by["ws:t-1"].grossCents, 20000);
  assert.equal(by["ws:t-1"].count, 2);
  // the share the talent keeps, in basis points of gross
  assert.equal(by["ws:t-1"].youKeepBps, 8000);
  assert.equal(by["ws:t-2"].youKeepBps, 9000);
  assert.equal(by["my_site"].youKeepBps, 10000);
  assert.equal(by["ws:t-1"].name, "Blue Oar");
});

test("earnings by channel: no rows, no channels; zero gross never divides by zero", () => {
  assert.deepEqual(earningsByChannel([]), []);
  const out = earningsByChannel([{ source: "hub", grossCents: 0, netCents: 0, tenantId: undefined, agencyName: "" }]);
  assert.equal(out[0].youKeepBps, null);
});

const hold = (over: Partial<ChannelHold>): ChannelHold => ({
  id: "h",
  channel: { kind: "my_site" },
  startsAt: "2026-11-10T15:00:00Z",
  endsAt: "2026-11-10T17:00:00Z",
  status: "confirmed",
  ...over,
});

test("one calendar: a hold from any channel blocks the time everywhere; a workspace request waits for approval", () => {
  const s = summariseHolds([
    hold({ id: "a", channel: { kind: "my_site" } }),
    hold({ id: "b", channel: { kind: "hub" }, startsAt: "2026-11-11T15:00:00Z", endsAt: "2026-11-11T16:00:00Z" }),
    hold({ id: "c", channel: WS, status: "requested", startsAt: "2026-11-12T15:00:00Z", endsAt: "2026-11-12T16:00:00Z" }),
    hold({ id: "d", channel: WS, status: "confirmed", startsAt: "2026-11-13T15:00:00Z", endsAt: "2026-11-13T16:00:00Z" }),
    hold({ id: "e", channel: WS2, status: "declined", startsAt: "2026-11-14T15:00:00Z", endsAt: "2026-11-14T16:00:00Z" }),
  ]);
  assert.deepEqual(s.blocking.map((h) => h.id), ["a", "b", "d"]);
  assert.deepEqual(s.needsApproval.map((h) => h.id), ["c"]);
  // a declined request blocks nothing
  assert.ok(![...s.blocking, ...s.needsApproval].some((h) => h.id === "e"));
});

test("one calendar: a request from a workspace never blocks until approved, even if it overlaps", () => {
  const s = summariseHolds([hold({ id: "own" }), hold({ id: "req", channel: WS, status: "requested" })]);
  assert.deepEqual(s.blocking.map((h) => h.id), ["own"]);
  assert.deepEqual(s.needsApproval.map((h) => h.id), ["req"]);
  assert.deepEqual(s.conflicts.map((c) => [c.a, c.b]), [["own", "req"]]);
});

test("one calendar: bad windows are dropped, not blocking", () => {
  const s = summariseHolds([hold({ id: "x", startsAt: "nope" }), hold({ id: "y", startsAt: "2026-11-10T17:00:00Z", endsAt: "2026-11-10T15:00:00Z" })]);
  assert.deepEqual(s.blocking, []);
});

test("leaving a workspace keeps its open jobs", () => {
  const plan = planLeaveWorkspace({ tenantId: "t-1", openJobs: [{ id: "j1", status: "confirmed" }, { id: "j2", status: "completed" }, { id: "j3", status: "pending" }] });
  assert.equal(plan.allowed, true);
  assert.deepEqual(plan.keepOpenJobIds, ["j1", "j3"]);
  assert.deepEqual(planLeaveWorkspace({ tenantId: "", openJobs: [] }), { allowed: false, keepOpenJobIds: [] });
});

test("copy: ES and EN carry the same keys; no em dashes; the card's titles", () => {
  assert.deepEqual(Object.keys(CHANNEL_COPY.en).sort(), Object.keys(CHANNEL_COPY.es).sort());
  for (const l of ["en", "es"] as const) for (const v of Object.values(CHANNEL_COPY[l])) assert.ok(v.length > 0 && !v.includes("—"));
  assert.equal(channelCopy("es").whereSold, "Dónde se vende");
  assert.equal(channelCopy("en").whereSold, "Where it's sold");
  assert.equal(channelCopy("es").whereAppear, "Dónde apareces");
  assert.equal(channelCopy("es-MX").mySite, "Mi sitio");
});
