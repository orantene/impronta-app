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

test("staging hub lists only hosts under the staging root; live custom domains are dropped", () => {
  const out = buildHubAgencyEntries(rows, names, STAGING);
  assert.deepEqual(out, [{ hostname: "ambas-r6a.staging.tulala.digital", name: "Ambas" }]);
});

test("production hub keeps custom domains and prod hosts", () => {
  const out = buildHubAgencyEntries(rows, names, PROD);
  assert.equal(out.length, 4);
  assert.equal(out[1]?.hostname, "impronta.studiobooking.io");
});
