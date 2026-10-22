import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  HUB_AGENCY_PREVIEW_LIMIT,
  filterPublicHubAgencies,
  isReservedTestEmail,
  isSeedHostname,
  tenantsWithRealOwner,
  visibleHubAgencies,
  type HubAgencyItem,
} from "./hub-agency-model";
import { hubCmsTitle, hubDisplayName } from "./hub-landing-copy";

const live = { status: "active", discoverExposureEnabled: true, settings: {}, domainKind: "subdomain", agencyKind: "agency", hasPublishedHomepage: true, hasRealOwner: true };

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

test("TUL-1884: only site domains of agency-kind workspaces with a published homepage; app/marketing/hub/platform rows never", () => {
  const out = filterPublicHubAgencies([
    { hostname: "ok.example.com", name: "Ok", ...live },
    { hostname: "app.example.com", name: "Tulala Hub", ...live, domainKind: "app" },
    { hostname: "www.example.com", name: "Mkt", ...live, domainKind: "marketing" },
    { hostname: "hub.example.com", name: "Tulala Hub", ...live, domainKind: "hub" },
    { hostname: "sub-of-hub.example.com", name: "Tulala Hub", ...live, agencyKind: "hub" },
    { hostname: "qa-run.example.com", name: "Rosa both phone zaiawf", ...live, hasPublishedHomepage: false },
    { hostname: "nohome.example.com", name: "No home", ...live, hasPublishedHomepage: undefined },
  ]);
  assert.deepEqual(out, [{ hostname: "ok.example.com", name: "Ok" }]);
});

test("TUL-1884: one card per tenant, custom beats subdomain, order stays stable", () => {
  const out = filterPublicHubAgencies([
    { hostname: "a.example.com", name: "A", tenantId: "t1", ...live },
    { hostname: "b.example.com", name: "B", tenantId: "t2", ...live },
    { hostname: "a-custom.com", name: "A", tenantId: "t1", ...live, domainKind: "custom" },
    { hostname: "a2.example.com", name: "A", tenantId: "t1", ...live },
  ]);
  assert.deepEqual(out, [{ hostname: "a-custom.com", name: "A" }, { hostname: "b.example.com", name: "B" }]);
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

test("TUL-1884: owner rule. no owner -> hidden, test-TLD owner -> hidden, flagged owner -> hidden, real owner -> shown", () => {
  const ownersByTenant = new Map<string, string[]>([
    ["t-real", ["u-real"]],
    ["t-tld", ["u-tld"]],
    ["t-flag", ["u-flag"]],
    ["t-grok", ["u-real2"]],
    ["t-mixed", ["u-tld", "u-real"]],
    // t-none has no owner membership at all
  ]);
  const real = tenantsWithRealOwner({
    ownersByTenant,
    emailByUser: new Map([
      ["u-real", "jane@gmail.com"],
      ["u-real2", "qa@mail.grokbot.com"],
      ["u-tld", "x@impronta.test"],
      ["u-flag", "flagged@gmail.com"],
    ]),
    flaggedUserIds: new Set(["u-flag"]),
  });
  assert.equal(real.has("t-real"), true);
  assert.equal(real.has("t-tld"), false);
  assert.equal(real.has("t-flag"), false);
  assert.equal(real.has("t-none"), false);
  assert.equal(real.has("t-mixed"), true, "one real owner is enough");
  const listed = filterPublicHubAgencies(
    ["t-real", "t-tld", "t-flag", "t-none"].map((t) => ({ hostname: `${t}.example.com`, name: t, tenantId: t, ...live, hasRealOwner: real.has(t) })),
  );
  assert.deepEqual(listed.map((a) => a.name), ["t-real"]);
});

test("TUL-1884: reserved test TLDs", () => {
  for (const e of ["a@impronta.test", "a@x.example", "a@x.INVALID", "a@foo.localhost"]) assert.equal(isReservedTestEmail(e), true, e);
  for (const e of ["a@gmail.com", "a@example.com", "a@testing.io", "", null, undefined, "nodomain"]) assert.equal(isReservedTestEmail(e), false, String(e));
});
