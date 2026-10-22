import assert from "node:assert/strict";
import test from "node:test";

import { buildHubAgencyEntries } from "./hub-agency-entries";

const STAGING = { VERCEL_ENV: "preview", TALENT_SITE_ROOT_DOMAIN: "staging.tulala.digital" };
const PROD = { VERCEL_ENV: "production" };
const rows = [
  { hostname: "ambas-r6a.tulala.digital", kind: "subdomain", tenant_id: "a" },
  { hostname: "impronta.studiobooking.io", kind: "custom", tenant_id: "t" },
  { hostname: "improntamodels.com", kind: "custom", tenant_id: "t" },
  { hostname: "www.improntamodels.com", kind: "custom", tenant_id: "t" },
];
const names = new Map([["a", "Ambas"], ["t", "Impronta Models Tulum"]]);

const slugs = new Map([["a", "ambas"], ["t", "impronta"]]);

test("staging: one entry per tenant; custom-only tenant links to the path-hosted route", () => {
  const out = buildHubAgencyEntries(rows, names, STAGING, slugs);
  assert.deepEqual(out, [
    { hostname: "ambas-r6a.staging.tulala.digital", name: "Ambas" },
    { hostname: "staging.tulala.digital/w/impronta", name: "Impronta Models Tulum" },
  ]);
});

test("staging: a tenant with a subdomain and custom domains is listed once, on the subdomain", () => {
  const mixed = [
    { hostname: "shop.example.com", kind: "custom", tenant_id: "a" },
    { hostname: "ambas-r6a.tulala.digital", kind: "subdomain", tenant_id: "a" },
  ];
  assert.deepEqual(buildHubAgencyEntries(mixed, names, STAGING, slugs), [
    { hostname: "ambas-r6a.staging.tulala.digital", name: "Ambas" },
  ]);
});

test("staging: a custom-only tenant without a known slug is not listed", () => {
  assert.deepEqual(buildHubAgencyEntries(rows.slice(1), names, STAGING, new Map()), []);
});

test("production hub keeps custom domains and prod hosts", () => {
  const out = buildHubAgencyEntries(rows, names, PROD);
  assert.equal(out.length, 4);
  assert.equal(out[1]?.hostname, "impronta.studiobooking.io");
});
