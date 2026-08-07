import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveWorkspaceAdminBase as resolveAdminBase,
  resolveWorkspaceAdminBaseForLocation,
  workspaceAdminAppOrigin,
} from "./workspace-admin-base";

// Guards the doubled-URL regression #912 removed: a branded host already names
// the tenant, so repeating the slug yields improntamodels.com/impronta/admin.
test("branded hosts get a slug-less /admin base", () => {
  // Editor on a branded host: homepage and an inner page carry no slug.
  assert.equal(resolveAdminBase("impronta", "/"), "/admin");
  assert.equal(resolveAdminBase("impronta", "/about"), "/admin");
});

test("path-addressed hosts keep the slug prefix", () => {
  // /w/<slug> is the canonical path-based workspace form (#870).
  assert.equal(resolveAdminBase("impronta", "/w/impronta"), "/impronta/admin");
  assert.equal(
    resolveAdminBase("impronta", "/w/impronta/about"),
    "/impronta/admin",
  );
  // Legacy flat /<slug> still resolves while it redirects.
  assert.equal(resolveAdminBase("impronta", "/impronta"), "/impronta/admin");
  assert.equal(
    resolveAdminBase("impronta", "/impronta/about"),
    "/impronta/admin",
  );
});

test("a page whose slug merely PREFIXES the tenant slug is not path-addressed", () => {
  // "/improntagram" starts with "/impronta" as a raw string but is a different
  // page on a branded host — a naive startsWith would double the slug here.
  assert.equal(resolveAdminBase("impronta", "/improntagram"), "/admin");
});

/* ------------------------------------------------------------------ *
 * Host-routability regression (owner report, 2026-08-06).
 *
 * `/w/<slug>` is the DEFAULT storefront shape for every Free workspace and it
 * is served on the MARKETING host, where `surface-allow-list.ts` allows no
 * workspace path at all. Same-origin `/{slug}/admin/roster` 404ed there, so
 * clicking Roster in the quick bar did nothing. These pin the absolute form.
 * ------------------------------------------------------------------ */

const APP = "https://app.tulala.digital";

function withAppUrl<T>(value: string | undefined, fn: () => T): T {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = value;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  try {
    return fn();
  } finally {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevSite;
  }
}

test("marketing-host /w/<slug> storefront resolves to an ABSOLUTE app-origin base", () => {
  withAppUrl(APP, () => {
    const base = resolveWorkspaceAdminBaseForLocation("qa-wave7-starter", {
      origin: "https://tulala.digital",
      pathname: "/w/qa-wave7-starter",
    });
    assert.equal(base, `${APP}/qa-wave7-starter/admin`);
    // The link the owner clicked, end to end.
    assert.equal(
      `${base}/roster`,
      "https://app.tulala.digital/qa-wave7-starter/admin/roster",
    );
    // It must NOT be a same-origin path any more.
    assert.ok(
      !base.startsWith("/"),
      "a marketing-host storefront must not emit a same-origin admin path",
    );
  });
});

test("an inner marketing-host storefront page resolves the same way", () => {
  withAppUrl(APP, () => {
    assert.equal(
      resolveWorkspaceAdminBaseForLocation("qa-wave7-starter", {
        origin: "https://tulala.digital",
        pathname: "/w/qa-wave7-starter/about",
      }),
      `${APP}/qa-wave7-starter/admin`,
    );
  });
});

test("the app host itself stays same-origin", () => {
  withAppUrl(APP, () => {
    assert.equal(
      resolveWorkspaceAdminBaseForLocation("impronta", {
        origin: APP,
        pathname: "/w/impronta",
      }),
      "/impronta/admin",
    );
  });
});

test("branded hosts still get the slug-less relative /admin", () => {
  withAppUrl(APP, () => {
    assert.equal(
      resolveWorkspaceAdminBaseForLocation("impronta", {
        origin: "https://improntamodels.com",
        pathname: "/",
      }),
      "/admin",
    );
    assert.equal(
      resolveWorkspaceAdminBaseForLocation("impronta", {
        origin: "https://improntamodels.com",
        pathname: "/about",
      }),
      "/admin",
    );
  });
});

test("no configured app origin degrades to the previous same-origin behaviour", () => {
  withAppUrl(undefined, () => {
    assert.equal(
      resolveWorkspaceAdminBaseForLocation("qa-wave7-starter", {
        origin: "https://tulala.digital",
        pathname: "/w/qa-wave7-starter",
      }),
      "/qa-wave7-starter/admin",
    );
  });
});

test("a local page is never thrown out to a remote app origin", () => {
  // A dev whose .env.local still names the production app host must keep the
  // old relative behaviour rather than being bounced to production.
  assert.equal(workspaceAdminAppOrigin("http://localhost:3195", APP), "");
  assert.equal(workspaceAdminAppOrigin("http://tulala.local:3195", APP), "");
  assert.equal(workspaceAdminAppOrigin("http://127.0.0.1:3195", APP), "");
  // Local dev pointed at a local app host DOES cross over.
  assert.equal(
    workspaceAdminAppOrigin("http://localhost:3195", "http://app.lvh.me:3196"),
    "http://app.lvh.me:3196",
  );
});

test("same host name but a different PORT still crosses over", () => {
  // Local rigs put the marketing proxy and the app host on one name and two
  // ports. Comparing bare hostnames would call that "same origin" and emit the
  // relative path that 404s.
  assert.equal(
    workspaceAdminAppOrigin("http://127.0.0.1:3231", "http://127.0.0.1:3230"),
    "http://127.0.0.1:3230",
  );
  // Truly the same origin stays relative.
  assert.equal(
    workspaceAdminAppOrigin("http://127.0.0.1:3230", "http://127.0.0.1:3230"),
    "",
  );
});

test("workspaceAdminAppOrigin normalizes and rejects junk", () => {
  assert.equal(workspaceAdminAppOrigin("https://tulala.digital", ""), "");
  assert.equal(workspaceAdminAppOrigin("https://tulala.digital", "not a url"), "");
  assert.equal(
    workspaceAdminAppOrigin("https://tulala.digital", `${APP}/`),
    APP,
  );
});
