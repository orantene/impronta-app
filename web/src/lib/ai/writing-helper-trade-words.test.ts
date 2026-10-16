import test from "node:test";
import assert from "node:assert/strict";
import { buildWritingPrompt } from "./writing-helper";

test("TUL-993: the rewrite prompt keeps the person's own trade words, gender and case", () => {
  const { systemPrompt, userMessage } = buildWritingPrompt({
    op: "rewrite",
    text: "Soy fotógrafa de retratos en Tulum.",
    locale: "es",
    facts: { name: "Rosa", discipline: "fotógrafa de retratos", city: "Tulum", services: [], languages: [] },
  } as never);
  assert.match(systemPrompt, /grammatical gender and lowercase/);
  assert.match(systemPrompt, /never "Fotógrafo de Retrato"/);
  assert.match(userMessage, /what they do: fotógrafa de retratos/);
});
