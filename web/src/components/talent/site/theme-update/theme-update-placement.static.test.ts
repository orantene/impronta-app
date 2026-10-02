import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UPDATE_COPY } from "../../../../lib/talent-site/theme-releases/talent-update/copy";

const SRC = readFileSync(
  join(process.cwd(), "src/components/talent/site/theme-update/ThemeUpdateNotice.tsx"),
  "utf8",
);

function classConst(name: string): string {
  const m = SRC.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`));
  assert.ok(m, `${name} exported`);
  return m![1]!;
}

test("F94: the builder notice never sits bottom-left where the zoom HUD and tip live", () => {
  for (const cls of [classConst("BUILDER_PILL_CLASS"), classConst("BUILDER_CARD_CLASS")]) {
    assert.doesNotMatch(cls, /\bbottom-/);
    assert.doesNotMatch(cls, /\bsm:left-4\b|\bleft-4\b/);
    assert.match(cls, /top-\[/);
  }
});

test("F94: builder surface renders a pill, collapsed by default, in EN and ES", () => {
  assert.match(SRC, /data-theme-update-pill/);
  assert.match(SRC, /useState\(false\);\s*\n\s*const \[cardOpen|const \[cardOpen, setCardOpen\] = useState\(false\)/);
  assert.equal(UPDATE_COPY.pill.en, "Update available");
  assert.equal(UPDATE_COPY.pill.es, "Actualización disponible");
});
