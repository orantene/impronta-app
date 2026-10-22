/**
 * TUL-1777: IndexNow follow-up. Repeated pings of one URL collapse, preview/staging origins are never submitted, the
 * /w + agency page hooks exist, and a tenant with no live domain resolves to its /w/<slug> site on the public root.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  INDEXNOW_DEBOUNCE_MS,
  indexNowHostAllowed,
  pingIndexNow,
  resetIndexNowDebounce,
  takeUnpinged,
} from "./indexnow";
import { cmsPageIndexNowPath } from "./indexnow-cms-page";
import { resolveTenantPublicOriginForIndexNow } from "./indexnow-tenant-origin";

const PROD_ENV = { VERCEL_ENV: "production", INDEXNOW_API_KEY: "k" };

test("takeUnpinged: a URL seen inside the window is dropped, and returns after it", () => {
  resetIndexNowDebounce();
  assert.deepEqual(takeUnpinged(["https://a.example/x", "https://a.example/x"], 1000), ["https://a.example/x"]);
  assert.deepEqual(takeUnpinged(["https://a.example/x", "https://a.example/y"], 2000), ["https://a.example/y"]);
  assert.deepEqual(takeUnpinged(["https://a.example/x"], 1000 + INDEXNOW_DEBOUNCE_MS), ["https://a.example/x"]);
});

test("indexNowHostAllowed: preview, staging and local hosts are refused", () => {
  assert.equal(indexNowHostAllowed("tulala.digital"), true);
  assert.equal(indexNowHostAllowed("studio.example.com"), true);
  for (const h of ["tulala-abc.vercel.app", "staging.tulala.digital", "acme.staging.tulala.digital", "qa-3.tulala.digital", "localhost:3000"]) {
    assert.equal(indexNowHostAllowed(h), false, h);
  }
});

test("pingIndexNow: second ping of the same URL makes no request; a staging host makes none", async () => {
  resetIndexNowDebounce();
  let calls = 0;
  const original = global.fetch;
  global.fetch = (async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await pingIndexNow(["https://tulala.digital/w/acme/about"], PROD_ENV);
    await pingIndexNow(["https://tulala.digital/w/acme/about"], PROD_ENV);
    assert.equal(calls, 1);
    await pingIndexNow(["https://acme.staging.tulala.digital/about"], PROD_ENV);
    assert.equal(calls, 1);
  } finally {
    global.fetch = original;
    resetIndexNowDebounce();
  }
});

test("cmsPageIndexNowPath: English unprefixed, other locales prefixed, home is the root", () => {
  assert.equal(cmsPageIndexNowPath("en", "about"), "/about");
  assert.equal(cmsPageIndexNowPath("es", "sobre-nosotros"), "/es/sobre-nosotros");
  assert.equal(cmsPageIndexNowPath("en", ""), "/");
  assert.equal(cmsPageIndexNowPath("es", ""), "/es");
});

type Rows = { agency_domains: unknown[]; agencies: unknown };
function fakeSb(rows: Rows) {
  return {
    from(table: keyof Rows) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: rows[table] }),
        then: (res: (v: { data: unknown }) => void) => res({ data: rows[table] }),
      };
      return q;
    },
  } as never;
}

test("origin resolver: live domain wins; none falls back to /w/<slug> on the public root; neither is null", async () => {
  const live = [{ hostname: "acme.example.com", kind: "custom", status: "active", is_primary: true }];
  assert.equal(await resolveTenantPublicOriginForIndexNow(fakeSb({ agency_domains: live, agencies: null }), "t"), "https://acme.example.com");
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    assert.equal(
      await resolveTenantPublicOriginForIndexNow(fakeSb({ agency_domains: [], agencies: { slug: "acme" } }), "t"),
      "https://tulala.digital/w/acme",
    );
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
  assert.equal(await resolveTenantPublicOriginForIndexNow(fakeSb({ agency_domains: [], agencies: null }), "t"), null);
});

test("publishPage and publishHomepage call the CMS page ping after the response", () => {
  const root = join(__dirname, "../site-admin/server");
  assert.match(readFileSync(join(root, "pages.ts"), "utf8"), /pingIndexNowForCmsPage\(supabase, tenantId, afterRow\)/);
  assert.match(readFileSync(join(root, "homepage.ts"), "utf8"), /pingIndexNowForCmsPage\(supabase, tenantId, \{ locale: values\.locale, slug: "" \}\)/);
});
