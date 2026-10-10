import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  PERSONAL_SITE_BUILDER_HREF,
  resolveTalentDashboardMyWebsite,
} from "./dashboard-my-website";
import { resolveMyWebsiteTarget } from "./my-website-target";

const personalSite = {
  id: "s1",
  status: "published" as const,
  version: 1,
  draftUpdatedAt: "2026-01-01T00:00:00Z",
  publishedAt: "2026-01-01T00:00:00Z",
  unpublishedAt: null,
  hasPublishedSnapshot: true,
  planLocked: false,
  pendingTemplateReset: false,
  draftSnapshot: null,
};

test("dual owner: My website primary is the business workspace", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "https://jorg.tulala.digital",
    personalPublicSiteUrl: "https://jorg.tulala.digital",
    workspaceSite: {
      slug: "maison",
      publicUrl: "https://maison.tulala.digital",
      adminHref: "/maison/admin/website",
      tenantId: "t1",
    },
    site: personalSite,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "workspace");
  assert.equal(resolved.publicUrl, "https://maison.tulala.digital");
  assert.equal(resolved.editHref, "/maison/admin/website");
});

test("business-only: workspace still wins without a personal row", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "/t/TAL-93900",
    personalPublicSiteUrl: null,
    workspaceSite: {
      slug: "maison",
      publicUrl: "https://tulala.digital/w/maison",
      adminHref: "/maison/admin/website",
      tenantId: "t1",
    },
    site: null,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "workspace");
  assert.equal(resolved.editHref, "/maison/admin/website");
});

test("pure talent: personal site stays primary", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "https://jorg.tulala.digital",
    personalPublicSiteUrl: "https://jorg.tulala.digital",
    workspaceSite: null,
    site: personalSite,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "personal");
  assert.equal(resolved.editHref, "/talent/page-builder");
  assert.equal(resolved.personalStatus, "published");
});

test("hub-only fallback when personal is unpublished", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "/t/TAL-93900",
    personalPublicSiteUrl: null,
    workspaceSite: null,
    site: { ...personalSite, status: "draft", publishedAt: null, hasPublishedSnapshot: false },
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "hub");
  assert.equal(resolved.publicUrl, "/t/TAL-93900");
});

test("no site yet points at create", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: null,
    personalPublicSiteUrl: null,
    workspaceSite: null,
    site: null,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "create");
  assert.equal(resolved.editHref, "/talent/public-page");
});

test("personal builder escape hatch keeps ?site=personal", () => {
  assert.equal(PERSONAL_SITE_BUILDER_HREF, "/talent/page-builder?site=personal");
});

test("?site=personal is honored: dual owner stays on personal builder", () => {
  const qs = new URL(PERSONAL_SITE_BUILDER_HREF, "https://app.example").searchParams;
  assert.equal(qs.get("site"), "personal");
  // Same flag page-builder sets from `sp.site === "personal"`.
  const target = resolveMyWebsiteTarget({
    ownsBusinessWorkspace: true,
    hasWorkspaceSite: true,
    workspaceSlug: "maison",
    hasPersonalSite: true,
    explicitPersonal: qs.get("site") === "personal",
  });
  assert.equal(target.kind, "personal");
  assert.equal(target.href, "/talent/page-builder");
});

test("page-builder wires sp.site === personal to explicitPersonal", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/page-builder/page.tsx"),
    "utf8",
  );
  assert.match(src, /sp\.site\s*===\s*["']personal["']/);
  // Main probe uses resolveEditSiteRedirect (wraps resolveMyWebsiteTarget) and
  // object-shorthand `explicitPersonal` on the redirect input.
  assert.match(src, /explicitPersonal/);
  assert.match(src, /resolveEditSiteRedirect\(\{[\s\S]*explicitPersonal/);
  assert.match(src, /editSiteNeedsPersonalProbe\(\{[\s\S]*explicitPersonal/);
});
