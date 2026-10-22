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
  assert.match(landing, /<HubAgencyList\s+agencies=/);
  assert.match(landing, /t\("public\.hubLanding\.noAgencies"\)/, "TUL-978: the fixed copy is localized");
});

test("TUL-1884: the loader reads the tenant name and status, and the list shows names only (no raw address)", () => {
  assert.match(landing, /select\("id, display_name, status, discover_exposure_enabled, settings"\)/);
  assert.match(landing, /filterPublicHubAgencies\(candidates\)/);
  const list = readFileSync(join(process.cwd(), "src/components/home/hub-agency-list.tsx"), "utf8");
  assert.doesNotMatch(list, />\s*\{agency\.hostname\}|\{sub\}/, "the hostname is the link target only, never rendered text");
});
