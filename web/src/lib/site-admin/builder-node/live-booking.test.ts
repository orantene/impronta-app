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
import { renderToStaticMarkup } from "react-dom/server";
import { LiveServicesBand, formatServicePrice, serviceBookHref, serviceMetaLine } from "./live-booking-bands";
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
    { id: "a", title: "t", description: null, amountCents: 70000, currency: "MXN", durationMinutes: 120, onRequest: false, bookable: true },
    "en",
  );
  assert.match(meta, /120 min/);
});

test("LiveBookingBand accepts locale (TUL-452 Spanish studio page)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/live-booking-bands.tsx"), "utf8");
  assert.match(src, /locale\?: string/);
  assert.match(src, /locale=\{locale\}/);
});

test("TUL-1812: each service card links to /book pinned to its own service", () => {
  assert.equal(serviceBookHref("/book", "abc"), "/book?service=abc");
  assert.equal(serviceBookHref("/es/book?x=1", "a b"), "/es/book?x=1&service=a%20b");
  assert.equal(serviceBookHref("/book#top", "abc"), "/book?service=abc#top");
});

const base = { description: null, currency: "MXN", durationMinutes: 90, kind: "service" };

test("D-10a: an on_request offering carries no amount and is flagged", () => {
  const cards = mergeServiceCards(
    [
      { ...base, id: "p", title: "Public", amountCents: 120000, visibility: "public" },
      { ...base, id: "r", title: "Retrato", amountCents: 120000, visibility: "on_request" },
    ],
    new Set(["p", "r"]),
  );
  assert.equal(cards[0].amountCents, 120000);
  assert.equal(cards[0].onRequest, false);
  assert.equal(cards[1].amountCents, null);
  assert.equal(cards[1].onRequest, true);
});

test("D-10a: agency_only offerings never reach the public services band", () => {
  const cards = mergeServiceCards(
    [{ ...base, id: "a", title: "Privado", amountCents: 5000, visibility: "agency_only" }],
    new Set(["a"]),
  );
  assert.deepEqual(cards, []);
});

test("D-10a: the services band prints no amount for on_request, only a request path", () => {
  const services = mergeServiceCards(
    [
      { ...base, id: "p", title: "Corte", amountCents: 50000, visibility: "public" },
      { ...base, id: "r", title: "Retrato de estudio", amountCents: 120000, visibility: "on_request" },
    ],
    new Set(["p", "r"]),
  );
  for (const locale of ["es", "en"]) {
    const html = renderToStaticMarkup(
      LiveServicesBand({
        nodeId: "n",
        surface: { tenantSlug: "t", agencyName: "A", services, offerings: [], signedIn: false, captcha: null },
        locale,
        bookHref: "/book",
      }),
    );
    const [, request = ""] = html.split("Retrato de estudio");
    assert.doesNotMatch(request, /1,?200|\$/);
    assert.match(request, locale === "es" ? /Bajo consulta/ : /On request/);
    assert.match(request, locale === "es" ? /Consultar/ : /Ask/);
    assert.match(html, /500/); // the public one still shows its price
  }
});
