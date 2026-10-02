import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "../../lib/quality/supabase-unchecked-read";
import { editorT } from "./editor-i18n";

const src = blankComments(
  readFileSync(join(process.cwd(), "src/components/edit-chrome/in-editor-canvas-region.tsx"), "utf8"),
);

test("F113: the empty-page starter needs a mounted client, a loaded composition and a truly empty tree", () => {
  assert.match(src, /const showStarter = mounted && isEmpty && compositionLoaded && !compositionError;/);
  assert.match(src, /useEffect\(\(\) => setMounted\(true\), \[\]\)/);
});

test("F113: until then a skeleton is painted (server HTML and pre-hydration included)", () => {
  assert.match(src, /const showSkeleton = isEmpty && !showStarter && !loadFailed;/);
  assert.match(src, /data-in-editor-canvas-skeleton/);
  assert.match(src, /aria-busy="true"/);
});

test("F113: skeleton label is translated", () => {
  assert.equal(editorT("Loading your page…", "es"), "Cargando tu página...");
});
