import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePostBlocks } from "./post-blocks";
import { buildFaqPageJsonLd } from "./post-faq-jsonld";

test("no faq blocks yields null", () => {
  assert.equal(buildFaqPageJsonLd([]), null);
  assert.equal(
    buildFaqPageJsonLd(parsePostBlocks([{ id: "a", type: "paragraph", text: "hi" }])),
    null,
  );
});

test("blank question or answer yields null", () => {
  const blocks = parsePostBlocks([
    { id: "a", type: "faq", question: "  ", answer: "A" },
    { id: "b", type: "faq", question: "Q", answer: " " },
  ]);
  assert.equal(buildFaqPageJsonLd(blocks), null);
});

test("two faq blocks make one FAQPage with two entities", () => {
  const blocks = parsePostBlocks([
    { id: "a", type: "faq", question: "Q1?", answer: "A1" },
    { id: "p", type: "paragraph", text: "between" },
    { id: "b", type: "faq", question: "Q2?", answer: "A2" },
  ]);
  const ld = buildFaqPageJsonLd(blocks);
  assert.ok(ld);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, 2);
  assert.equal(ld.mainEntity[1].name, "Q2?");
  assert.equal(ld.mainEntity[1].acceptedAnswer.text, "A2");
});
