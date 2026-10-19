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
