import test from "node:test";
import assert from "node:assert/strict";
import { prefixPathWorkspaceSitemap, prefixPathWorkspaceUrl } from "./path-workspace-sitemap";
import { resolveWorkspacePathTenantPublicPath } from "@/lib/saas/tenant-paths";

const P = "/w/acme";

test("TUL-591: /w/<slug>/sitemap.xml resolves to the tenant's /sitemap.xml", () => {
  assert.deepEqual(resolveWorkspacePathTenantPublicPath("/w/acme/sitemap.xml"), {
    tenantSlug: "acme",
    pathnameWithoutTenant: "/sitemap.xml",
  });
});

test("workspace prefix goes under the locale, never before the origin", () => {
  assert.equal(prefixPathWorkspaceUrl("https://tulala.digital/", P), "https://tulala.digital/w/acme");
  assert.equal(prefixPathWorkspaceUrl("https://tulala.digital/about", P), "https://tulala.digital/w/acme/about");
  assert.equal(prefixPathWorkspaceUrl("https://tulala.digital/es", P), "https://tulala.digital/es/w/acme");
  assert.equal(prefixPathWorkspaceUrl("https://tulala.digital/es/about", P), "https://tulala.digital/es/w/acme/about");
});

test("alternates are moved with their entry", () => {
  const out = prefixPathWorkspaceSitemap(
    [{ url: "https://tulala.digital/about", alternates: { languages: { en: "https://tulala.digital/about", es: "https://tulala.digital/es/about" } } }],
    P,
  );
  assert.equal(out[0].url, "https://tulala.digital/w/acme/about");
  assert.equal(out[0].alternates?.languages?.es, "https://tulala.digital/es/w/acme/about");
});
