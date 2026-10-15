import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getCaseStudies } from "./case-studies-data";

test("TUL-887: Spanish stories say 'espacio de trabajo', never 'workspace'", () => {
  const text = JSON.stringify(getCaseStudies("es"));
  assert.doesNotMatch(text, /workspace/i);
});

test("TUL-887: the story persona name does not wrap mid-name", () => {
  const src = readFileSync(join(process.cwd(), "src/components/marketing/case-studies-section.tsx"), "utf8");
  assert.match(src, /<span className="whitespace-nowrap">\{study\.persona\}<\/span>/);
});
