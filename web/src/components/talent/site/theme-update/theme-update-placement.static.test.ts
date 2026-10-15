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

test("TUL-325: post-apply banner has Unpublished pill + Publish changes CTA (EN + ES, no em dash)", () => {
  assert.match(SRC, /data-theme-update-post-apply/);
  assert.match(SRC, /data-theme-update-unpublished/);
  assert.match(SRC, /data-theme-update-publish/);
  assert.match(SRC, /publishMaxSiteAction/);
  assert.match(SRC, /panel", "publish"/);
  assert.equal(UPDATE_COPY.unpublishedPill.en, "Unpublished changes");
  assert.equal(UPDATE_COPY.unpublishedPill.es, "Cambios sin publicar");
  assert.equal(UPDATE_COPY.publishCta.en, "Publish changes");
  assert.equal(UPDATE_COPY.publishCta.es, "Publicar cambios");
  for (const s of [
    UPDATE_COPY.unpublishedPill.en,
    UPDATE_COPY.unpublishedPill.es,
    UPDATE_COPY.publishCta.en,
    UPDATE_COPY.publishCta.es,
  ]) {
    assert.ok(!s.includes("—"), s);
  }
});

test("TUL-1029: the builder pill docks right, compact, and never centres over the site nav", () => {
  const pill = classConst("BUILDER_PILL_CLASS");
  assert.match(pill, /\bright-3\b/);
  assert.doesNotMatch(pill, /left-1\/2|-translate-x-1\/2/);
});

test("TUL-1028: the presence banner is a compact row on desktop and the address row never wraps", () => {
  assert.match(SRC, /sm:flex-row sm:items-center sm:justify-between/);
  const card = readFileSync(
    join(process.cwd(), "src/components/talent/site/maison-setup/MyWebsiteCard.tsx"),
    "utf8",
  );
  assert.match(card, /flex flex-nowrap items-center gap-2">\s*<span\s+data-testid="maison-live-address"/);
  assert.match(card, /data-testid="maison-view-website"[\s\S]*?shrink-0/);
});
