import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { Promo } from "@/lib/promos/types";

import { serviceMainNode, servicePromoPrice, serviceRelatedLinks } from "./service-main";
import type { ServicePageOffering } from "../service-page";

const NOW = "2026-10-14T18:00:00Z";
const promo: Promo = { id: "p", offer_kind: "percent", value: 30, currency: "MXN", scope: "all", audience: "public", unlock: "auto", applies_on: "purchase", tz: "America/Mexico_City" };
const svc = (id: string, cents: number): ServicePageOffering => ({
  id, kind: "service", visibility: "public", title: `Servicio ${id}`, description: null,
  amountCents: cents, currency: "MXN", priceDisplay: "exact", durationMinutes: 60,
} as ServicePageOffering);
const A = svc("aaaaaaaa-0000-4000-8000-000000000001", 50_000);
const B = svc("bbbbbbbb-0000-4000-8000-000000000002", 30_000);

test("no live promo: the service page markup is byte-identical to before", () => {
  const plain = renderToStaticMarkup(<>{serviceMainNode(A, { locale: "es", homePath: "/" })}</>);
  const empty = renderToStaticMarkup(<>{serviceMainNode(A, { locale: "es", homePath: "/", promo: { promos: [], now: NOW } })}</>);
  assert.equal(empty, plain);
  assert.equal(servicePromoPrice(A, { promos: [], now: NOW }), null);
});

test("a live promo: strike price + badge + screen-reader line on the page", () => {
  const html = renderToStaticMarkup(<>{serviceMainNode(A, { locale: "es", homePath: "/", promo: { promos: [promo], now: NOW, locale: "es" } })}</>);
  assert.match(html, /data-promo-price/);
  assert.match(html, /-30%/);
  assert.match(html, /Antes .*500.*, ahora .*350/);
});

test("Otros servicios: the same displayPrice number", () => {
  const links = serviceRelatedLinks([A, B], null, A.id, "es", (p) => p, { promos: [promo], now: NOW, locale: "es" });
  assert.equal(links.length, 1);
  assert.match(links[0]!.facts, /Antes .*300.*ahora .*210.* -30%/);
  const plain = serviceRelatedLinks([A, B], null, A.id, "es", (p) => p);
  assert.doesNotMatch(plain[0]!.facts, /Antes/);
});

// ── TUL-1472: the dated booking step on a talent-site service page ───────────
import { serviceDatedSlot } from "./service-dated-slot";

test("with a booking slot, the dated step replaces the generic book link and the phone bar jumps to it", () => {
  const html = renderToStaticMarkup(<>{serviceMainNode(A, { locale: "en", homePath: "/", bookingSlot: <div data-test-step="">STEP</div> })}</>);
  assert.match(html, /id="dated-places"/);
  assert.match(html, /data-test-step/);
  assert.doesNotMatch(html, /data-talent-service-book/);
  assert.match(html, /data-talent-service-sticky[\s\S]*href="#dated-places"/);
});

test("no slot: byte-identical to before (the generic link stays for non-dated services)", () => {
  const plain = renderToStaticMarkup(<>{serviceMainNode(A, { locale: "en", homePath: "/" })}</>);
  assert.match(plain, /data-talent-service-book/);
  assert.doesNotMatch(plain, /dated-places/);
});

test("a hidden booking button mounts nothing", () => {
  const html = renderToStaticMarkup(<>{serviceMainNode({ ...A, publicCtaHidden: true }, { locale: "en", homePath: "/", bookingSlot: <div>STEP</div> })}</>);
  assert.doesNotMatch(html, /STEP|dated-places/);
});

const okPicker = { ok: true as const, title: "Class", currency: "MXN", defaultAmountCents: 50000, tiers: [], dates: [{ sessionId: "s1", startsAt: "2026-11-01T10:00:00Z", endsAt: "2026-11-01T11:00:00Z", timeZone: null, state: "open", seatsLeft: 5, sellableVariantIds: [], payAtPlaceOffered: false }], privateOnRequest: false };
const base = { tenantId: "t1", offeringId: A.id, locale: "en", returnPath: "/servicio-x" };

test("serviceDatedSlot: mounts only when the picker has upcoming dates; otherwise null", async () => {
  assert.notEqual(await serviceDatedSlot(base, async () => okPicker as never), null);
  assert.equal(await serviceDatedSlot(base, async () => ({ ...okPicker, dates: [] }) as never), null);
  assert.equal(await serviceDatedSlot(base, async () => ({ ok: false, reason: "not_sellable" })), null);
});

test("serviceDatedSlot fails closed: no tenant, hidden CTA or a throwing loader is null and never throws", async () => {
  let called = 0;
  const counting = async () => (called++, okPicker as never);
  assert.equal(await serviceDatedSlot({ ...base, tenantId: null }, counting), null);
  assert.equal(await serviceDatedSlot({ ...base, publicCtaHidden: true }, counting), null);
  assert.equal(called, 0, "never even asks");
  assert.equal(await serviceDatedSlot(base, async () => { throw new Error("x"); }), null);
});

test("the picker is asked for the site's tenant and this offering only", async () => {
  const seen: unknown[] = [];
  await serviceDatedSlot(base, async (i) => (seen.push(i), okPicker as never));
  assert.deepEqual(seen, [{ tenantId: "t1", offeringId: A.id }]);
});
