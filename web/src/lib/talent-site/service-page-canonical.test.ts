import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { servicePageCanonical } from "./service-page-canonical";

describe("servicePageCanonical (C1: free plans keep their old pages, canonical to the main page)", () => {
  it("flag off: the service page is its own canonical (today)", () => {
    assert.deepEqual(servicePageCanonical({ flagOn: false, planKey: "talent_basic", servicePath: "/servicio-x-1a2b3c4d" }), {
      path: "/servicio-x-1a2b3c4d",
      duplicate: false,
    });
  });
  it("flag on, free talent: still rendered, canonical to the main page", () => {
    assert.deepEqual(servicePageCanonical({ flagOn: true, planKey: "talent_basic", servicePath: "/servicio-x-1a2b3c4d" }), { path: "/", duplicate: true });
    assert.deepEqual(servicePageCanonical({ flagOn: true, planKey: null, servicePath: "/servicio-x-1a2b3c4d" }), { path: "/", duplicate: true });
  });
  it("flag on, paid talent: own canonical", () => {
    for (const k of ["talent_pro", "talent_portfolio"]) {
      assert.deepEqual(servicePageCanonical({ flagOn: true, planKey: k, servicePath: "/servicio-x-1a2b3c4d" }), { path: "/servicio-x-1a2b3c4d", duplicate: false });
    }
  });
});

describe("render-max-site wiring (static)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"), "utf8");
  it("resolves service slugs with history and returns a redirect result", () => {
    assert.match(src, /resolveServiceSlugWithHistory\(inLocale, input\.pageSlug, serviceContent\)/);
    assert.match(src, /return \{ kind: "redirect", slug: resolvedService\.slug \}/);
  });
  it("free-plan duplicates get the main page as canonical and no Service JSON-LD", () => {
    assert.match(src, /servicePageCanonical\(\{/);
    assert.match(src, /serviceCanonical\?\.duplicate \? \{ \.\.\.serviced, jsonLd: undefined \} : serviced/);
  });
  it("the talent routes follow the redirect", () => {
    for (const f of ["src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx", "src/app/t/site/[siteSlug]/[pageSlug]/page.tsx"]) {
      assert.match(readFileSync(join(process.cwd(), f), "utf8"), /if \(result\.kind === "redirect"\) permanentRedirect\(/, f);
    }
  });
});
