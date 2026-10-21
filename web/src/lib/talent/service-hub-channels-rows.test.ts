import assert from "node:assert/strict";
import test from "node:test";

import { appearingIn, shareLine, soldListingsFromRows } from "./service-hub-channels-rows";
import { channelKey, whereItsSold } from "./service-hub-channels";

const names = new Map([["t-1", "Blue Oar"], ["t-2", "Studio Sol"], ["t-3", "Rent Hall"]]);

const terms = (over: Record<string, unknown>) => ({
  tenant_id: "t-1",
  version: 1,
  work_model: "coordinator_agency",
  share_kind: "percent",
  share_bps: 2000,
  share_amount_cents: null,
  share_currency: null,
  status: "accepted",
  ...over,
});
const listing = (over: Record<string, unknown>) => ({
  id: "l1",
  tenant_id: "t-1",
  offering_id: "o",
  status: "accepted",
  price_mode: "talent_price",
  margin_bps: null,
  price_cents: null,
  currency: "USD",
  talent_lowest_cents: null,
  ...over,
});
const base = { talentPriceCents: 10000, currency: "USD", tenantNames: names };

test("always lists My site and the hub at the talent's own price", () => {
  const rows = whereItsSold(soldListingsFromRows({ ...base, listings: [], terms: [] }));
  assert.deepEqual(rows.map((r) => channelKey(r.channel)), ["my_site", "hub"]);
  assert.deepEqual(rows.map((r) => r.youGetCents), [10000, 10000]);
});

test("percent terms: the workspace lists at her price and takes its percent", () => {
  const rows = whereItsSold(soldListingsFromRows({ ...base, listings: [listing({ talent_lowest_cents: 9000 })], terms: [terms({})] }));
  const ws = rows.find((r) => channelKey(r.channel) === "ws:t-1")!;
  assert.equal(ws.listPriceCents, 10000);
  assert.equal(ws.youGetCents, 8000);
  assert.equal(ws.minAcceptCents, 9000);
  assert.equal(ws.channel.kind === "workspace" && ws.channel.name, "Blue Oar");
});

test("margin: the workspace adds on top, the talent still gets her own price", () => {
  const rows = whereItsSold(
    soldListingsFromRows({
      ...base,
      listings: [listing({ price_mode: "margin", margin_bps: 2500 })],
      terms: [terms({ share_kind: "margin", share_bps: 2500 })],
    }),
  );
  const ws = rows.find((r) => channelKey(r.channel) === "ws:t-1")!;
  assert.equal(ws.listPriceCents, 12500);
  assert.equal(ws.youGetCents, 10000);
});

test("fixed price listing with fixed share, in the same currency only", () => {
  const ok = whereItsSold(
    soldListingsFromRows({
      ...base,
      listings: [listing({ price_mode: "fixed", price_cents: 9500 })],
      terms: [terms({ share_kind: "fixed", share_bps: null, share_amount_cents: 1500, share_currency: "USD" })],
    }),
  ).find((r) => channelKey(r.channel) === "ws:t-1")!;
  assert.equal(ok.youGetCents, 8000);
  // a share in another currency is unknown, never converted by guesswork
  const other = whereItsSold(
    soldListingsFromRows({
      ...base,
      listings: [listing({ price_mode: "fixed", price_cents: 9500 })],
      terms: [terms({ share_kind: "fixed", share_bps: null, share_amount_cents: 1500, share_currency: "MXN" })],
    }),
  ).find((r) => channelKey(r.channel) === "ws:t-1")!;
  assert.equal(other.youGetCents, null);
});

test("per-hour, rent and 'no accepted terms' are unknown (null)", () => {
  for (const t of [[terms({ share_kind: "per_hour", share_bps: null, share_amount_cents: 500, share_currency: "USD" })], [terms({ share_kind: "rent", share_bps: null, share_amount_cents: 500, share_currency: "USD" })], [], [terms({ status: "pending" })]]) {
    const ws = whereItsSold(soldListingsFromRows({ ...base, listings: [listing({})], terms: t as never })).find((r) => channelKey(r.channel) === "ws:t-1")!;
    assert.equal(ws.youGetCents, null);
  }
});

