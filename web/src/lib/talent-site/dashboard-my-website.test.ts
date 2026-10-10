import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  isTalentDashboardWebsiteLive,
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

test("TUL-371 dual owner: live pill / My website primary is the business workspace", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "https://studio-2.tulala.digital",
    personalPublicSiteUrl: "https://studio-2.tulala.digital",
    workspaceSite: {
      slug: "studio",
      publicUrl: "https://studio.tulala.digital",
      adminHref: "/studio/admin/website",
      tenantId: "t1",
      isPublished: true,
    },
    site: personalSite,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "workspace");
  assert.equal(resolved.publicUrl, "https://studio.tulala.digital");
  assert.equal(resolved.editHref, "/studio/admin/website");
  assert.equal(resolved.workspacePublished, true);
  assert.equal(isTalentDashboardWebsiteLive("draft", resolved), true);
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
      isPublished: true,
    },
    site: null,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "workspace");
  assert.equal(resolved.editHref, "/maison/admin/website");
  assert.equal(resolved.workspacePublished, true);
});

test("TUL-371 draft-only workspace is NOT live; edit href still workspace", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "https://studio-2.tulala.digital",
    personalPublicSiteUrl: "https://studio-2.tulala.digital",
    workspaceSite: {
      slug: "studio",
      publicUrl: "https://studio.tulala.digital",
      adminHref: "/studio/admin/website",
      tenantId: "t1",
      isPublished: false,
    },
    site: { ...personalSite, status: "draft", publishedAt: null, hasPublishedSnapshot: false },
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.kind, "workspace");
  assert.equal(resolved.workspacePublished, false);
  assert.equal(resolved.publicUrl, null);
  assert.equal(resolved.editHref, "/studio/admin/website");
  // reward not published → pill must not say Sitio en vivo
  assert.equal(isTalentDashboardWebsiteLive("draft", resolved), false);
  assert.equal(isTalentDashboardWebsiteLive("notReady", resolved), false);
});

test("draft-only workspace: personal reward can still mark live (open personal URL)", () => {
  const resolved = resolveTalentDashboardMyWebsite({
    publicSiteUrl: "https://studio-2.tulala.digital",
    personalPublicSiteUrl: "https://studio-2.tulala.digital",
    workspaceSite: {
      slug: "studio",
      publicUrl: "https://studio.tulala.digital",
      adminHref: "/studio/admin/website",
      tenantId: "t1",
      isPublished: false,
    },
    site: personalSite,
    profileCode: "TAL-93900",
  });
  assert.equal(resolved.workspacePublished, false);
  assert.equal(resolved.publicUrl, null);
  assert.equal(isTalentDashboardWebsiteLive("published", resolved), true);
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
  assert.equal(resolved.workspacePublished, false);
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

test("WebsiteRewardControl prefers resolveTalentDashboardMyWebsite for the live pill", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/talent/website-reward/WebsiteRewardControl.tsx"),
    "utf8",
  );
  assert.match(src, /resolveTalentDashboardMyWebsite/);
  assert.match(src, /isTalentDashboardWebsiteLive/);
  assert.match(src, /myWebsite\.publicUrl|siteUrl/);
  // Must not treat any workspace kind as live without the published gate.
  assert.doesNotMatch(src, /isLive = reward === "published" \|\| myWebsite\?\.kind === "workspace"/);
});

test("workspace probe requires published for live; draft still counts as hasWorkspaceSite", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/workspace-site-context.ts"),
    "utf8",
  );
  assert.match(src, /hasPublishedWorkspaceSite/);
  assert.match(src, /\.eq\("status", "published"\)/);
  assert.match(src, /\.neq\("status", "archived"\)/);
});
