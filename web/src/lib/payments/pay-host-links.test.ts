import test from "node:test";
import assert from "node:assert/strict";

import { decidePayAccess, hostServesTenantPayLinks } from "./pay-host-links";
import { notFoundCopy } from "@/lib/i18n/not-found-copy";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";

test("tenant hosts show the conversation and receipt links; app and unknown hosts do not", () => {
  for (const k of ["agency", "hub", "talent_site"]) assert.equal(hostServesTenantPayLinks(k), true, k);
  for (const k of ["app", "marketing", "unknown"]) assert.equal(hostServesTenantPayLinks(k), false, k);
});

test("TUL-1252: the pay page is reachable from the client account host, its tenant-only links are not offered there", () => {
  assert.equal(isPathAllowedForHostKind("app", "/pay/3fcz1trb5eujnjwayx2j"), true);
  assert.equal(isPathAllowedForHostKind("app", "/r/anything"), false);
  assert.equal(hostServesTenantPayLinks("app"), false);
});

// A2: /pay valid / invalid / expired / other-tenant.
const valid = { ok: true as const, tenantId: "tenant-a" };
const expired = { ok: false as const, reason: "expired", tenantId: "tenant-a" };
const missing = { ok: false as const, reason: "not_found" };

test("A2 valid: renders on the app host, on its own agency host, and on a hub or talent host", () => {
  assert.equal(decidePayAccess(valid, { kind: "app" }), "render");
  assert.equal(decidePayAccess(valid, { kind: "agency", tenantId: "tenant-a" }), "render");
  assert.equal(decidePayAccess(valid, { kind: "hub", tenantId: "hub" }), "render");
  assert.equal(decidePayAccess(valid, { kind: "talent_site" }), "render");
});

test("A2 invalid: an unknown or unavailable code is a not-found on every host", () => {
  for (const kind of ["app", "agency", "hub", "talent_site"]) {
    assert.equal(decidePayAccess(missing, { kind, tenantId: "tenant-a" }), "not_found", kind);
    assert.equal(decidePayAccess({ ok: false, reason: "unavailable" }, { kind }), "not_found", kind);
  }
});

test("A2 invalid, Spanish: the not-found a Spanish visitor sees is in Spanish", () => {
  const c = notFoundCopy("es", null);
  assert.equal(c.heading, "Página no encontrada");
  assert.match(c.body, /No encontramos/);
  assert.equal(notFoundCopy("es", "Impronta").heading, "Esta página ya no está aquí");
});

test("A2 expired: shows the expired view (with the way back to the conversation) on its own host", () => {
  assert.equal(decidePayAccess(expired, { kind: "app" }), "expired");
  assert.equal(decidePayAccess(expired, { kind: "agency", tenantId: "tenant-a" }), "expired");
});

test("A2 other tenant: tenant B's code, valid or expired, never renders on tenant A's agency host", () => {
  const b = { ok: true as const, tenantId: "tenant-b" };
  assert.equal(decidePayAccess(b, { kind: "agency", tenantId: "tenant-a" }), "not_found");
  assert.equal(decidePayAccess({ ...expired, tenantId: "tenant-b" }, { kind: "agency", tenantId: "tenant-a" }), "not_found");
  assert.equal(decidePayAccess(valid, { kind: "agency", tenantId: "tenant-b" }), "not_found");
});

test("A2 wiring: the page asks the decision before it renders anything", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/pay-page.tsx"), "utf8");
  const at = src.indexOf("decidePayAccess(loaded");
  assert.ok(at > 0);
  assert.ok(at < src.indexOf('loaded.reason === "expired"'), "decision comes before the expired view");
  assert.ok(at < src.indexOf("order_lines"), "decision comes before any order read");
});
