import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

import { applyRefreshCacheHeaders } from "@/lib/supabase/middleware";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("proxy strips every proxy-written host header from inbound requests", () => {
  const proxy = src("src/proxy.ts");
  const list = proxy.match(/HOST_CONTEXT_HEADERS_TO_STRIP = \[([\s\S]*?)\];/)?.[1] ?? "";
  for (const h of [
    "HOST_CONTEXT_HEADER",
    "HOST_TALENT_PROFILE_HEADER",
    "HOST_NAME_HEADER",
    "HOST_TENANT_SLUG_HEADER",
    "TENANT_HEADER_NAME",
    "PUBLIC_PATH_PREFIX_HEADER",
  ]) {
    assert.match(list, new RegExp(`\\b${h}\\b`), `${h} must be stripped`);
  }
  // The main path re-sets the host name from the resolved context after the strip.
  assert.match(proxy, /requestHeaders\.set\(HOST_NAME_HEADER, effectiveHostContext\.hostname\)/);
});

test("updateSession derives the cookie domain from the resolved host, not a header", () => {
  const mw = src("src/lib/supabase/middleware.ts");
  assert.doesNotMatch(mw, /headers\.get\("x-impronta-host-name"\)/);
  assert.match(mw, /options\?\.resolvedHost \?\? request\.headers\.get\("host"\)/);
  assert.match(src("src/proxy.ts"), /resolvedHost: effectiveHostContext\.hostname/);
  assert.equal(cookieDomainForHost("improntamodels.com"), undefined);
  assert.equal(cookieDomainForHost("app.tulala.digital"), ".tulala.digital");
});

test("the talent-site re-entry never trusts the forgeable host-name header", () => {
  const re = src("src/lib/saas/talent-site-rewrite-reentry.ts");
  assert.doesNotMatch(re, /request\.headers\.get\(HOST_NAME_HEADER\)/);
});

test("a refreshed session response gets no-store cache headers", () => {
  const res = NextResponse.next();
  applyRefreshCacheHeaders(res, {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  });
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  assert.match(res.headers.get("cache-control") ?? "", /private/);
  const mw = src("src/lib/supabase/middleware.ts");
  assert.match(mw, /setAll\(cookiesToSet, cacheHeaders\)/);
  assert.match(mw, /applyRefreshCacheHeaders\(res, refreshCacheHeaders\)/);
});
