import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * live2b-04: public /book service dropdown was white-on-white when the
 * talent theme's --token-color-ink is a light value (dark pages).
 */
test("book page service select pins dark text on white (live2b-04)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/book/BookPageClient.tsx"), "utf8");
  assert.match(src, /data-testid="book-page-service-select"/);
  assert.match(src, /text-\[#0B0B0D\]/);
  assert.match(src, /colorScheme:\s*"light"/);
  assert.doesNotMatch(
    src,
    /select[\s\S]{0,200}text-\[var\(--token-color-ink/,
    "service select must not use theme ink (light ink → white-on-white)",
  );
});
