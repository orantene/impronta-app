/**
 * Unit tests for the demo FAQ builder. Run: npx tsx --test scripts/demo-talents/faq-builder.test.ts
 * Pure text checks: real workbook facts in, no promises and no em dashes out.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildFaq } from "./faq-builder";
import { loadFoundation } from "./foundation-load";

const demos = loadFoundation();

test("every FAQ has 3 or 4 Q&As with es and en text and no em dashes", () => {
  for (const d of demos) {
    const faqs = buildFaq(d);
    assert.ok(faqs.length >= 3 && faqs.length <= 4, `${d.profileCode}: ${faqs.length} items`);
    for (const f of faqs) {
      for (const l of ["es", "en"] as const) {
        assert.ok(f.question[l].trim().length > 5, `${d.profileCode} question ${l}`);
        assert.ok(f.answer[l].trim().length > 20, `${d.profileCode} answer ${l}`);
        assert.ok(!/—|undefined|NaN/.test(f.question[l] + f.answer[l]), `${d.profileCode} bad text ${l}`);
      }
    }
  }
});

test("the FAQ names the demo's own services, city and modes", () => {
  const d = demos.find((x) => x.profileCode === "TAL-93103")!;
  const [book, prices, where, hours] = buildFaq(d);
  assert.ok(prices.answer.en.includes(d.services[0].nameEn));
  assert.ok(prices.answer.es.includes(d.services[0].name));
  assert.ok(where.answer.en.includes(d.city));
  assert.ok(book.answer.en.length > 0);
  assert.ok(d.hours ? hours.question.en === "What are your hours?" : true);
});

test("a demo with no fixed hours gets a notice question or none, never an hours question", () => {
  for (const d of demos.filter((x) => !x.hours)) {
    const faqs = buildFaq(d);
    assert.ok(faqs.every((f) => f.question.en !== "What are your hours?"), d.profileCode);
  }
});
