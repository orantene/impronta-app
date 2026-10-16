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
  assert.match(landing, /<HubAgencyList hostnames=/);
});
