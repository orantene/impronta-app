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

test("TUL-1884: the list shows names only (no raw address)", () => {
  const list = readFileSync(join(process.cwd(), "src/components/home/hub-agency-list.tsx"), "utf8");
  assert.doesNotMatch(list, />\s*\{agency\.hostname\}|\{sub\}/, "the hostname is the link target only, never rendered text");
});

test("TUL-1884: the agency list is cached 10 minutes and auth is only asked about unflagged owners", () => {
  assert.match(landing, /unstable_cache\(computeActiveAgencyDomains,/);
  assert.match(landing, /HUB_AGENCY_LIST_REVALIDATE_SECONDS = 600/);
  assert.match(landing, /ownerIds\.filter\(\(id\) => !flagged\.has\(id\)\)/);
});

test("TUL-1884: read errors throw inside the cached function (nothing cached) and fall back to an empty list outside it", () => {
  const body = landing.slice(landing.indexOf("async function computeActiveAgencyDomains"));
  for (const e of ["domainsError", "namesError", "homesError"]) assert.match(body, new RegExp(`if \\(${e}\\) throw ${e}`), e);
  assert.match(body, /if \(error\) throw error;/);
  assert.match(body, /throw profileFlags\.error \?\? talentFlags\.error/);
  assert.match(body, /if \(userError\) throw userError/);
  assert.doesNotMatch(body, /return new Set\(\);\n\s*\}\n\s*const ownersByTenant/, "no swallowed owner read error");
  const loader = landing.slice(landing.indexOf("async function loadActiveAgencyDomains"), landing.indexOf("async function computeActiveAgencyDomains"));
  assert.match(loader, /try \{\s*return await cachedAgencyList\(\);\s*\} catch \(error\) \{\s*logServerError\("hubLanding\.agencyList", error\);\s*return \[\];/);
});

test("TUL-1843 + TUL-1884: eligibility picks the tenants, buildHubAgencyEntries picks each href (one per tenant, custom first)", () => {
  assert.match(landing, /select\("id, display_name, slug, status, kind, discover_exposure_enabled, settings"\)/);
  assert.match(landing, /isPublicHubAgency\(candidate\)/);
  assert.match(landing, /buildHubAgencyEntries\(ordered, names, process\.env, slugs\)\[0\]/);
  assert.match(landing, /slugs\.set\(a\.id, a\.slug\)/);
});
