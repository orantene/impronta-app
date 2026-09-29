import assert from "node:assert/strict";
import { test } from "node:test";

import { faqRowToItem, planFaqSave } from "./faq-editor-model";

test("planFaqSave updates kept ids, inserts new rows, deletes the rest, in order", () => {
  const plan = planFaqSave(
    ["a", "b", "c"],
    [
      { id: "c", question: { es: "¿Cuánto dura?", en: "How long?" }, answer: { es: "1 h" } },
      { id: null, question: { es: "¿Dónde?" }, answer: { es: "Estudio", en: "Studio" } },
      { id: "a", question: { es: "¿Precio?" }, answer: {} },
    ],
    "es",
  );
  assert.deepEqual(
    plan.updates.map((u) => [u.id, u.sort_order, u.question]),
    [
      ["c", 0, "¿Cuánto dura?"],
      ["a", 2, "¿Precio?"],
    ],
  );
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0]?.sort_order, 1);
  assert.deepEqual(plan.inserts[0]?.answer_i18n, { es: "Estudio", en: "Studio" });
  assert.deepEqual(plan.deletes, ["b"]);
  assert.deepEqual(plan.updates[0]?.question_i18n, { es: "¿Cuánto dura?", en: "How long?" });
});

test("planFaqSave drops rows with no primary question and treats unknown ids as new", () => {
  const plan = planFaqSave(
    ["a"],
    [
      { id: "a", question: { en: "Only English" }, answer: {} },
      { id: "zzz", question: { es: "Nueva" }, answer: {} },
    ],
    "es",
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 1);
  assert.deepEqual(plan.deletes, ["a"]);
});

test("faqRowToItem folds the plain column in as the primary", () => {
  assert.deepEqual(
    faqRowToItem({ id: "x", question: "Hola", answer: null, question_i18n: { en: "Hi" } }, "es"),
    { id: "x", question: { en: "Hi", es: "Hola" }, answer: {} },
  );
});
