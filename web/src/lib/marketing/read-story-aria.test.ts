import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readStoryAriaLabel } from "./copy";

const SECTION = "src/components/marketing/case-studies-section.tsx";

test("ES case-study open aria uses Leer la historia de {persona}", () => {
  assert.equal(
    readStoryAriaLabel("es", "Daniela Sol"),
    "Leer la historia de Daniela Sol",
  );
  assert.equal(
    readStoryAriaLabel("es", "Renata Cruz"),
    "Leer la historia de Renata Cruz",
  );
});

test("EN case-study open aria keeps Read {persona}'s story", () => {
  assert.equal(
    readStoryAriaLabel("en", "Daniela Sol"),
    "Read Daniela Sol's story",
  );
});

test("case-studies section does not hardcode English Read persona story aria", () => {
  const src = readFileSync(SECTION, "utf8");
  assert.doesNotMatch(
    src,
    /aria-label=\{`Read \$\{study\.persona\}'s story`\}/,
    "Card open control must use readStoryAriaLabel, not a hardcoded English template.",
  );
  assert.match(src, /readStoryAriaLabel\(locale,\s*study\.persona\)/);
});