test("the latest accepted version of the terms is the one in force", () => {
  const rows = whereItsSold(
    soldListingsFromRows({
      ...base,
      listings: [listing({})],
      terms: [terms({ version: 1, share_bps: 3000 }), terms({ version: 2, share_bps: 1000 }), terms({ version: 3, share_bps: 500, status: "pending" })],
    }),
  );
  assert.equal(rows.find((r) => channelKey(r.channel) === "ws:t-1")!.youGetCents, 9000);
});

test("hidden listings do not show; offered ones show as offered", () => {
  const rows = soldListingsFromRows({
    ...base,
    listings: [listing({ status: "hidden" }), listing({ id: "l2", tenant_id: "t-2", status: "offered" })],
    terms: [terms({}), terms({ tenant_id: "t-2" })],
  });
  assert.ok(!rows.some((r) => channelKey(r.channel) === "ws:t-1"));
  assert.equal(rows.find((r) => channelKey(r.channel) === "ws:t-2")!.status, "offered");
});

test("a malformed row is dropped, not guessed", () => {
  const rows = soldListingsFromRows({ ...base, listings: [{ nonsense: true }, listing({ price_mode: "fixed", price_cents: null })] as never, terms: [] });
  assert.deepEqual(rows.map((r) => channelKey(r.channel)), ["my_site", "hub"]);
});

test("where you appear: each workspace once, latest accepted terms, pending shown apart", () => {
  const out = appearingIn({
    tenantNames: names,
    terms: [
      terms({ version: 1, share_bps: 3000 }),
      terms({ version: 2, share_bps: 2000 }),
      terms({ tenant_id: "t-2", work_model: "open_network", share_kind: "percent", share_bps: 500 }),
      terms({ tenant_id: "t-3", status: "pending", work_model: "rental_studio", share_kind: "rent", share_bps: null, share_amount_cents: 30000, share_currency: "USD" }),
      terms({ tenant_id: "t-4", status: "declined" }),
    ] as never,
  });
  assert.deepEqual(out.map((a) => [a.tenantId, a.state]), [["t-1", "accepted"], ["t-2", "accepted"], ["t-3", "pending"]]);
  assert.equal(out[0].shareBps, 2000);
  assert.equal(out[0].name, "Blue Oar");
});

test("share lines read plainly in EN and ES", () => {
  assert.equal(shareLine({ shareKind: "percent", shareBps: 2000, shareAmountCents: null, shareCurrency: null }, "en"), "20% to the workspace");
  assert.equal(shareLine({ shareKind: "percent", shareBps: 2000, shareAmountCents: null, shareCurrency: null }, "es"), "20% para el espacio de trabajo");
  assert.equal(shareLine({ shareKind: "fixed", shareBps: null, shareAmountCents: 1500, shareCurrency: "USD" }, "en"), "USD 15.00 per sale");
  assert.equal(shareLine({ shareKind: "rent", shareBps: null, shareAmountCents: 30000, shareCurrency: "USD" }, "es"), "Renta USD 300.00");
  assert.equal(shareLine({ shareKind: "margin", shareBps: 2500, shareAmountCents: null, shareCurrency: null }, "en"), "Adds 25% on top");
});

import { isMissingRelation } from "./service-hub-channels-rows";

test("only a missing table reads as 'not ready'; every other error is a failure", () => {
  assert.equal(isMissingRelation({ code: "42P01" }), true);
  assert.equal(isMissingRelation({ code: "PGRST205" }), true);
  assert.equal(isMissingRelation({ code: "57014" }), false);
  assert.equal(isMissingRelation({ code: null }), false);
  assert.equal(isMissingRelation(null), false);
});

import { workModelLabel } from "./service-hub-channels-rows";

test("work models read in both languages; an unknown one is shown as-is", () => {
  assert.equal(workModelLabel("rental_studio", "es"), "Estudio de renta");
  assert.equal(workModelLabel("open_network", "en"), "Open network");
  assert.equal(workModelLabel("brand_new_model", "es"), "brand_new_model");
});
