import assert from "node:assert/strict";
import { test } from "node:test";

import { isPathAllowedForHostKind } from "@/lib/saas/gate";
import { APP_WORKSPACE_PREFIXES } from "@/lib/saas/path-groups";
import { pageUrl } from "./catalog-render";

// Every email CTA is built by pageUrl. Its job is not "make a URL" — it is
// "make a URL the recipient's click actually opens".
//
// The failure it exists to prevent: brand.homeHref falls back to the platform
// MARKETING apex for any tenant without a custom domain, and the surface
// allow-list does not serve workspace paths on a marketing host. Confirmed on
// production: tulala.digital/client/inquiries, /talent/inbox and /admin/account
// all return 404, while app.tulala.digital sends them to login with a ?next=
// back to the page. Exactly one tenant has a custom domain today, so this was
// the button most recipients received.

const SITE = "https://tulala.digital";
const APP = "https://app.tulala.digital";

function withEnv<T>(fn: () => T): T {
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  try {
    return fn();
  } finally {
    if (prevSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevSite;
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
}

const marketing = { homeHref: SITE } as Parameters<typeof pageUrl>[0];
const agency = { homeHref: "https://improntamodels.com" } as Parameters<typeof pageUrl>[0];

test("no email CTA is built on a host that 404s it", () => {
  // Derived from the allow-list itself rather than a hand-copied list: if a new
  // workspace prefix is added there, this test covers it without being edited,
  // which is how the team-invite link slipped through once already.
  withEnv(() => {
    for (const prefix of APP_WORKSPACE_PREFIXES) {
      const url = pageUrl(marketing, `${prefix}/deep/link`);
      assert.ok(
        url.startsWith(APP),
        `${prefix} CTA was built on the marketing host, where it 404s: ${url}`,
      );
    }
  });
});

test("the allow-list agrees these paths do not belong on a marketing host", () => {
  // Guards the premise, not just the behaviour. Note the argument order is
  // (kind, pathname): passing them the other way round returns false for
  // everything, so this assertion passed for the wrong reason until the
  // agency case below — which asserts TRUE — caught it. A guard that cannot
  // fail is worse than no guard.
  //
  // If the platform ever starts
  // serving workspace paths on marketing, this fails and tells us the redirect
  // above is now unnecessary — rather than leaving it in place forever.
  for (const prefix of APP_WORKSPACE_PREFIXES) {
    assert.equal(
      isPathAllowedForHostKind("marketing", `${prefix}/deep/link`),
      false,
      `${prefix} is now allowed on marketing; revisit pageUrl`,
    );
  }
});

test("an agency with its own domain keeps it — those hosts do serve workspace paths", () => {
  withEnv(() => {
    assert.equal(
      pageUrl(agency, "/admin/work/abc"),
      "https://improntamodels.com/admin/work/abc",
    );
    assert.ok(isPathAllowedForHostKind("agency", "/admin/work/abc"));
  });
});

test("public paths stay on the brand's own host", () => {
  withEnv(() => {
    for (const path of ["/", "/help", "/login", "/directory"]) {
      assert.equal(pageUrl(marketing, path), `${SITE}${path}`);
      assert.equal(pageUrl(agency, path), `https://improntamodels.com${path}`);
    }
  });
});

test("www and a trailing slash do not change the answer", () => {
  withEnv(() => {
    for (const href of ["https://www.tulala.digital", "https://tulala.digital/"]) {
      const url = pageUrl({ homeHref: href } as Parameters<typeof pageUrl>[0], "/client/inquiries/1");
      assert.ok(url.startsWith(APP), `${href} was not recognised as the marketing apex: ${url}`);
    }
  });
});

test("a prefix match is a path-segment match, not a string prefix", () => {
  withEnv(() => {
    // "/adminish" is not "/admin". Redirecting it would send a public page to
    // the app host, which is the same defect pointed the other way.
    assert.equal(pageUrl(marketing, "/adminish"), `${SITE}/adminish`);
  });
});
