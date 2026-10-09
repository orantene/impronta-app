import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  accountFlagKindForHost,
  accountHrefFor,
  accountHomeMode,
  agencyAccountTabs,
  authPageBrand,
  legacyClientEntryRedirect,
} from "./agency-area-pure";

test("flag kind per host", () => {
  assert.equal(accountFlagKindForHost("talent_site"), "talent");
  for (const h of ["agency", "hub", "app", "marketing"]) assert.equal(accountFlagKindForHost(h), "app");
  for (const h of ["not_found", "x", null, undefined]) assert.equal(accountFlagKindForHost(h), null);
});

test("home mode: flag off is always legacy", () => {
  for (const hostContext of ["agency", "hub", "app", "talent_site"]) {
    assert.equal(accountHomeMode({ flagOn: false, hostContext, userId: null, appRole: null }), "legacy");
  }
});

test("home mode: signed out and clients get the area, team accounts keep the role redirect", () => {
  const base = { flagOn: true, hostContext: "agency" };
  assert.equal(accountHomeMode({ ...base, userId: null, appRole: null }), "area");
  assert.equal(accountHomeMode({ ...base, userId: "u", appRole: "client" }), "area");
  // A fresh code sign-in has no role yet; that is a client, same as the eligibility rule.
  assert.equal(accountHomeMode({ ...base, userId: "u", appRole: null }), "area");
  for (const appRole of ["talent", "agency_staff", "super_admin", "platform_admin"]) {
    assert.equal(accountHomeMode({ ...base, userId: "u", appRole }), "legacy");
  }
  assert.equal(accountHomeMode({ flagOn: true, hostContext: "talent_site", userId: null, appRole: null }), "legacy");
});

test("legacy redirect: flag off never redirects", () => {
  for (const hostContext of ["agency", "hub", "app"]) {
    assert.equal(legacyClientEntryRedirect({ flagOn: false, hostContext, userId: null, appRole: null }), "stay");
    assert.equal(legacyClientEntryRedirect({ flagOn: false, hostContext, userId: "u", appRole: "client" }), "stay");
  }
});

test("legacy redirect: only agency and hub hosts, only clients or signed out", () => {
  assert.equal(legacyClientEntryRedirect({ flagOn: true, hostContext: "agency", userId: null, appRole: null }), "account");
  assert.equal(legacyClientEntryRedirect({ flagOn: true, hostContext: "hub", userId: "u", appRole: "client" }), "account");
  assert.equal(legacyClientEntryRedirect({ flagOn: true, hostContext: "app", userId: "u", appRole: "client" }), "stay");
  assert.equal(legacyClientEntryRedirect({ flagOn: true, hostContext: "marketing", userId: null, appRole: null }), "stay");
  for (const appRole of ["talent", "agency_staff", "super_admin"]) {
    assert.equal(legacyClientEntryRedirect({ flagOn: true, hostContext: "agency", userId: "u", appRole }), "stay");
  }
});

test("agency tabs: agency host, client audience, valid slug only", () => {
  const ok = agencyAccountTabs({ hostContext: "agency", tenantSlug: "impronta", audience: "client" });
  assert.deepEqual(ok.map((t) => t.key), ["quotes", "shortlists", "approvals"]);
  assert.deepEqual(ok.map((t) => t.href), ["/impronta/client/inquiries", "/impronta/client/shortlists", "/impronta/client/pitches"]);
});

test("hub has no agency tabs; neither do other audiences or bad slugs", () => {
  assert.deepEqual(agencyAccountTabs({ hostContext: "hub", tenantSlug: "tulala", audience: "client" }), []);
  assert.deepEqual(agencyAccountTabs({ hostContext: "app", tenantSlug: "tulala", audience: "client" }), []);
  assert.deepEqual(agencyAccountTabs({ hostContext: "talent_site", tenantSlug: "x", audience: "client" }), []);
  assert.deepEqual(agencyAccountTabs({ hostContext: "agency", tenantSlug: "impronta", audience: "signed_out" }), []);
  assert.deepEqual(agencyAccountTabs({ hostContext: "agency", tenantSlug: "impronta", audience: "not_client" }), []);
  for (const tenantSlug of ["", null, undefined, "../admin", "a/b", "a b"]) {
    assert.deepEqual(agencyAccountTabs({ hostContext: "agency", tenantSlug, audience: "client" }), []);
  }
});

