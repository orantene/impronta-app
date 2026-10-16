import assert from "node:assert/strict";
import test from "node:test";

import { buildExtractionPrompt } from "./prompts";

test("TUL-568: the Spanish flow tells the extractor to write descriptive values in Spanish", () => {
  const es = buildExtractionPrompt({ locale: "es" });
  assert.match(es, /Spanish/);
  assert.match(es, /work\.industry/);
});

test("TUL-568: English and unspecified locale add no language rule", () => {
  assert.doesNotMatch(buildExtractionPrompt({ locale: "en" }), /LANGUAGE/);
  assert.doesNotMatch(buildExtractionPrompt(), /LANGUAGE/);
});
