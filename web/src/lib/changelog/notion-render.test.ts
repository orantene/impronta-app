import { test } from "node:test";
import assert from "node:assert/strict";

import {
  blocksToHtml,
  changelogStatus,
  coverImageSource,
  escapeHtml,
  imageExtension,
  imageStoragePath,
  mapReleasePage,
  parseTier,
  richTextToHtml,
  safeHref,
  splitBodyByLanguage,
  type NotionBlock,
  type NotionReleasePage,
} from "./notion-render";

const rt = (content: string, extra: Record<string, unknown> = {}) => ({ plain_text: content, ...extra });
const para = (id: string, content: string): NotionBlock => ({ id, type: "paragraph", paragraph: { rich_text: [rt(content)] } });
const heading = (id: string, content: string): NotionBlock => ({ id, type: "heading_1", heading_1: { rich_text: [rt(content)] } });

test("text is escaped and unsafe links are dropped", () => {
  assert.equal(escapeHtml(`<script>"x"&'y'</script>`), "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref(" https://tulala.digital/help "), "https://tulala.digital/help");
  assert.equal(safeHref("mailto:hello@tulala.digital"), "mailto:hello@tulala.digital");
  const html = richTextToHtml([rt("<b>hi</b>", { href: "javascript:x", annotations: { bold: true } })]);
  assert.equal(html, "<strong>&lt;b&gt;hi&lt;/b&gt;</strong>");
  const link = richTextToHtml([rt("go", { href: "https://a.b/?q=1&r=2" })]);
  assert.equal(link, '<a href="https://a.b/?q=1&amp;r=2" rel="noopener noreferrer">go</a>');
});

test("blocks render through an allow-list; unknown types and raw html never pass", () => {
  const blocks: NotionBlock[] = [
    heading("h", "Title"),
    para("p", "<img src=x onerror=alert(1)>"),
    { id: "b1", type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("one")] } },
    { id: "b2", type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("two")] } },
    { id: "n1", type: "numbered_list_item", numbered_list_item: { rich_text: [rt("first")] } },
    { id: "e", type: "embed", embed: { url: "https://evil" } },
    { id: "d", type: "divider", divider: {} },
  ];
  const html = blocksToHtml(blocks, new Map());
  assert.equal(
    html,
    "<h2>Title</h2><p>&lt;img src=x onerror=alert(1)&gt;</p><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><hr>",
  );
});

test("images render only from our storage copy, never Notion's expiring URL", () => {
  const img = (id: string): NotionBlock => ({
    id,
    type: "image",
    image: { type: "file", file: { url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.png?sig=1" }, caption: [rt("Promo card")] },
  });
  const withCopy = blocksToHtml([img("i1")], new Map([["i1", "https://cdn.example/changelog/p/i1.png"]]));
  assert.equal(
    withCopy,
    '<figure><img src="https://cdn.example/changelog/p/i1.png" alt="Promo card" loading="lazy"><figcaption>Promo card</figcaption></figure>',
  );
  assert.equal(blocksToHtml([img("i2")], new Map()), "");
  assert.equal(withCopy.includes("amazonaws"), false);
});

test("body splits by EN / ES headings and shares content before the first marker", () => {
  const blocks = [para("a", "shared"), heading("e", "EN"), para("b", "english"), heading("s", "Español"), para("c", "spanish")];
  const { en, es } = splitBodyByLanguage(blocks);
  assert.deepEqual(en.map((b) => b.id), ["a", "b"]);
  assert.deepEqual(es.map((b) => b.id), ["a", "c"]);
  const noMarkers = splitBodyByLanguage([para("x", "only")]);
  assert.equal(noMarkers.en.length, 1);
  assert.equal(noMarkers.es.length, 1);
});

const page = (props: Record<string, unknown>, extra: Partial<NotionReleasePage> = {}): NotionReleasePage => ({
  id: "page-1",
  last_edited_time: "2026-10-21T15:00:00.000Z",
  properties: props as NotionReleasePage["properties"],
  ...extra,
});

test("only Published and Paused entries map to rows", () => {
  assert.equal(changelogStatus(page({ Status: { status: { name: "Draft" } } })), null);
  assert.equal(changelogStatus(page({ Status: { status: { name: "Approved" } } })), null);
  assert.equal(changelogStatus(page({ Status: { status: { name: "Published" } } })), "published");
  assert.equal(changelogStatus(page({ Status: { status: { name: "Paused" } } })), "paused");
  assert.equal(mapReleasePage(page({ Status: { status: { name: "Draft" } } })), null);
});

test("maps Notion properties to row fields with Spanish falling back to English", () => {
  const row = mapReleasePage(
    page({
      Status: { status: { name: "Published" } },
      Release: { title: [rt("Week of 2026-10-19")] },
      Kind: { select: { name: "Weekly changelog" } },
      "Release ID": { rich_text: [rt("2026.10.21")] },
      "Release date": { date: { start: "2026-10-21" } },
      Tier: { select: { name: "2 Notable" } },
      Badge: { select: { name: "New" } },
      "Title EN": { rich_text: [rt("Share a promo in one tap")] },
      "Summary EN": { rich_text: [rt("Send it by WhatsApp.")] },
      Audience: { multi_select: [{ name: "Talent/Profesional" }, { name: "Business" }] },
      Plan: { multi_select: [{ name: "Paid" }] },
      Category: { multi_select: [{ name: "Marketing & SEO" }] },
      "Help article": { url: "javascript:alert(1)" },
      "Published at": { date: { start: "2026-10-21T14:00:00.000Z" } },
    }),
  );
  assert.ok(row);
  assert.equal(row.title_en, "Share a promo in one tap");
  assert.equal(row.title_es, "Share a promo in one tap");
  assert.equal(row.summary_es, "Send it by WhatsApp.");
  assert.equal(row.tier, 2);
  assert.deepEqual(row.audience, ["Talent/Profesional", "Business"]);
  assert.deepEqual(row.plans, ["Paid"]);
  assert.equal(row.help_url, null);
  assert.equal(row.published_at, "2026-10-21T14:00:00.000Z");
  assert.equal(row.notion_last_edited_at, "2026-10-21T15:00:00.000Z");
});

test("tier, cover and image helpers", () => {
  assert.equal(parseTier("3 Launch"), 3);
  assert.equal(parseTier("0 Internal"), 0);
  assert.equal(parseTier("9 nope"), null);
  assert.equal(parseTier(undefined), null);
  assert.equal(coverImageSource(page({ "Cover image": { files: [{ file: { url: "https://n/x.png" } }] } })), "https://n/x.png");
  assert.equal(coverImageSource(page({})), null);
  assert.equal(imageExtension("image/png"), "png");
  assert.equal(imageExtension("image/jpeg; charset=binary"), "jpg");
  assert.equal(imageExtension("image/svg+xml"), null);
  assert.equal(imageExtension("text/html"), null);
  assert.equal(imageStoragePath("3fe2c5ee-9743", "../cover", "png"), "3fe2c5ee-9743/cover.png");
});