test("login brand: flag, host kind, whitelabel and a name are all required", () => {
  const on = { flagOn: true, hostKind: "agency", whitelabel: true, publicName: " Impronta Models " };
  assert.deepEqual(authPageBrand(on), { title: "Impronta Models" });
  assert.deepEqual(authPageBrand({ ...on, hostKind: "hub" }), { title: "Impronta Models" });
  assert.equal(authPageBrand({ ...on, flagOn: false }), null);
  assert.equal(authPageBrand({ ...on, whitelabel: false }), null);
  assert.equal(authPageBrand({ ...on, publicName: "  " }), null);
  assert.equal(authPageBrand({ ...on, publicName: null }), null);
  for (const hostKind of ["app", "marketing", "talent_site", null]) assert.equal(authPageBrand({ ...on, hostKind }), null);
});

test("sign-in on agency and hub hosts: verify resolves the tenant from the host and links the relationship", () => {
  const src = readFileSync(join(__dirname, "actions.ts"), "utf8");
  assert.match(src, /accountSurfaceEnabledForRequest\(\)/);
  assert.match(src, /isClientAccountEligible\(profile\?\.app_role\)/);
  assert.match(src, /resolveAccountTenant\(\)/);
  assert.match(src, /ensureTenantClientRelationship\(\{\s*userId: input\.userId,\s*tenantId: tenant\.tenantId/);
  assert.doesNotMatch(src, /tenantId:\s*input\./);
});

test("tenant renderer: data only for a client, always scoped by session user and host tenant", () => {
  const src = readFileSync(join(__dirname, "render-tenant-area.tsx"), "utf8");
  assert.match(src, /resolveAccountTenant\(\)/);
  assert.match(src, /audience === "client" && userId/);
  assert.match(src, /accountFlagKindForHost\(/);
  assert.doesNotMatch(src, /searchParams|cookies\(\)/);
  const loads = [...src.matchAll(/load(?:VisitGroups|VisitDetail|Thread|Threads|Receipt|ReceiptDetail|Receipts|OwedPayLinks)\(([^)]*)\)/g)];
  assert.ok(loads.length >= 6);
  for (const m of loads) assert.match(m[1], /^userId, tenantId/, m[0]);
  const data = readFileSync(join(__dirname, "area-data.server.ts"), "utf8");
  for (const fn of ["loadVisitGroups", "loadVisitDetail", "loadThreads", "loadThread", "loadReceipts", "loadReceiptDetail", "loadOwedPayLinks"]) {
    assert.match(data, new RegExp(`export async function ${fn}\\(userId: string, tenantId: string`));
  }
});

test("legacy entry points are guarded by the pure redirect decision", () => {
  const root = join(__dirname, "..", "..", "app");
  const pages = [
    join(root, "(public)", "me", "page.tsx"),
    join(root, "client", "page.tsx"),
    join(root, "(workspace)", "[tenantSlug]", "client", "page.tsx"),
  ];
  for (const p of pages) {
    const src = readFileSync(p, "utf8");
    assert.match(src, /legacyClientEntryRedirectFor\(/, p);
  }
});

test("account link: absolute app URL only on the marketing apex", () => {
  assert.equal(accountHrefFor("marketing", "https://app.tulala.digital"), "https://app.tulala.digital/account");
  assert.equal(accountHrefFor("marketing", "https://app.tulala.digital/"), "https://app.tulala.digital/account");
  for (const k of ["app", "agency", "hub", "talent_site", null, undefined]) {
    assert.equal(accountHrefFor(k, "https://app.tulala.digital"), "/account");
  }
});

test("popover account link goes through accountHrefFor, not a literal", () => {
  const btn = readFileSync(join(__dirname, "..", "..", "components", "client-account", "ClientAccountButton.tsx"), "utf8");
  assert.doesNotMatch(btn, /href="\/account"/);
  assert.match(btn, /href=\{accountHref\}/);
  const dock = readFileSync(join(__dirname, "..", "..", "components", "client-account", "ClientAccountDock.tsx"), "utf8");
  assert.match(dock, /accountHrefFor\(/);
  assert.match(dock, /getAppUrl\(\)/);
});
