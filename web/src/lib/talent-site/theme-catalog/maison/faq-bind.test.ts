import test from "node:test";
import assert from "node:assert/strict";

import {
  accordionBindsFaq,
  faqItemsToAccordionChildren,
  resolveFaqAccordionChildren,
} from "./faq-bind";

test("accordionBindsFaq recognises talent_faq_items only", () => {
  assert.equal(accordionBindsFaq({ bindSource: "talent_faq_items" }), true);
  assert.equal(accordionBindsFaq({}), false);
  assert.equal(accordionBindsFaq(null), false);
});

test("faqItemsToAccordionChildren maps question/answer", () => {
  const kids = faqItemsToAccordionChildren([
    { id: "a", question: "¿Cómo reservo?", answer: "Por la web." },
    { id: "b", question: "Empty answer", answer: "  " },
  ]);
  assert.equal(kids.length, 2);
  assert.equal(kids[0]!.kind, "accordion_item");
  assert.equal((kids[0]!.props as { title: string }).title, "¿Cómo reservo?");
  const c0 = "children" in kids[0]! && Array.isArray(kids[0]!.children) ? kids[0]!.children : [];
  const c1 = "children" in kids[1]! && Array.isArray(kids[1]!.children) ? kids[1]!.children : [];
  assert.equal(c0.length, 1);
  assert.equal(c1.length, 0);
});

test("resolveFaqAccordionChildren prefers live FAQ over authored", () => {
  const authored = [
    {
      id: "placeholder",
      kind: "accordion_item" as const,
      props: { title: "Placeholder" },
      children: [],
    },
  ];
  const live = resolveFaqAccordionChildren(authored, [
    { id: "1", question: "Live Q", answer: "Live A" },
  ]);
  assert.equal(live.length, 1);
  assert.equal((live[0]!.props as { title: string }).title, "Live Q");
  const fallback = resolveFaqAccordionChildren(authored, []);
  assert.equal((fallback[0]!.props as { title: string }).title, "Placeholder");
});
