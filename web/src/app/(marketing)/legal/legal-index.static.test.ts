import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const dir = join(process.cwd(), "src/app/(marketing)/legal");

test("TUL-1797: /legal has an index page that sends the visitor to the Terms in their language", () => {
  assert.ok(existsSync(join(dir, "page.tsx")), "legal/page.tsx missing: /legal and /es/legal 404");
  const src = readFileSync(join(dir, "page.tsx"), "utf8");
  assert.match(src, /redirect\(withLocaleHref\("\/legal\/terms", locale\)\)/);
  for (const doc of ["terms", "privacy", "cookies", "refunds"]) {
    assert.ok(existsSync(join(dir, doc, "page.tsx")), `legal/${doc} missing`);
  }
});
