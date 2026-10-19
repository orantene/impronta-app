import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isDevOnlyHostname } from "@/lib/saas/canonical-hosts";

const landing = readFileSync(join(process.cwd(), "src/components/home/hub-landing.tsx"), "utf8");

test("TUL-978: dev-only hostnames are recognised", () => {
  for (const h of ["localhost", "foo.localhost", "127.0.0.1", "demo.local", "10.0.0.5", "192.168.1.9"]) {
    assert.equal(isDevOnlyHostname(h), true, h);
  }
  for (const h of ["impronta.tulala.digital", "improntamodels.com"]) {
    assert.equal(isDevOnlyHostname(h), false, h);
  }
});

test("TUL-978: hub landing drops dev rows and renders the searchable list", () => {
  assert.match(landing, /filter\(\(r\) => !isDevOnlyHostname\(r\.hostname\)\)/);
  assert.match(landing, /<HubAgencyList agencies=/);
});

test("TUL-978: the list headlines the tenant name and keeps the domain as the sub-line", async () => {
  const { hubAgencyLabel } = await import("./hub-agency-list");
  assert.deepEqual(hubAgencyLabel({ hostname: "impronta.tulala.digital", name: " Impronta Models " }), { title: "Impronta Models", sub: "impronta.tulala.digital" });
  assert.deepEqual(hubAgencyLabel({ hostname: "x.tulala.digital", name: null }), { title: "x.tulala.digital", sub: null });
  assert.match(landing, /select\("id, display_name"\)/);
});
