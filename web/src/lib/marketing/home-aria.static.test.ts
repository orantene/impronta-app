/**
 * TUL-121 theme15: marketing logo home aria must follow locale
 * (Tulala home → Inicio de Tulala on ES).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getMarketingCopy } from "./copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("marketing copy ships ES Inicio de {name} beside EN {name} home", () => {
  const src = readFileSync(join(root, "src/lib/marketing/copy.ts"), "utf8");
  assert.match(src, /homeAria:\s*"\{name\} home"/);
  assert.match(src, /homeAria:\s*"Inicio de \{name\}"/);
  assert.equal(
    getMarketingCopy("es").nav.homeAria.replace("{name}", PLATFORM_BRAND.name),
    `Inicio de ${PLATFORM_BRAND.name}`,
  );
  assert.equal(
    getMarketingCopy("en").nav.homeAria.replace("{name}", PLATFORM_BRAND.name),
    `${PLATFORM_BRAND.name} home`,
  );
});

test("marketing header logo aria reads copy.nav.homeAria", () => {
  const src = readFileSync(
    join(root, "src/components/marketing/header.tsx"),
    "utf8",
  );
  assert.match(
    src,
    /aria-label=\{copy\.nav\.homeAria\.replace\("\{name\}", PLATFORM_BRAND\.name\)\}/,
  );
  assert.doesNotMatch(src, /aria-label=\{`\$\{PLATFORM_BRAND\.name\} home`\}/);
});
