/**
 * Reachability (the fourth layer): a route on disk that the host gate refuses
 * 404s before Next routing runs. Business service pages must pass the gate on
 * business hosts, only as two-segment paths whose slug carries the id8, and only
 * while the presentation flag is on. Everything else stays the CMS's
 * (`/services/photography` is a nested CMS page: clean-urls.test.ts).
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { isPathAllowedForHostKind } from "@/lib/saas/gate";
import { resolveCleanUrlRewriteTarget } from "@/lib/cms/clean-urls";

const FLAG = "SERVICE_PRESENTATION_RESOLVER_ENABLED";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env[FLAG];
});
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

const cmsRewrite = (p: string) =>
  resolveCleanUrlRewriteTarget({ hostKind: "agency", canonicalPath: p, isPathAllowed: (x) => isPathAllowedForHostKind("agency", x) });

describe("business service pages pass the host gate (TUL-1272 #5)", () => {
  it("flag OFF: identical to main, the CMS catch-all keeps every /services path", () => {
    delete process.env[FLAG];
    assert.equal(isPathAllowedForHostKind("agency", "/services/masaje-1a2b3c4d"), false);
    assert.equal(cmsRewrite("/servicios/masaje-1a2b3c4d"), "/p/servicios/masaje-1a2b3c4d");
  });

  it("flag ON: business (agency) hosts serve /services/<title>-<id8> and /servicios/<title>-<id8>", () => {
    process.env[FLAG] = "1";
    assert.equal(isPathAllowedForHostKind("agency", "/services/masaje-1a2b3c4d"), true);
    assert.equal(isPathAllowedForHostKind("agency", "/servicios/masaje-1a2b3c4d"), true);
    assert.equal(cmsRewrite("/servicios/masaje-1a2b3c4d"), null);
  });

  it("flag ON: a nested CMS page under /services (no id8) still rewrites to the CMS", () => {
    process.env[FLAG] = "1";
    // TUL-1594: a plain two-segment slug now reaches the business route as an old-slug candidate;
    // the route redirects an old service slug or hands it to the CMS page it always was.
    assert.equal(isPathAllowedForHostKind("agency", "/services/photography"), true);
    // The proxy no longer rewrites it; business-service-route.tsx renders the CMS page when no old slug matches.
    assert.equal(cmsRewrite("/services/photography"), null);
  });

  it("ruling 2026-10-19: business hosts only, never the hub; never other host kinds", () => {
    process.env[FLAG] = "1";
    assert.equal(isPathAllowedForHostKind("hub", "/servicios/masaje-1a2b3c4d"), false);
    assert.equal(isPathAllowedForHostKind("app", "/servicios/masaje-1a2b3c4d"), false);
    assert.equal(isPathAllowedForHostKind("marketing", "/services/masaje-1a2b3c4d"), false);
  });

  it("both route folders exist on disk", () => {
    for (const seg of ["services", "servicios"]) {
      assert.ok(existsSync(join(process.cwd(), `src/app/(public)/${seg}/[slug]/page.tsx`)), seg);
    }
  });
});
