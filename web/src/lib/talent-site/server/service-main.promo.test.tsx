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
const base = { tenantId: "t1", talentProfileId: "tp1", offeringId: A.id, locale: "en", returnPath: "/servicio-x" };
const openGate = async () => ({ ok: true as const, talentProfileId: "tp1" });

test("serviceDatedSlot: mounts only when the picker has upcoming dates; otherwise null", async () => {
  assert.notEqual(await serviceDatedSlot(base, async () => okPicker as never, openGate), null);
  assert.equal(await serviceDatedSlot(base, async () => ({ ...okPicker, dates: [] }) as never, openGate), null);
  assert.equal(await serviceDatedSlot(base, async () => ({ ok: false, reason: "not_sellable" }), openGate), null);
});

test("serviceDatedSlot fails closed: no tenant, no talent, hidden CTA or a throwing loader is null and never throws", async () => {
  let called = 0;
  const counting = async () => (called++, okPicker as never);
  assert.equal(await serviceDatedSlot({ ...base, tenantId: null }, counting, openGate), null);
  assert.equal(await serviceDatedSlot({ ...base, talentProfileId: null }, counting, openGate), null);
  assert.equal(await serviceDatedSlot({ ...base, publicCtaHidden: true }, counting, openGate), null);
  assert.equal(called, 0, "never even asks");
  assert.equal(await serviceDatedSlot(base, async () => { throw new Error("x"); }, openGate), null);
  assert.equal(await serviceDatedSlot(base, async () => okPicker as never, async () => { throw new Error("x"); }), null);
});

test("the picker is asked for the site's tenant and this offering only", async () => {
  const seen: unknown[] = [];
  await serviceDatedSlot(base, async (i) => (seen.push(i), okPicker as never), openGate);
  assert.deepEqual(seen, [{ tenantId: "t1", offeringId: A.id }]);
});

test("P1-1: a paused talent, a request posture or an unreadable setting mounts no step", async () => {
  for (const reason of ["not_accepting_bookings", "request_only", "inquiry_only", "unreadable"] as const) {
    let pickerAsked = 0;
    const out = await serviceDatedSlot(
      base,
      async () => (pickerAsked++, okPicker as never),
      async () => ({ ok: false as const, reason }),
    );
    assert.equal(out, null, reason);
    assert.equal(pickerAsked, 0, "the picker is not even loaded");
  }
});

test("P1-1: the gate is asked about THIS site's talent", async () => {
  const seen: unknown[] = [];
  await serviceDatedSlot(base, async () => okPicker as never, async (i) => (seen.push(i), { ok: true as const, talentProfileId: "tp1" }));
  assert.deepEqual(seen, [{ tenantId: "t1", offeringId: A.id, expectedTalentProfileId: "tp1" }]);
});

test("P2: the return path keeps the site's path prefix; the talent-site channel is set on the mount", async () => {
  const el = (await serviceDatedSlot({ ...base, publicPathPrefix: "/t/site/jor/" }, async () => okPicker as never, openGate)) as {
    props: { returnPath: string; channel?: string };
  };
  assert.equal(el.props.returnPath, "/t/site/jor/servicio-x");
  assert.equal(el.props.channel, "talent_site");
  const bare = (await serviceDatedSlot(base, async () => okPicker as never, openGate)) as { props: { returnPath: string } };
  assert.equal(bare.props.returnPath, "/servicio-x");
});
