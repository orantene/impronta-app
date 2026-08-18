import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeWebsiteStateFromBridge } from "./fixtures";
import type { WebsiteData, WebsitePageItem } from "@/app/(workspace)/[tenantSlug]/_data-bridge/website";
import type { WorkspaceDomainSummary } from "@/app/(workspace)/[tenantSlug]/_data-bridge/workspace-config";

/**
 * P1-B — merge-projection test for `mergeWebsiteStateFromBridge`'s pages
 * pipeline (data-bridge WebsitePageItem -> shell-state WebsitePageRow).
 * Pure function, fed a fake bridge `WebsiteData` — no Supabase, no
 * `server-only` import in the runtime graph (only type-only imports of the
 * bridge module, which tsx/esbuild strip before this file ever needs to
 * resolve `@/lib/supabase/server`).
 */

const emptyDomainSummary: WorkspaceDomainSummary = {
  primaryHost: null,
  primaryHostKind: null,
  primaryHostStatus: null,
  subdomainHost: null,
  customDomainHost: null,
  customDomainStatus: null,
  customDomainVerifiedAt: null,
  verificationToken: null,
  failureReason: null,
  customDomains: [],
  subdomains: [],
};

function page(overrides: Partial<WebsitePageItem>): WebsitePageItem {
  return {
    id: "id",
    slug: "slug",
    title: "Title",
    status: "published",
    updatedAt: "2026-08-01T00:00:00.000Z",
    updatedBy: null,
    templateKey: "blank",
    scheduledPublishAt: null,
    locale: "en",
    version: 1,
    noindex: false,
    includeInSitemap: true,
    hasMetaDescription: false,
    publishedAt: null,
    systemTemplateKey: null,
    ...overrides,
  };
}

function bridgeData(overrides: Partial<WebsiteData>): WebsiteData {
  return {
    pages: [],
    posts: [],
    redirects: [],
    seoTitle: null,
    seoDescription: null,
    tenantName: null,
    domainSummary: emptyDomainSummary,
    analytics: {
      refreshedAt: "2026-08-01T00:00:00.000Z",
      last7d: { visits: 0, topPages: [], topReferrers: [] },
      last30d: { visits: 0, topPages: [], topReferrers: [] },
    },
    conversion: {
      last7d: { inquiries: 0, bookings: 0, revenue: 0 },
      last30d: { inquiries: 0, bookings: 0, revenue: 0 },
    },
    homeSlug: null,
    directorySlug: null,
    notFoundSlug: null,
    defaultLocale: "en",
    ...overrides,
  };
}

test("projects locale/version/noindex/includeInSitemap/hasMetaDescription/publishedAt straight through", () => {
  const data = bridgeData({
    pages: [
      page({
        id: "p1",
        slug: "roster",
        locale: "es",
        version: 7,
        noindex: true,
        includeInSitemap: false,
        hasMetaDescription: true,
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
    ],
  });
  const state = mergeWebsiteStateFromBridge(data, "acme");
  const row = state.pages.find((p) => p.id === "p1")!;
  assert.equal(row.locale, "es");
  assert.equal(row.version, 7);
  assert.equal(row.noindex, true);
  assert.equal(row.includeInSitemap, false);
  assert.equal(row.hasMetaDescription, true);
  assert.equal(row.publishedAt, "2026-01-01T00:00:00.000Z");
});

test("hasMetaDescription false + published_at null round-trip as falsy, not swallowed into a default", () => {
  const data = bridgeData({
    pages: [page({ id: "p1", slug: "draft-page", hasMetaDescription: false, publishedAt: null })],
  });
  const row = mergeWebsiteStateFromBridge(data, "acme").pages[0]!;
  assert.equal(row.hasMetaDescription, false);
  assert.equal(row.publishedAt, undefined);
});

test("isHomepage true when the row's slug matches the assigned home page-role", () => {
  const data = bridgeData({
    homeSlug: "landing",
    pages: [
      page({ id: "p1", slug: "landing", systemTemplateKey: null }),
      page({ id: "p2", slug: "roster", systemTemplateKey: null }),
    ],
  });
  const state = mergeWebsiteStateFromBridge(data, "acme");
  assert.equal(state.pages.find((p) => p.id === "p1")!.isHomepage, true);
  assert.equal(state.pages.find((p) => p.id === "p2")!.isHomepage, false);
});

test("isHomepage falls back to system_template_key === 'homepage' when no role is assigned", () => {
  const data = bridgeData({
    homeSlug: null,
    pages: [
      page({ id: "p1", slug: "", systemTemplateKey: "homepage" }),
      page({ id: "p2", slug: "roster", systemTemplateKey: null }),
    ],
  });
  const state = mergeWebsiteStateFromBridge(data, "acme");
  assert.equal(state.pages.find((p) => p.id === "p1")!.isHomepage, true);
  assert.equal(state.pages.find((p) => p.id === "p2")!.isHomepage, false);
});

test("an assigned home role overrides the built-in system_template_key convention", () => {
  // A tenant reassigns `/` to a different page — the OLD homepage row
  // (system_template_key = 'homepage') must stop reading as isHomepage.
  const data = bridgeData({
    homeSlug: "new-landing",
    pages: [
      page({ id: "p1", slug: "", systemTemplateKey: "homepage" }),
      page({ id: "p2", slug: "new-landing", systemTemplateKey: null }),
    ],
  });
  const state = mergeWebsiteStateFromBridge(data, "acme");
  assert.equal(state.pages.find((p) => p.id === "p1")!.isHomepage, false);
  assert.equal(state.pages.find((p) => p.id === "p2")!.isHomepage, true);
});

test("hits7d/hits30d are null-honest: a slug absent from topPages stays undefined, not 0", () => {
  const data = bridgeData({
    pages: [
      page({ id: "p1", slug: "roster" }),
      page({ id: "p2", slug: "not-in-top-8" }),
    ],
    analytics: {
      refreshedAt: "2026-08-01T00:00:00.000Z",
      last7d: {
        visits: 100,
        topPages: [{ pageSlug: "/roster", pageId: "p1", surfaces: [], visits: 42 }],
        topReferrers: [],
      },
      last30d: {
        visits: 400,
        topPages: [{ pageSlug: "/roster", pageId: "p1", surfaces: [], visits: 180 }],
        topReferrers: [],
      },
    },
  });
  const state = mergeWebsiteStateFromBridge(data, "acme");
  const roster = state.pages.find((p) => p.id === "p1")!;
  const missing = state.pages.find((p) => p.id === "p2")!;
  assert.equal(roster.hits7d, 42);
  assert.equal(roster.hits30d, 180);
  // NOT 0 — absence from the top-8 projection is unknown, not zero.
  assert.equal(missing.hits7d, undefined);
  assert.equal(missing.hits30d, undefined);
});
