import test from "node:test";
import assert from "node:assert/strict";

import {
  groupTopPages,
  groupTopReferrers,
  normalizeReferrer,
  type SitePageViewRow,
} from "@/lib/analytics/website-analytics-group";

function row(
  payload: Record<string, unknown> | null,
  path: string | null = null,
  created_at = "2026-06-17T00:00:00.000Z",
): SitePageViewRow {
  return { created_at, path, payload };
}

test("groupTopPages: groups by page_slug and ranks by visit count", () => {
  const rows: SitePageViewRow[] = [
    row({ page_slug: "/about", page_id: "p2", surface: "storefront" }),
    row({ page_slug: "/about", surface: "storefront" }),
    row({ page_slug: "/about", surface: "talent-site" }),
    row({ page_slug: "/", page_id: "p1", surface: "storefront" }),
    row({ page_slug: "/", surface: "storefront" }),
    row({ page_slug: "/contact", surface: "talent-profile" }),
  ];

  const top = groupTopPages(rows);
  assert.equal(top.length, 3);

  // /about is the most-visited slug (3), then / (2), then /contact (1).
  assert.equal(top[0].pageSlug, "/about");
  assert.equal(top[0].visits, 3);
  // page_id is carried from the first row that had one.
  assert.equal(top[0].pageId, "p2");
  // Distinct surfaces are collected.
  assert.deepEqual(top[0].surfaces.sort(), ["storefront", "talent-site"]);

  assert.equal(top[1].pageSlug, "/");
  assert.equal(top[1].visits, 2);
  assert.equal(top[1].pageId, "p1");

  assert.equal(top[2].pageSlug, "/contact");
  assert.equal(top[2].visits, 1);
});

test("groupTopPages: falls back to path then '/' when page_slug is absent", () => {
  const rows: SitePageViewRow[] = [
    row(null, "/from-path"),
    row({ surface: "storefront" }, null),
  ];
  const top = groupTopPages(rows);
  const slugs = top.map((t) => t.pageSlug).sort();
  assert.deepEqual(slugs, ["/", "/from-path"]);
});

test("groupTopPages: respects the limit", () => {
  const rows: SitePageViewRow[] = Array.from({ length: 12 }, (_, i) =>
    row({ page_slug: `/p${i}` }),
  );
  assert.equal(groupTopPages(rows, 5).length, 5);
});

test("groupTopReferrers: groups by referrer host, ranks by count, 'direct' when absent", () => {
  const rows: SitePageViewRow[] = [
    row({ referrer: "https://www.google.com/search?q=x" }),
    row({ referrer: "https://www.google.com/imghp" }),
    row({ referrer: "https://t.co/abc" }),
    row({}), // no referrer → direct
    row({ referrer: "" }), // empty → direct
  ];

  const top = groupTopReferrers(rows);
  const byKey = new Map(top.map((t) => [t.referrer, t.visits]));

  // Both google.com URLs collapse to the host and group together.
  assert.equal(byKey.get("www.google.com"), 2);
  assert.equal(byKey.get("t.co"), 1);
  // Two rows with no/empty referrer roll up under "direct".
  assert.equal(byKey.get("direct"), 2);

  // Ranked descending: google.com (2) and direct (2) lead t.co (1).
  assert.equal(top[top.length - 1].referrer, "t.co");
});

test("normalizeReferrer: host extraction + direct fallback", () => {
  assert.equal(normalizeReferrer("https://example.com/path?x=1"), "example.com");
  assert.equal(normalizeReferrer("example.com/path"), "example.com");
  assert.equal(normalizeReferrer(""), "direct");
  assert.equal(normalizeReferrer(null), "direct");
  assert.equal(normalizeReferrer(undefined), "direct");
});
