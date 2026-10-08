/**
 * TUL-232: the idle bar button's markup does not change when no slot is known (SSR / no effects
 * run, so no slot has loaded); the slot only adds an attribute after the client fetch.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { CatalogIdleBarGo } from "./services-catalog-idle-bar";

const item = {
  id: "0b9f0c3e-5d2a-4f6e-8a1b-3c4d5e6f7a8b",
  kind: "service",
  bookingMode: "instant",
  priceType: "fixed",
  priceDisplay: "show",
  amountCents: 5000,
  durationMinutes: 60,
  visibility: "public",
  variants: [],
  addOns: [],
} as unknown as TalentOffering;

const buildDetail = (o: TalentOffering) => ({ offeringId: o.id }) as unknown as OfferingRequestDetail;

test("no slot loaded: same markup as the bar without slot wiring", () => {
  const before = renderToStaticMarkup(<CatalogIdleBarGo nodeId="n1" es takesBookings />);
  const after = renderToStaticMarkup(
    <CatalogIdleBarGo nodeId="n1" es groups={[{ items: [item] }]} buildDetail={buildDetail} />,
  );
  assert.equal(after, before);
  assert.match(after, /Reservar cita/);
  assert.doesNotMatch(after, /data-next-slot/);
});

test("no bookable offering: still the old label", () => {
  const html = renderToStaticMarkup(
    <CatalogIdleBarGo
      nodeId="n1"
      es={false}
      groups={[{ items: [{ ...item, bookingMode: "inquiry" } as TalentOffering] }]}
      buildDetail={buildDetail}
    />,
  );
  assert.match(html, /See services/);
});
