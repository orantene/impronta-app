/**
 * TUL-543 / TUL-347: "Edit my site" for a business owner must land on the live
 * storefront editor (?edit=1, which follows the locale cookie so ES stays ES),
 * and fall back to the admin Website overview only when it cannot resolve.
 * Never to the talent entry itself (a redirect loop).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  resolveEditSiteRedirect,
  resolveMyWebsiteTarget,
  workspaceSiteBuilderHref,
} from "./my-website-target";

const base = {
  ownsBusinessWorkspace: true,
  hasWorkspaceSite: true,
  workspaceSlug: "maison",
  hasPersonalSite: false,
};

test("page-builder redirects to the resolved editor URL first, admin overview second", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/page-builder/page.tsx"),
    "utf8",
  );
  assert.match(src, /resolveWorkspaceSiteEditorUrl\(probe,/);
  assert.match(src, /redirect\(editorUrl \?\? workspaceHref\)/);
});

test("the fallback is the workspace admin overview, never the talent entry", () => {
  const href = resolveEditSiteRedirect(base);
  assert.equal(href, workspaceSiteBuilderHref("maison"));
  assert.ok(!href?.startsWith("/talent/"));
  assert.equal(resolveMyWebsiteTarget(base).href, "/talent/page-builder");
});

test("a talent without a business workspace stays on the in-page editor", () => {
  assert.equal(resolveEditSiteRedirect({ ...base, ownsBusinessWorkspace: false }), null);
});
