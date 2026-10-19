import test from "node:test";
import assert from "node:assert/strict";
import { buildWritingPrompt } from "./writing-helper";
import { resolveOwnTradeWords, restoreOwnTradeWords, tradeWordKey } from "./writing-helper-trade-words";

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

test("TUL-993: feminine trade word in the person's text beats the masculine catalogue title", () => {
  assert.equal(resolveOwnTradeWords("Fotógrafo de retratos", "Soy fotógrafa de retratos en Tulum."), "fotógrafa de retratos");
  const { userMessage } = buildWritingPrompt({
    surface: "bio",
    op: "rewrite",
    text: "Soy fotógrafa de retratos en Tulum.",
    locale: "es",
    facts: { name: "Rosa", discipline: "Fotógrafo de retratos", city: "Tulum", services: [], languages: [] },
  });
  assert.match(userMessage, /what they do: fotógrafa de retratos/);
  assert.doesNotMatch(userMessage, /Fotógrafo/);
});

test("TUL-993: plural, accent-less and neutral forms are kept", () => {
  assert.equal(resolveOwnTradeWords("Fotógrafo de retrato", "Somos fotografas de retratos"), "fotografas de retratos");
  assert.equal(resolveOwnTradeWords("Doctor", "soy doctora"), "doctora");
  assert.equal(resolveOwnTradeWords("Manicurista", "Soy manicurista"), "manicurista");
  assert.equal(resolveOwnTradeWords("DJ", "Soy DJ"), "DJ");
  assert.equal(tradeWordKey("doctores"), tradeWordKey("doctora"));
});

test("TUL-993: a title word with no counterpart in the text keeps the title form, lowercased", () => {
  assert.equal(resolveOwnTradeWords("Fotógrafo de bodas", "Soy fotógrafa"), "fotógrafa de bodas");
  assert.equal(resolveOwnTradeWords("Fotógrafo", ""), "fotógrafo");
});

test("TUL-993: the model echoing the catalogue title is put back to the person's wording", () => {
  const own = "fotógrafa de retratos";
  assert.equal(restoreOwnTradeWords("Fotógrafo de retratos en Tulum, con luz natural.", "Fotógrafo de retratos", own), "Fotógrafa de retratos en Tulum, con luz natural.");
  assert.equal(restoreOwnTradeWords("Soy fotógrafo de retratos.", "Fotógrafo de retratos", own), "Soy fotógrafa de retratos.");
  assert.equal(restoreOwnTradeWords("Ya es fotógrafa de retratos.", "Fotógrafo de retratos", own), "Ya es fotógrafa de retratos.");
  assert.equal(restoreOwnTradeWords("Soy manicurista.", "Manicurista", "manicurista"), "Soy manicurista.");
});
