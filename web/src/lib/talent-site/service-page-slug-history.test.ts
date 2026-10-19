import test from "node:test";
import assert from "node:assert/strict";

import {
  currentServiceSlug,
  resolveServiceBySlug,
  resolveServiceSlugWithHistory,
  serviceSlug,
  type ServicePageOffering,
} from "./service-page";
import { EMPTY_SERVICE_CONTENT, type ServiceContentFields } from "./service-content-fields";

const off = (id: string, title: string, o: Partial<ServicePageOffering> = {}): ServicePageOffering => ({
  id,
  kind: "service",
  title,
  description: null,
  priceDisplay: "exact",
  amountCents: 45000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
  ...o,
});

const A = off("3fa91c2b-1111-4222-8333-444455556666", "Corte de cabello");
const B = off("aaaaaaaa-1111-4222-8333-444455556666", "Barba");
const HIDDEN = off("bbbbbbbb-1111-4222-8333-444455556666", "Privado", { visibility: "agency_only" });

const content = (o: Partial<ServiceContentFields>): ServiceContentFields => ({ ...EMPTY_SERVICE_CONTENT, ...o });

test("current custom slug resolves to its offering", () => {
  const map = new Map([[A.id, content({ slug: "corte-clasico" })]]);
  const r = resolveServiceSlugWithHistory([A, B], "corte-clasico", map);
  assert.equal(r.kind, "current");
  assert.equal(r.kind === "current" && r.offering.id, A.id);
  assert.equal(r.kind === "current" && r.slug, "corte-clasico");
});

test("a slug from slug_history answers a 301 to the current slug", () => {
  const map = new Map([[A.id, content({ slug: "corte-clasico", slugHistory: ["corte-viejo", "corte-2024"] })]]);
  const r = resolveServiceSlugWithHistory([A, B], "/Corte-Viejo/", map);
  assert.deepEqual(r.kind === "redirect" && { id: r.offering.id, to: r.slug, status: r.status }, {
    id: A.id,
    to: "corte-clasico",
    status: 301,
  });
});

test("history without a custom slug redirects to the derived slug", () => {
  const map = new Map([[A.id, content({ slugHistory: ["corte-viejo"] })]]);
  const r = resolveServiceSlugWithHistory([A], "corte-viejo", map);
  assert.equal(r.kind, "redirect");
  assert.equal(r.kind === "redirect" && r.slug, serviceSlug(A));
});

test("a current slug wins over another service's history entry", () => {
  const map = new Map([
    [A.id, content({ slug: "barba", slugHistory: [] })],
    [B.id, content({ slug: "barba-completa", slugHistory: ["barba"] })],
  ]);
  const r = resolveServiceSlugWithHistory([A, B], "barba", map);
  assert.equal(r.kind === "current" && r.offering.id, A.id);
});

test("missing: unknown slug, ineligible offering, empty request", () => {
  const map = new Map([[HIDDEN.id, content({ slug: "privado", slugHistory: ["privado-viejo"] })]]);
  assert.deepEqual(resolveServiceSlugWithHistory([A, HIDDEN], "nada-que-ver", map), { kind: "missing" });
  assert.deepEqual(resolveServiceSlugWithHistory([A, HIDDEN], "privado", map), { kind: "missing" });
  assert.deepEqual(resolveServiceSlugWithHistory([A, HIDDEN], "privado-viejo", map), { kind: "missing" });
  assert.deepEqual(resolveServiceSlugWithHistory([A], "", map), { kind: "missing" });
  assert.deepEqual(resolveServiceSlugWithHistory([A], null, map), { kind: "missing" });
});

test("legacy servicio-<title>-<id8> URL 301s to the custom slug once one is set", () => {
  const map = new Map([[A.id, content({ slug: "corte-clasico" })]]);
  const r = resolveServiceSlugWithHistory([A, B], serviceSlug(A), map);
  assert.equal(r.kind === "redirect" && r.slug, "corte-clasico");
});

test("without content (columns absent) the resolver matches today's id8 behaviour exactly", () => {
  const list = [A, B, HIDDEN];
  for (const slug of [serviceSlug(A), "servicio-nombre-viejo-3fa91c2b", serviceSlug(B), serviceSlug(HIDDEN), "servicio-x-deadbeef", "about"]) {
    const legacy = resolveServiceBySlug(list, slug);
    const r = resolveServiceSlugWithHistory(list, slug);
    if (legacy) assert.deepEqual(r, { kind: "current", offering: legacy, slug: serviceSlug(legacy) }, slug);
    else assert.deepEqual(r, { kind: "missing" }, slug);
  }
});

test("currentServiceSlug: custom slug when set, derived slug otherwise", () => {
  assert.equal(currentServiceSlug(A, content({ slug: "corte-clasico" })), "corte-clasico");
  assert.equal(currentServiceSlug(A, null), serviceSlug(A));
  assert.equal(currentServiceSlug(A, content({ slug: "  " })), serviceSlug(A));
});

test("two rows' histories hold the same slug: the lowest id wins, whatever the input order", () => {
  const map = new Map([
    [A.id, content({ slug: "corte-nuevo", slugHistory: ["oferta"] })],
    [B.id, content({ slug: "barba-nueva", slugHistory: ["oferta"] })],
  ]);
  const winner = [A.id, B.id].sort()[0];
  for (const list of [[A, B], [B, A]]) {
    const r = resolveServiceSlugWithHistory(list, "oferta", map);
    assert.equal(r.kind === "redirect" && r.offering.id, winner);
  }
});
