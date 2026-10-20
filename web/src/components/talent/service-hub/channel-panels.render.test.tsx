import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { whereItsSold } from "@/lib/talent/service-hub-channels";
import { soldListingsFromRows } from "@/lib/talent/service-hub-channels-rows";
import { CalendarByChannelPanel, EarningsByChannelCard, WhereItsSoldPanel, WhereYouAppearPanel } from "./ChannelPanels";

const names = new Map([["t-1", "Blue Oar"]]);
const rows = whereItsSold(
  soldListingsFromRows({
    talentPriceCents: 10000,
    currency: "USD",
    tenantNames: names,
    listings: [{ id: "00000000-0000-4000-8000-000000000001", tenant_id: "t-1", offering_id: "o", status: "accepted", price_mode: "talent_price", currency: "USD", talent_lowest_cents: 11000 }],
    terms: [{ tenant_id: "t-1", version: 1, status: "accepted", work_model: "coordinator_agency", share_kind: "percent", share_bps: 2000 }],
  }),
);
const data = { service: { id: "o", title: "Sunrise paddle", priceCents: 10000, currency: "USD" }, rows };

describe("channel panels", () => {
  it("Where it's sold: each channel, what she gets, the minimum field and the below-minimum notice (EN)", () => {
    const html = renderToStaticMarkup(<WhereItsSoldPanel data={data} locale="en" />);
    assert.match(html, /Where it&#x27;s sold · Sunrise paddle/);
    assert.match(html, /My site/);
    assert.match(html, /Tulala hub/);
    assert.match(html, /Blue Oar/);
    assert.match(html, /You get \$80\.00/);
    assert.match(html, /Listed below your lowest price/);
    assert.match(html, /data-testid="lowest-00000000-0000-4000-8000-000000000001"/);
    // only workspaces get a minimum field
    assert.equal((html.match(/data-testid="lowest-/g) ?? []).length, 1);
  });

  it("an (i) note says Tulala's fee is added on top for the client, in both languages", () => {
    const en = renderToStaticMarkup(<WhereItsSoldPanel data={data} locale="en" />);
    assert.match(en, /title="Tulala&#x27;s fee is added on top for the client\."/);
    assert.match(en, /data-testid="fee-note"/);
    const es = renderToStaticMarkup(<WhereItsSoldPanel data={data} locale="es" />);
    assert.match(es, /La comisión de Tulala se suma encima para el cliente\./);
  });

  it("Spanish heading and labels", () => {
    const html = renderToStaticMarkup(<WhereItsSoldPanel data={data} locale="es" />);
    assert.match(html, /Dónde se vende/);
    assert.match(html, /Mi sitio/);
    assert.match(html, /Recibes/);
  });

  it("an unknown 'you get' shows a dash, never a number", () => {
    const unknown = whereItsSold(soldListingsFromRows({ talentPriceCents: 10000, currency: "USD", tenantNames: names, listings: [{ id: "00000000-0000-4000-8000-000000000002", tenant_id: "t-1", offering_id: "o", status: "accepted", price_mode: "talent_price", currency: "USD" }], terms: [] }));
    const html = renderToStaticMarkup(<WhereItsSoldPanel data={{ ...data, rows: unknown }} locale="en" />);
    assert.match(html, /Blue Oar[\s\S]*You get –/);
  });

  it("Where you appear: workspace, model, share, and that jobs stay", () => {
    const html = renderToStaticMarkup(
      <WhereYouAppearPanel
        locale="es"
        items={[{ tenantId: "t-1", name: "Blue Oar", workModel: "coordinator_agency", state: "pending", shareKind: "percent", shareBps: 2000, shareAmountCents: null, shareCurrency: null }]}
      />,
    );
    assert.match(html, /Dónde apareces/);
    assert.match(html, /Agencia coordinadora/);
    assert.match(html, /20% para el espacio de trabajo/);
    assert.match(html, /Esperando tu respuesta/);
    assert.match(html, /Los trabajos ya reservados se mantienen/);
    assert.equal(renderToStaticMarkup(<WhereYouAppearPanel locale="en" items={[]} />), "");
  });

  it("Earnings by channel: net per channel and the share she keeps", () => {
    const html = renderToStaticMarkup(
      <EarningsByChannelCard
        currency="USD"
        locale="en"
        items={[
          { key: "my_site", kind: "my_site", name: null, grossCents: 10000, netCents: 10000, count: 1, youKeepBps: 10000 },
          { key: "ws:t-1", kind: "workspace", name: "Blue Oar", grossCents: 20000, netCents: 16000, count: 2, youKeepBps: 8000 },
        ]}
      />,
    );
    assert.match(html, /Earnings by channel/);
    assert.match(html, /\$160\.00 · You keep 80%/);
    assert.match(html, /My site/);
  });
});

describe("calendar by channel", () => {
  const rows = [
    { id: "1", kind: "booking" as const, title: "Paddle", startsAt: "2026-11-10T15:00:00Z", endsAt: "2026-11-10T17:00:00Z", channelKey: "ws:t-1", channelName: "Blue Oar", holdStrength: null },
    { id: "2", kind: "hold" as const, title: "Sunrise", startsAt: "2026-11-11T15:00:00Z", endsAt: "2026-11-11T17:00:00Z", channelKey: "my_site_hub", channelName: null, holdStrength: "firm" as const },
  ];
  it("labels each entry with its channel; my site / hub for own and hub", () => {
    const html = renderToStaticMarkup(<CalendarByChannelPanel result={{ ok: true, rows }} locale="en" timeZone="UTC" />);
    assert.match(html, /Calendar by channel/);
    assert.match(html, /Blue Oar/);
    assert.match(html, /My site \/ hub/);
    assert.match(html, /Hold · firm/);
    assert.match(html, />Booking</);
  });
  it("Spanish, empty and failed states are different", () => {
    assert.match(renderToStaticMarkup(<CalendarByChannelPanel result={{ ok: true, rows }} locale="es" />), /Calendario por canal[\s\S]*Mi sitio \/ hub/);
    assert.match(renderToStaticMarkup(<CalendarByChannelPanel result={{ ok: true, rows: [] }} locale="en" />), /Nothing coming up\./);
    assert.match(renderToStaticMarkup(<CalendarByChannelPanel result={{ ok: false }} locale="en" />), /role="alert"[^>]*>Could not load your calendar/);
  });
});
