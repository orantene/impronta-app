import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explicitUrlLocale,
  resolveWorkspacePageLocale,
  workspaceContentLocale,
} from "./workspace-page-locale";

const none = { identityDefault: null, homeCmsLocale: null, usesPlatformStarter: false, supported: [] };
const pub = ["en", "es"];

test("QA workspace: no identity, platform starter -> es on /w/<slug>", () => {
  const r = resolveWorkspacePageLocale({
    hostKind: "agency",
    explicit: explicitUrlLocale("/w/qa-grok-workspace", "", pub),
    facts: { ...none, usesPlatformStarter: true },
    platformDefault: "en",
  });
  assert.equal(r, "es");
});

test("identity default wins over the starter; EN workspace stays EN", () => {
  const facts = { ...none, identityDefault: "en", supported: ["en"] };
  assert.equal(workspaceContentLocale(facts, "en"), "en");
  assert.equal(
    resolveWorkspacePageLocale({ hostKind: "agency", explicit: null, facts, platformDefault: "en" }),
    "en",
  );
});

test("home page locale is used when there is no identity row", () => {
  assert.equal(workspaceContentLocale({ ...none, homeCmsLocale: "es" }, "en"), "es");
});

test("explicit prefix or ?lang beats the workspace language", () => {
  assert.equal(explicitUrlLocale("/es/directory", "", pub), "es");
  assert.equal(explicitUrlLocale("/w/x/directory", "?lang=en", pub), "en");
  assert.equal(explicitUrlLocale("/w/x/es/directory", "", pub), "es");
  assert.equal(explicitUrlLocale("/w/x", "?lang=fr", pub), null);
  const facts = { ...none, identityDefault: "es", supported: ["es", "en"] };
  assert.equal(
    resolveWorkspacePageLocale({ hostKind: "agency", explicit: "en", facts, platformDefault: "en" }),
    "en",
  );
});

test("talent sites, marketing and unknown hosts are untouched", () => {
  const facts = { ...none, identityDefault: "es", supported: ["es"] };
  for (const hostKind of ["talent_site", "marketing", "app", "hub", null]) {
    assert.equal(resolveWorkspacePageLocale({ hostKind, explicit: null, facts, platformDefault: "en" }), null);
  }
});

test("an unsupported own language falls back to the platform default", () => {
  const facts = { ...none, identityDefault: "fr", supported: ["en", "es"] };
  assert.equal(
    resolveWorkspacePageLocale({ hostKind: "agency", explicit: null, facts, platformDefault: "en" }),
    "en",
  );
});

import { isDashboardSurfacePath, workspaceLocaleBranchApplies } from "./workspace-page-locale";

test("TUL-1229: dashboard surfaces are recognised, public workspace pages are not", () => {
  for (const p of ["/talent", "/talent/today", "/admin/inquiries", "/client", "/account", "/acme/admin", "/acme/client/today", "/es/talent/today"]) {
    assert.equal(isDashboardSurfacePath(p), true, p);
  }
  for (const p of ["/", "/directory", "/w/acme", "/w/acme/client", "/es", "/t/abc", null, undefined]) {
    assert.equal(isDashboardSurfacePath(p as string | null | undefined), false, String(p));
  }
});

test("TUL-1229: a dashboard follows the language cookie over the workspace default", () => {
  assert.equal(workspaceLocaleBranchApplies({ pathname: "/talent/today", cookieLocale: "en", publicLocales: pub }), false);
  assert.equal(workspaceLocaleBranchApplies({ pathname: "/talent/today", cookieLocale: "es", publicLocales: pub }), false);
});

test("TUL-1229: dashboard with no usable cookie falls back to the workspace language; public pages unchanged", () => {
  assert.equal(workspaceLocaleBranchApplies({ pathname: "/talent/today", cookieLocale: undefined, publicLocales: pub }), true);
  assert.equal(workspaceLocaleBranchApplies({ pathname: "/talent/today", cookieLocale: "fr", publicLocales: pub }), true);
  assert.equal(workspaceLocaleBranchApplies({ pathname: "/w/acme", cookieLocale: "en", publicLocales: pub }), true);
});
