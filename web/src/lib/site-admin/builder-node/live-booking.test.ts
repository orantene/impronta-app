import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildComponentsForType } from "../builder-core/site-templates/business-components";
import { collectNativeDataBlockNeeds } from "./native-data-block-needs";
import {
  LIVE_BOOKING_LABEL,
  LIVE_SERVICES_LABEL,
  mergeServiceCards,
} from "./live-booking-markers";
import { formatServicePrice, serviceMetaLine } from "./live-booking-bands";
import type { BuilderNode } from "./types";

const ctx = {
  locale: "es",
  family: "beauty",
  identity: { businessName: "Studio", pageHrefs: {} },
  services: ["Lash lift"],
} as never;

function labels(nodes: BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (n: BuilderNode) => {
    const label = (n.props as { layerLabel?: string }).layerLabel;
    if (label) out.push(label);
    if ("children" in n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

test("composer marks the services band and the booking band for live data", () => {
  const slots = buildComponentsForType("nail-salon", ctx);
  const all = [...slots.values()].flat();
  const found = labels(all);
  assert.ok(found.includes(LIVE_SERVICES_LABEL), "services band is marked");
  assert.ok(found.includes(LIVE_BOOKING_LABEL), "booking band is marked");
});

test("a marked band is a native data need so the loader runs", () => {
  const slots = buildComponentsForType("nail-salon", ctx);
  const needs = collectNativeDataBlockNeeds([...slots.values()].flat());
  assert.equal(needs.liveBooking, true);
  assert.equal(collectNativeDataBlockNeeds([]).liveBooking, false);
});

test("mergeServiceCards lists published services, drops products, flags bookable", () => {
  const cards = mergeServiceCards(
    [
      { id: "a", title: "Lash lift", description: null, amountCents: 70000, currency: "MXN", durationMinutes: 120, kind: "service" },
      { id: "b", title: "Mug", description: null, amountCents: 900, currency: "MXN", durationMinutes: null, kind: "product" },
      { id: "c", title: "Consult", description: "x", amountCents: null, currency: "", durationMinutes: null, kind: "service" },
    ],
    new Set(["a"]),
  );
  assert.deepEqual(cards.map((c) => [c.id, c.bookable, c.currency]), [["a", true, "MXN"], ["c", false, "USD"]]);
});

test("price and meta line are locale-aware", () => {
  assert.match(formatServicePrice(70000, "MXN", "es") ?? "", /700/);
  assert.equal(formatServicePrice(null, "MXN", "en"), null);
  const meta = serviceMetaLine(
    { id: "a", title: "t", description: null, amountCents: 70000, currency: "MXN", durationMinutes: 120, bookable: true },
    "en",
  );
  assert.match(meta, /120 min/);
});

test("LiveBookingBand accepts locale (TUL-452 Spanish studio page)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/live-booking-bands.tsx"), "utf8");
  assert.match(src, /locale\?: string/);
  assert.match(src, /locale=\{locale\}/);
});
