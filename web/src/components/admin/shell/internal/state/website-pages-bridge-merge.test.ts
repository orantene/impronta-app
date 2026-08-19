import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeWebsiteStateFromBridge } from "./fixtures";
import type { TeamMember } from "./types";
import type {
  WebsiteData,
  WebsitePageItem,
  WebsitePostItem,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/website";
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
      prior7dVisits: 0,
      visitsByDay30: [],
    },
    conversion: {
      last7d: { inquiries: 0, bookings: 0, revenue: 0 },
      last30d: { inquiries: 0, bookings: 0, revenue: 0 },
      prior7d: { inquiries: 0, bookings: 0, revenue: 0 },
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

// ── W2 — honest analytics projection ─────────────────────────────────────────

test("last7d gets a REAL prior (visits from the loader, money from conversion.prior7d); last30d prior is null", () => {
  const data = bridgeData({
    analytics: {
      refreshedAt: "2026-08-01T00:00:00.000Z",
      last7d: { visits: 100, topPages: [], topReferrers: [] },
      last30d: { visits: 400, topPages: [], topReferrers: [] },
      prior7dVisits: 80,
      visitsByDay30: [],
    },
    conversion: {
      last7d: { inquiries: 5, bookings: 2, revenue: 1200 },
      last30d: { inquiries: 20, bookings: 9, revenue: 5400 },
      prior7d: { inquiries: 4, bookings: 1, revenue: 700 },
    },
  });
  const analytics = mergeWebsiteStateFromBridge(data, "acme").analytics;
  assert.deepEqual(analytics.last7d.prior, {
    visits: 80,
    inquiries: 4,
    bookings: 1,
    revenue: 700,
  });
  // No 30d baseline exists (that needs a 60d scan) — null, NEVER a fake zero.
  assert.equal(analytics.last30d.prior, null);
  assert.equal(analytics.last7d.visits, 100);
  assert.equal(analytics.last30d.revenue, 5400);
});

test("byPage rows carry pageSlug + surfaces and NO fabricated per-page conversions", () => {
  const data = bridgeData({
    pages: [page({ id: "p1", slug: "roster" })],
    analytics: {
      refreshedAt: "2026-08-01T00:00:00.000Z",
      last7d: {
        visits: 42,
        topPages: [
          { pageSlug: "/roster", pageId: null, surfaces: ["storefront", "talent_site"], visits: 42 },
        ],
        topReferrers: [],
      },
      last30d: { visits: 42, topPages: [], topReferrers: [] },
      prior7dVisits: 0,
      visitsByDay30: [],
    },
  });
  const analytics = mergeWebsiteStateFromBridge(data, "acme").analytics;
  const row = analytics.byPage7d[0]!;
  // pageId resolves through the slug → cms_pages map when the loader had none.
  assert.equal(row.pageId, "p1");
  assert.equal(row.pageSlug, "/roster");
  assert.deepEqual(row.surfaces, ["storefront", "talent_site"]);
  assert.equal(row.visits, 42);
  assert.ok(!("inquiries" in row), "per-page inquiries no longer exist in the shape");
  assert.ok(!("bookings" in row), "per-page bookings no longer exist in the shape");
});

test("visitsByDay passes straight through from the loader's 30d day buckets", () => {
  const days = [
    { date: "2026-07-31", visits: 3 },
    { date: "2026-08-01", visits: 0 },
  ];
  const data = bridgeData({
    analytics: {
      refreshedAt: "2026-08-01T00:00:00.000Z",
      last7d: { visits: 3, topPages: [], topReferrers: [] },
      last30d: { visits: 3, topPages: [], topReferrers: [] },
      prior7dVisits: 0,
      visitsByDay30: days,
    },
  });
  assert.deepEqual(mergeWebsiteStateFromBridge(data, "acme").analytics.visitsByDay, days);
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
      prior7dVisits: 0,
      visitsByDay30: [],
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

// ── W3: posts projection (data-bridge WebsitePostItem -> shell WebsitePost) ──

function post(overrides: Partial<WebsitePostItem>): WebsitePostItem {
  return {
    id: "po1",
    slug: "spring-drop",
    title: "Spring drop",
    status: "draft",
    updatedAt: "2026-08-01T00:00:00.000Z",
    locale: "en",
    hasExcerpt: false,
    publishedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function member(id: string, name: string): TeamMember {
  return {
    id,
    name,
    email: `${id}@example.com`,
    role: "admin",
    status: "active",
    initials: name.slice(0, 2).toUpperCase(),
  };
}

test("posts project locale/hasExcerpt/publishedAt straight through, slug gains a leading slash", () => {
  const data = bridgeData({
    posts: [
      post({
        id: "po1",
        slug: "bts-vogue",
        locale: "es",
        hasExcerpt: true,
        status: "published",
        publishedAt: "2026-07-01T00:00:00.000Z",
      }),
    ],
  });
  const row = mergeWebsiteStateFromBridge(data, "acme").posts[0]!;
  assert.equal(row.slug, "/bts-vogue");
  assert.equal(row.locale, "es");
  assert.equal(row.hasExcerpt, true);
  assert.equal(row.status, "published");
  assert.equal(row.publishedAt, "2026-07-01T00:00:00.000Z");
});

test("post status maps every enum value; unknown values collapse to draft", () => {
  const data = bridgeData({
    posts: [
      post({ id: "a", status: "published" }),
      post({ id: "b", status: "draft" }),
      post({ id: "c", status: "archived" }),
      post({ id: "d", status: "garbage" }),
    ],
  });
  const state = mergeWebsiteStateFromBridge(data, "acme");
  assert.equal(state.posts.find((p) => p.id === "a")!.status, "published");
  assert.equal(state.posts.find((p) => p.id === "b")!.status, "draft");
  assert.equal(state.posts.find((p) => p.id === "c")!.status, "archived");
  assert.equal(state.posts.find((p) => p.id === "d")!.status, "draft");
});

test("post updatedBy resolves to a member display name the way pages do; unresolvable stays empty", () => {
  const joana = member("uuid-joana", "Joana Rivera");
  const data = bridgeData({
    posts: [
      post({ id: "a", updatedBy: "uuid-joana" }),
      post({ id: "b", updatedBy: "uuid-gone" }),
      post({ id: "c", updatedBy: null }),
    ],
  });
  const state = mergeWebsiteStateFromBridge(data, "acme", [joana]);
  assert.equal(state.posts.find((p) => p.id === "a")!.lastEditedBy, "Joana Rivera");
  // A member who left, or no editor recorded, renders NOTHING — never a UUID.
  assert.equal(state.posts.find((p) => p.id === "b")!.lastEditedBy, "");
  assert.equal(state.posts.find((p) => p.id === "c")!.lastEditedBy, "");
});

test("a draft post's publishedAt stays undefined — no fixture-era fabrication from updatedAt", () => {
  const data = bridgeData({
    posts: [post({ id: "a", status: "draft", publishedAt: null })],
  });
  assert.equal(mergeWebsiteStateFromBridge(data, "acme").posts[0]!.publishedAt, undefined);
});
