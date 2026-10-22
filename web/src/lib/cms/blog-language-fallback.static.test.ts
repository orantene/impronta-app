/**
 * TUL-1399: static guards for the product blog's language handling and the
 * writer's summary / language / EN-ES link fields.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

test("post page redirects to the other language instead of 404 when only that language has the slug", () => {
  const src = read("src/app/(public)/blog/[slug]/page.tsx");
  assert.match(src, /supportedLocales\.includes\(other\)/);
  assert.match(src, /redirect\(postSiteHref\(site, blogPostPath\(slug\), other\)\)/);
});

test("blog index falls back to the other language when this one has no posts", () => {
  const src = read("src/app/(marketing)/blog/page.tsx");
  assert.match(src, /own\.length === 0 \? await listPublicPosts\(site\.scope, other\)/);
  assert.match(src, /otherLanguage/);
});

test("renderer turns list-like Texto lines into real lists", () => {
  const src = read("src/components/posts/PostBlocksRenderer.tsx");
  assert.match(src, /parseParagraphText\(block\.text\)/);
});

test("settings schema accepts excerpt, locale and translation_of", () => {
  const src = read("src/lib/cms/posts-writer.ts");
  assert.match(src, /excerpt: z\.string\(\)\.trim\(\)\.max\(1000\)/);
  assert.match(src, /locale: z\.enum\(\["en", "es"\]\)/);
  assert.match(src, /translation_of: nullableUuid/);
});

test("writer settings sheet has summary, language and translation fields with en and es copy", () => {
  const sheet = read("src/components/posts/writer/PostSettingsSheet.tsx");
  for (const key of ["fieldExcerpt", "fieldLanguage", "fieldTranslation"]) {
    assert.ok(sheet.includes(`dashboard.talentPosts.${key}`), `sheet uses ${key}`);
    for (const lang of ["en", "es"]) {
      const tp = (JSON.parse(read(`messages/${lang}.json`)) as { dashboard: { talentPosts: Record<string, string> } })
        .dashboard.talentPosts;
      assert.ok(typeof tp[key] === "string" && tp[key].length > 0, `${lang} has ${key}`);
    }
  }
});
