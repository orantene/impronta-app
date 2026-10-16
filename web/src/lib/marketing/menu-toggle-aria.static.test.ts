/**
 * TUL-121 theme12: marketing hamburger aria must follow locale
 * (Open menu / Close menu → Abrir menú / Cerrar menú on ES).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("marketing copy ships ES Abrir menú / Cerrar menú beside EN Open/Close menu", () => {
  const src = readFileSync(join(root, "src/lib/marketing/copy.ts"), "utf8");
  assert.match(src, /openMenu:\s*"Open menu"/);
  assert.match(src, /closeMenu:\s*"Close menu"/);
  assert.match(src, /openMenu:\s*"Abrir menú"/);
  assert.match(src, /closeMenu:\s*"Cerrar menú"/);
});

test("marketing header hamburger aria reads copy.nav open/close menu", () => {
  const src = readFileSync(
    join(root, "src/components/marketing/header.tsx"),
    "utf8",
  );
  assert.match(
    src,
    /aria-label=\{menuOpen \? copy\.nav\.closeMenu : copy\.nav\.openMenu\}/,
  );
  assert.doesNotMatch(src, /aria-label=\{menuOpen \? "Close menu"/);
});
