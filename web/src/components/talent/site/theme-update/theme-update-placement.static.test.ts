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

test("TUL-325: post-apply banner has Unpublished pill + Publish site CTA (EN + ES, no em dash)", () => {
  assert.match(SRC, /data-theme-update-post-apply/);
  assert.match(SRC, /data-theme-update-unpublished/);
  assert.match(SRC, /data-theme-update-publish/);
  assert.match(SRC, /publishMaxSiteAction/);
  assert.match(SRC, /panel", "publish"/);
  assert.equal(UPDATE_COPY.unpublishedPill.en, "Unpublished changes");
  assert.equal(UPDATE_COPY.unpublishedPill.es, "Cambios sin publicar");
  assert.equal(UPDATE_COPY.publishCta.en, "Publish site");
  assert.equal(UPDATE_COPY.publishCta.es, "Publicar sitio");
  for (const s of [
    UPDATE_COPY.unpublishedPill.en,
    UPDATE_COPY.unpublishedPill.es,
    UPDATE_COPY.publishCta.en,
    UPDATE_COPY.publishCta.es,
  ]) {
    assert.ok(!s.includes("—"), s);
  }
});
