import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  HUB_AGENCY_PREVIEW_LIMIT,
  filterPublicHubAgencies,
  isSeedHostname,
  visibleHubAgencies,
  type HubAgencyItem,
} from "./hub-agency-model";
import { hubCmsTitle, hubDisplayName } from "./hub-landing-copy";

const live = { status: "active", discoverExposureEnabled: true, settings: {} };

test("TUL-1884: unnamed, non-live, opted-out, flagged and seed-host agencies are not listed", () => {
  const out = filterPublicHubAgencies([
    { hostname: "luna.example.com", name: " Luna Models ", ...live },
    { hostname: "bare.example.com", name: null, ...live },
    { hostname: "blank.example.com", name: "  ", ...live },
    { hostname: "old.example.com", name: "Old", ...live, status: "archived" },
    { hostname: "sus.example.com", name: "Sus", ...live, status: "suspended" },
    { hostname: "draft.example.com", name: "Draft", ...live, status: "draft" },
    { hostname: "hidden.example.com", name: "Hidden", ...live, discoverExposureEnabled: false },
    { hostname: "flag.example.com", name: "Flagged", ...live, settings: { is_test: true } },
    { hostname: "flag2.example.com", name: "Demo flag", ...live, settings: { is_demo: true } },
    { hostname: "qa-3.tulala.digital", name: "QA Three", ...live },
    { hostname: "e2e-run.tulala.digital", name: "E2E", ...live },
    { hostname: "unknown.example.com", name: "Unread", status: "unknown" },
  ]);
  assert.deepEqual(out, [{ hostname: "luna.example.com", name: "Luna Models" }]);
});

test("TUL-1884: seed host detection only matches the seed label pattern", () => {
  for (const h of ["qa-1.tulala.digital", "test-agency.x.com", "demo.x.com", "seed-9.x.com", "e2e-a.x.com"]) assert.equal(isSeedHostname(h), true, h);
  for (const h of ["impronta.tulala.digital", "quartz.example.com", "contest.example.com"]) assert.equal(isSeedHostname(h), false, h);
});

const many: HubAgencyItem[] = Array.from({ length: 30 }, (_, i) => ({ hostname: `a${i}.example.com`, name: `Agency ${String(i).padStart(2, "0")}` }));

test("TUL-1884: browse state is capped, 'see all' reveals the rest, search shows every name match", () => {
  const capped = visibleHubAgencies(many, "", false);
  assert.equal(capped.shown.length, HUB_AGENCY_PREVIEW_LIMIT);
  assert.equal(capped.hiddenCount, 30 - HUB_AGENCY_PREVIEW_LIMIT);
  assert.equal(capped.total, 30);
  assert.equal(visibleHubAgencies(many, "", true).shown.length, 30);
  assert.equal(visibleHubAgencies(many, "agency 2", false).shown.length, 10, "search is not capped");
  assert.equal(visibleHubAgencies(many, "a1.example", false).shown.length, 0, "the hidden address is not a search target");
});

test("TUL-1884: the seeded 'Impronta Hub' title never shows; an operator's own title does", () => {
  assert.equal(hubCmsTitle("Impronta Hub", "Agencias en la plataforma"), "Agencias en la plataforma");
  assert.equal(hubCmsTitle(" impronta hub ", "x"), "x");
  assert.equal(hubCmsTitle(null, "x"), "x");
  assert.equal(hubCmsTitle("Casting Collective", "x"), "Casting Collective");
  assert.equal(hubDisplayName("Impronta Hub", "Tulala"), "Tulala");
});

test("TUL-1884: en and es both carry the new list copy, without em dashes", () => {
  for (const f of ["messages/en.json", "messages/es.json"]) {
    const hub = JSON.parse(readFileSync(join(process.cwd(), f), "utf8")).public.hubLanding;
    assert.match(hub.seeAll, /\{count\}/, f);
    assert.ok(hub.showFewer, f);
    assert.doesNotMatch(`${hub.seeAll}${hub.showFewer}`, /\u2014/, f);
  }
});
