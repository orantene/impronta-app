import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parsePostBlocks,
  postWordCount,
  readingMinutes,
  type PostBlock,
} from "./post-blocks";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

const valid: Record<string, unknown> = {
  paragraph: { id: "a", type: "paragraph", text: "Hello world" },
  heading: { id: "b", type: "heading", text: "Title", level: 2 },
  list: { id: "c", type: "list", ordered: true, items: ["one", "two"] },
  image: { id: "d", type: "image", url: "https://x.test/a.jpg", alt: "alt", caption: "cap" },
  gallery: { id: "e", type: "gallery", images: [{ url: "https://x.test/a.jpg", alt: "a" }] },
  quote: { id: "f", type: "quote", text: "Wise", cite: "Me" },
  video: { id: "g", type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  divider: { id: "h", type: "divider" },
  service: { id: "i", type: "service", offering_id: UUID },
  book_button: { id: "j", type: "book_button", label: "Book now", offering_id: UUID },
  faq: { id: "k", type: "faq", question: "Q?", answer: "A." },
};

const invalid: Record<string, unknown> = {
  paragraph: { id: "a", type: "paragraph" },
  heading: { id: "b", type: "heading", text: "T", level: 4 },
  list: { id: "c", type: "list", ordered: "yes", items: [] },
  image: { id: "d", type: "image", url: "javascript:alert(1)", alt: "x" },
  gallery: { id: "e", type: "gallery", images: [] },
  quote: { id: "f", type: "quote" },
  video: { id: "g", type: "video", url: "https://evil.test/v" },
  divider: { type: "divider" },
  service: { id: "i", type: "service", offering_id: "not-a-uuid" },
  book_button: { id: "j", type: "book_button", offering_id: "nope" },
  faq: { id: "k", type: "faq", question: "Q only" },
};

for (const type of Object.keys(valid)) {
  test(`${type}: valid parses`, () => {
    const out = parsePostBlocks([valid[type]]);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, type);
  });
  test(`${type}: invalid is dropped`, () => {
    assert.deepEqual(parsePostBlocks([invalid[type]]), []);
  });
}

test("non-array input yields []", () => {
  assert.deepEqual(parsePostBlocks(null), []);
  assert.deepEqual(parsePostBlocks({}), []);
  assert.deepEqual(parsePostBlocks("x"), []);
});

test("one bad block does not drop the good ones", () => {
  const out = parsePostBlocks([valid.paragraph, invalid.quote, valid.divider]);
  assert.deepEqual(out.map((b) => b.type), ["paragraph", "divider"]);
});

test("service strips a price prop", () => {
  const out = parsePostBlocks([{ ...(valid.service as object), price: 999, amount_cents: 5 }]);
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ["id", "offering_id", "type"]);
});

test("video accepts YouTube and Vimeo only", () => {
  const ok = [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://vimeo.com/123456789",
    "https://player.vimeo.com/video/123456789",
  ];
  for (const url of ok) {
    assert.equal(parsePostBlocks([{ id: "v", type: "video", url }]).length, 1, url);
  }
  const bad = [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://dailymotion.com/video/x1",
    "https://vimeo.com/",
  ];
  for (const url of bad) {
    assert.equal(parsePostBlocks([{ id: "v", type: "video", url }]).length, 0, url);
  }
});

test("word count and reading minutes", () => {
  const blocks: PostBlock[] = parsePostBlocks([
    { id: "1", type: "paragraph", text: Array(250).fill("w").join(" ") },
    { id: "2", type: "list", ordered: false, items: ["a b", "c"] },
    { id: "3", type: "image", url: "https://x.test/a.jpg", alt: "ignored words here" },
  ]);
  assert.equal(postWordCount(blocks), 253);
  assert.equal(readingMinutes(blocks), 2);
  assert.equal(readingMinutes([]), 0);
  assert.equal(readingMinutes(parsePostBlocks([valid.paragraph])), 1);
});
