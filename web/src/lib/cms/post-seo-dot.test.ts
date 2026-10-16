import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostBlock } from "@/lib/cms/post-blocks";
import { evaluatePostSeo, type PostSeoInput } from "@/lib/cms/post-seo-dot";

const OFFERING = "11111111-1111-4111-8111-111111111111";

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `palabra${i}`).join(" ");
}

function goodInput(): PostSeoInput {
  return {
    title: "Cómo cuidar tus uñas en verano con gel",
    metaDescription: "Consejos simples para que tu manicure dure más.",
    coverImageUrl: "https://example.com/cover.jpg",
    coverImageAlt: "Manos con uñas en gel",
    blocks: [
      { id: "a", type: "paragraph", text: words(320) },
      { id: "b", type: "service", offering_id: OFFERING },
      { id: "c", type: "image", url: "https://example.com/a.jpg", alt: "Uñas" },
    ],
  };
}

function failingIds(input: PostSeoInput) {
  return evaluatePostSeo(input).failing;
}

test("a complete post is green with six passing checks", () => {
  const r = evaluatePostSeo(goodInput());
  assert.equal(r.level, "green");
  assert.equal(r.checks.length, 6);
  assert.deepEqual(r.failing, []);
});

test("title: too short or too long fails, meta title overrides the post title", () => {
  assert.deepEqual(failingIds({ ...goodInput(), title: "Corto" }), ["title"]);
  assert.deepEqual(failingIds({ ...goodInput(), title: "x".repeat(61) }), ["title"]);
  assert.deepEqual(failingIds({ ...goodInput(), title: "Corto", metaTitle: "Un título para Google del tamaño ideal" }), []);
});

test("description: missing or over 160 characters fails", () => {
  assert.deepEqual(failingIds({ ...goodInput(), metaDescription: "  " }), ["description"]);
  assert.deepEqual(failingIds({ ...goodInput(), metaDescription: "d".repeat(161) }), ["description"]);
});

test("cover: missing fails", () => {
  assert.deepEqual(failingIds({ ...goodInput(), coverImageUrl: null, coverImageAlt: null }), ["cover"]);
});

test("words: 299 fails, 300 passes", () => {
  const base = goodInput();
  const blocks = (n: number): PostBlock[] => [
    { id: "a", type: "paragraph", text: words(n) },
    { id: "b", type: "service", offering_id: OFFERING },
  ];
  assert.deepEqual(failingIds({ ...base, blocks: blocks(299) }), ["words"]);
  assert.deepEqual(failingIds({ ...base, blocks: blocks(300) }), []);
});

test("service link: a service block, a book button with a service, or the related service passes", () => {
  const noService: PostBlock[] = [{ id: "a", type: "paragraph", text: words(320) }];
  assert.deepEqual(failingIds({ ...goodInput(), blocks: noService }), ["service"]);
  assert.deepEqual(failingIds({ ...goodInput(), blocks: noService, relatedOfferingId: OFFERING }), []);
  const book: PostBlock[] = [...noService, { id: "b", type: "book_button", offering_id: OFFERING }];
  assert.deepEqual(failingIds({ ...goodInput(), blocks: book }), []);
  const bookNoService: PostBlock[] = [...noService, { id: "b", type: "book_button" }];
  assert.deepEqual(failingIds({ ...goodInput(), blocks: bookNoService }), ["service"]);
});

test("alts: image, gallery image and cover alt must be present", () => {
  const withBlock = (extra: PostBlock): PostSeoInput => ({
    ...goodInput(),
    blocks: [...goodInput().blocks, extra],
  });
  assert.deepEqual(failingIds(withBlock({ id: "x", type: "image", url: "https://e.com/x.jpg", alt: " " })), ["alts"]);
  assert.deepEqual(
    failingIds(withBlock({ id: "x", type: "gallery", images: [{ url: "https://e.com/x.jpg", alt: "ok" }, { url: "https://e.com/y.jpg", alt: "" }] })),
    ["alts"],
  );
  assert.deepEqual(failingIds({ ...goodInput(), coverImageAlt: "" }), ["alts"]);
});

test("level: one or two failures is yellow, three or more is red", () => {
  assert.equal(evaluatePostSeo({ ...goodInput(), coverImageUrl: null }).level, "yellow");
  const two = evaluatePostSeo({ ...goodInput(), coverImageUrl: null, metaDescription: "" });
  assert.equal(two.level, "yellow");
  const empty = evaluatePostSeo({ title: "", blocks: [] });
  assert.equal(empty.level, "red");
  assert.equal(empty.failing.length, 5); // alts passes when there are no images
});
