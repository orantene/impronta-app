import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import type { HostContext } from "./host-context";
import {
  clearWorkspacePlanCache,
  freeSubdomainPathRedirect,
  freeSubdomainRedirectablePath,
  freeSubdomainToPathRedirectUrl,
  shouldRedirectMarketingWorkspacePath,
} from "./workspace-path-redirects";

const subdomainHost = (slug: string): HostContext => ({
  kind: "agency",
  tenantId: "00000000-0000-4000-8000-000000000001",
  hostname: `${slug}.tulala.digital`,
  domainKind: "subdomain",
  isPrimary: true,
  canonicalHost: null,
  canonicalHostKind: null,
  tenantSlug: slug,
});

async function wire(input: { url: string; canonicalPath: string; plan: string | null | Error; method?: string; host?: HostContext }) {
  clearWorkspacePlanCache();
  const request = new NextRequest(input.url, { method: input.method ?? "GET" });
  const res = await freeSubdomainPathRedirect({
    request,
    pathname: request.nextUrl.pathname,
    canonicalPath: input.canonicalPath,
    hostContext: input.host ?? subdomainHost("qa-grok-salon"),
    readPlan: async () => {
      if (input.plan instanceof Error) throw input.plan;
      return input.plan;
    },
  });
  return res ? { status: res.status, location: res.headers.get("location") } : null;
}

test("onb1-17 proxy wire: Free subdomain storefront → 308 to /w, locale kept before /w", async () => {
  assert.deepEqual(await wire({ url: "https://qa-grok-salon.tulala.digital/", canonicalPath: "/", plan: "free" }), {
    status: 308,
    location: "https://tulala.digital/w/qa-grok-salon",
  });
  assert.deepEqual(
    await wire({ url: "https://qa-grok-salon.tulala.digital/es/menu?x=1", canonicalPath: "/menu", plan: "free" }),
    { status: 308, location: "https://tulala.digital/es/w/qa-grok-salon/menu?x=1" },
  );
});

test("onb1-17 proxy wire: paid, unknown plan, read error, POST and custom domains stay put", async () => {
  const url = "https://qa-grok-salon.tulala.digital/";
  assert.equal(await wire({ url, canonicalPath: "/", plan: "agency" }), null);
  assert.equal(await wire({ url, canonicalPath: "/", plan: null }), null);
  assert.equal(await wire({ url, canonicalPath: "/", plan: "enterprise-legacy" }), null);
  assert.equal(await wire({ url, canonicalPath: "/", plan: new Error("db down") }), null);
  assert.equal(await wire({ url, canonicalPath: "/", plan: "free", method: "POST" }), null);
  const custom: HostContext = { ...(subdomainHost("qa-grok-salon") as Extract<HostContext, { kind: "agency" }>), domainKind: "custom", hostname: "salon.example.com" };
  assert.equal(await wire({ url: "https://salon.example.com/", canonicalPath: "/", plan: "free", host: custom }), null);
});

test("onb1-17 proxy wire: workspace, auth, API, checkout and asset paths are never redirected", () => {
  for (const p of ["/admin", "/admin/site", "/login", "/api/x", "/_next/static/a.js", "/_page-not-found", "/pay/abc", "/c/123", "/account", "/robots.txt", "/manage/tok"]) {
    assert.equal(freeSubdomainRedirectablePath(p), false, p);
  }
  for (const p of ["/", "/menu", "/services/cut", "/contact", "/cases"]) {
    assert.equal(freeSubdomainRedirectablePath(p), true, p);
  }
});

test("onb1-17: Free subdomain redirects to the path-canonical /w URL", () => {
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "qa-grok-salon.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "free",
    }),
    "https://tulala.digital/w/qa-grok-salon",
  );
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "qa-grok-salon.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "free",
      pathname: "/menu",
      search: "?x=1",
    }),
    "https://tulala.digital/w/qa-grok-salon/menu?x=1",
  );
});

test("onb1-17: paid / mismatched hosts do not path-redirect", () => {
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "qa-grok-salon.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "studio",
    }),
    null,
  );
  assert.equal(
    freeSubdomainToPathRedirectUrl({
      hostname: "other.tulala.digital",
      tenantSlug: "qa-grok-salon",
      planTier: "free",
    }),
    null,
  );
});

test("marketing /{slug}/admin redirects to the app origin", () => {
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "marketing",
      canonicalPath: "/impronta/admin",
    }),
    true,
  );
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "marketing",
      canonicalPath: "/impronta/admin/roster",
    }),
    true,
  );
});

test("unknown marketing paths and non-marketing hosts do not redirect", () => {
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "marketing",
      canonicalPath: "/pricing",
    }),
    false,
  );
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "app",
      canonicalPath: "/impronta/admin",
    }),
    false,
  );
  assert.equal(
    shouldRedirectMarketingWorkspacePath({
      hostKind: "agency",
      canonicalPath: "/impronta/admin",
    }),
    false,
  );
});
