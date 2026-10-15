/**
 * TUL-690: a `/w/<slug>` storefront on the hub host books ITS workspace.
 * The picker used to call the root slots route with no workspace identity,
 * the proxy resolved the hub, and the hub tenant got no times.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicSlotsUrl,
  resolveSlotsWorkspaceScope,
  workspaceSlugFromPathname,
} from "./public-slots-workspace";

const WS = "11111111-1111-4111-8111-111111111111";
const HUB = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

test("workspace slug is read from canonical and locale-prefixed /w/ paths only", () => {
  assert.equal(workspaceSlugFromPathname("/w/acme"), "acme");
  assert.equal(workspaceSlugFromPathname("/w/acme/services/x"), "acme");
  assert.equal(workspaceSlugFromPathname("/es/w/acme/book"), "acme");
  assert.equal(workspaceSlugFromPathname("/t/TAL-1"), null);
  assert.equal(workspaceSlugFromPathname("/acme"), null);
  assert.equal(workspaceSlugFromPathname("/"), null);
});

test("slots url carries the workspace on /w/ pages and stays bare elsewhere", () => {
  const p = new URLSearchParams({ offering: "o1" });
  assert.equal(publicSlotsUrl(p, "/w/acme"), "/api/public/booking/slots?offering=o1&workspace=acme");
  assert.equal(publicSlotsUrl(p, "/t/TAL-1"), "/api/public/booking/slots?offering=o1");
  assert.equal(p.has("workspace"), false, "caller params are not mutated");
});

test("hub host + /w/ workspace resolves to that workspace when the offering belongs to it", () => {
  const r = resolveSlotsWorkspaceScope({
    host: { kind: "hub", tenantId: HUB },
    workspaceRequested: true,
    workspaceTenantId: WS,
    offeringTenantId: WS,
  });
  assert.deepEqual(r, { ok: true, host: { kind: "agency", tenantId: WS } });
});

test("a mismatched workspace / offering is rejected", () => {
  assert.deepEqual(
    resolveSlotsWorkspaceScope({
      host: { kind: "hub", tenantId: HUB },
      workspaceRequested: true,
      workspaceTenantId: WS,
      offeringTenantId: OTHER,
    }),
    { ok: false },
  );
  assert.deepEqual(
    resolveSlotsWorkspaceScope({
      host: { kind: "marketing", tenantId: null },
      workspaceRequested: true,
      workspaceTenantId: null,
      offeringTenantId: WS,
    }),
    { ok: false },
    "an unknown slug never falls back to the host tenant",
  );
});

test("no workspace, or a host that owns its tenant, is unchanged", () => {
  assert.deepEqual(
    resolveSlotsWorkspaceScope({
      host: { kind: "hub", tenantId: HUB },
      workspaceRequested: false,
      workspaceTenantId: null,
      offeringTenantId: OTHER,
    }),
    { ok: true, host: { kind: "hub", tenantId: HUB } },
  );
  for (const kind of ["agency", "talent_site"]) {
    assert.deepEqual(
      resolveSlotsWorkspaceScope({
        host: { kind, tenantId: HUB },
        workspaceRequested: true,
        workspaceTenantId: WS,
        offeringTenantId: WS,
      }),
      { ok: true, host: { kind, tenantId: HUB } },
      `${kind} host identity wins over a client param`,
    );
  }
});
