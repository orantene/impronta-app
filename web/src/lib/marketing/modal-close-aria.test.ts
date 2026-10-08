/**
 * TUL-121 theme16: marketing modal Close aria must follow locale
 * (Close → Cerrar on ES).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { marketingModalCloseLabel } from "./modal-close-aria";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("marketingModalCloseLabel is Close (EN) / Cerrar (ES)", () => {
  assert.equal(marketingModalCloseLabel("en"), "Close");
  assert.equal(marketingModalCloseLabel("es"), "Cerrar");
  assert.equal(marketingModalCloseLabel("es-MX"), "Cerrar");
});

test("case-study modal close aria uses marketingModalCloseLabel", () => {
  const src = readFileSync(
    join(root, "src/components/marketing/case-studies-section.tsx"),
    "utf8",
  );
  assert.match(src, /marketingModalCloseLabel/);
  assert.doesNotMatch(src, /aria-label="Close"/);
});

test("login modal close aria uses marketingModalCloseLabel", () => {
  const src = readFileSync(
    join(root, "src/components/marketing/login-modal.tsx"),
    "utf8",
  );
  assert.match(src, /marketingModalCloseLabel/);
  assert.doesNotMatch(src, /aria-label="Close"/);
});
