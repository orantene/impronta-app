import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildChangelogFeed } from "./feed";
import {
  categoriesOf,
  filterByCategory,
  isChangelogPublicLaunch,
  safeImageUrl,
  shareText,
  toEntryView,
  viewEntries,
  type ChangelogRow,
} from "./public-read";

function row(over: Partial<ChangelogRow> = {}): ChangelogRow {
  return {
    notion_page_id: "p1",
    status: "published",
    kind: "Weekly changelog",
    release_date: "2026-10-13",
    tier: 2,
    badge: "New",
    title_en: "Promos fill your week",
    title_es: "Promos para llenar tu semana",
    summary_en: "Make a discount in 3 taps.",
    summary_es: "Crea un descuento en 3 toques.",
    body_en_html: "<p>Body EN</p>",
    body_es_html: "<p>Cuerpo ES</p>",
    audience: ["Talent"],
    plans: ["Paid"],
    categories: ["Promos"],
    help_url: "https://tulala.digital/help/articles/promos",
    cover_image_url: "https://x.supabase.co/storage/v1/object/public/changelog/a.png",
    published_at: "2026-10-14T12:00:00Z",
    ...over,
  };
}

test("TUL-1394: each locale gets its own title, summary and body", () => {
  const es = toEntryView(row(), "es");
  assert.equal(es.title, "Promos para llenar tu semana");
  assert.equal(es.bodyHtml, "<p>Cuerpo ES</p>");
  assert.equal(es.fellBack, false);
  assert.equal(toEntryView(row(), "en").title, "Promos fill your week");
});

test("TUL-1394: a missing translation falls back and says so", () => {
  const e = toEntryView(row({ title_es: "", summary_es: "", body_es_html: "" }), "es");
  assert.equal(e.title, "Promos fill your week");
  assert.equal(e.summary, "Make a discount in 3 taps.");
  assert.equal(e.fellBack, true);
});

test("TUL-1394: newest first, untitled rows dropped, category filter and list", () => {
  const rows = [
    row({ notion_page_id: "old", published_at: "2026-09-01T00:00:00Z", categories: ["Posts"] }),
    row({ notion_page_id: "new", published_at: "2026-10-20T00:00:00Z" }),
    row({ notion_page_id: "blank", title_en: "", title_es: "" }),
  ];
  const v = viewEntries(rows, "en");
  assert.deepEqual(v.map((e) => e.id), ["new", "old"]);
  assert.deepEqual(filterByCategory(v, "Posts").map((e) => e.id), ["old"]);
  assert.equal(filterByCategory(v, null).length, 2);
  assert.deepEqual(categoriesOf(v), ["Posts", "Promos"]);
});

test("TUL-1394: noindex until the launch flag flips", () => {
  assert.equal(isChangelogPublicLaunch({}), false);
  assert.equal(isChangelogPublicLaunch({ CHANGELOG_PUBLIC_LAUNCH: "0" }), false);
  assert.equal(isChangelogPublicLaunch({ CHANGELOG_PUBLIC_LAUNCH: "1" }), true);
  // Only the exact value "1" turns it on (TUL-1586): "true" and friends stay off.
  for (const v of ["true", "TRUE", "yes", "on", "2", ""]) {
    assert.equal(isChangelogPublicLaunch({ CHANGELOG_PUBLIC_LAUNCH: v }), false, v);
  }
  const views = readFileSync(join(process.cwd(), "src/components/marketing/changelog/changelog-views.tsx"), "utf8");
  assert.match(views, /index: false, follow: true/);
  const sitemap = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
  assert.match(sitemap, /changelogLive \? \["\/changelog", "\/novedades"\]/);
});

test("TUL-1394: only https images reach the page; share text carries the link", () => {
  assert.equal(safeImageUrl("javascript:alert(1)"), null);
  assert.equal(safeImageUrl("http://x.test/a.png"), null);
  assert.ok(safeImageUrl("https://x.test/a.png"));
  const t = shareText({ title: "Promos", summary: "Hazlo en 3 toques." }, "es", "https://tulala.digital/es/novedades/p1");
  assert.match(t, /^Novedad en Tulala: Promos\./);
  assert.ok(t.endsWith("https://tulala.digital/es/novedades/p1"));
});

test("TUL-1394: RSS escapes text and links entries per locale", () => {
  const entries = viewEntries([row({ title_en: "A & B <c>" })], "en");
  const xml = buildChangelogFeed(entries, "en", "https://tulala.digital");
  assert.match(xml, /<title>A &amp; B &lt;c&gt;<\/title>/);
  assert.match(xml, /<link>https:\/\/tulala\.digital\/changelog\/p1<\/link>/);
  assert.match(xml, /<pubDate>Wed, 14 Oct 2026/);
  const es = buildChangelogFeed(viewEntries([row()], "es"), "es", "https://tulala.digital");
  assert.match(es, /<language>es<\/language>/);
  assert.match(es, /\/es\/novedades\/p1/);
});

test("TUL-1394: no em dashes in the page copy", () => {
  const views = readFileSync(join(process.cwd(), "src/components/marketing/changelog/changelog-views.tsx"), "utf8");
  assert.ok(!views.includes("—"));
});
