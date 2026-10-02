import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "../../../../lib/quality/supabase-unchecked-read";

const src = blankComments(
  readFileSync(join(process.cwd(), "src/components/talent/site/maison-setup/ThemeDetailScreen.tsx"), "utf8"),
);

test("F107: the desktop inspector is viewport-bound, sticky, and scrolls inside itself", () => {
  const aside = src.match(/<aside\s+data-maison-inspector=""\s+className="([^"]+)"/);
  assert.ok(aside, "inspector aside");
  const cls = aside![1]!;
  assert.match(cls, /md:sticky/);
  assert.match(cls, /md:h-\[calc\(100dvh-/);
  assert.match(cls, /md:self-start/);
  assert.match(cls, /w-\[300px\]/); // fits from 1024px
  assert.match(cls, /lg:w-\[360px\]/);
  assert.match(src, /min-h-0 flex-1 space-y-5 overflow-y-auto/);
});

test("F107: the Use this design button stays in the inspector's sticky footer; phones keep the sticky bottom bar", () => {
  assert.match(src, /sticky bottom-0 border-t border-admin-border-soft bg-white px-4 py-3/);
  assert.match(src, /sticky bottom-0 flex flex-nowrap items-center gap-2[^"]*md:hidden/);
});
