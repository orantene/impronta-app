import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ANALYTICS_ALLOWED_JS } from "./consent";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const consentSrc = readFileSync(join(WEB_ROOT, "src/lib/analytics/consent.ts"), "utf8");
const allowedDecl = /export const ANALYTICS_ALLOWED_JS = (`[^`]*`);/.exec(consentSrc)?.[1];

test("ANALYTICS_ALLOWED_JS is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(`return ${ANALYTICS_ALLOWED_JS};`));
});

test("ANALYTICS_ALLOWED_JS stays one template literal", () => {
  assert.ok(allowedDecl, "ANALYTICS_ALLOWED_JS must be a single template literal, not `a` + `b`");
});

test("the minified consent snippet keeps the whole consent check", async () => {
  const swc = await import("next/dist/build/swc/index.js");
  await swc.loadBindings();
  const source = [
    `const CONSENT_STORAGE_KEY = "impronta_analytics_consent";`,
    `const CONSENT_REGION_ATTR = "data-consent-region";`,
    `const ANALYTICS_ALLOWED_JS = ${allowedDecl};`,
    "export function snippet(){ return `(function(){var consent=${ANALYTICS_ALLOWED_JS}?'granted':'denied';})();`; }",
  ].join("\n");
  const { code } = await swc.minify(source, { compress: true, mangle: true, module: true });
  const snippet = new Function(`${code.replace(/\bexport\s+/g, "")}\nreturn snippet();`)() as string;
  assert.match(snippet, /getItem\('impronta_analytics_consent'\);if\(s==='granted'\|\|s==='denied'\)/);
  assert.doesNotThrow(() => new Function(snippet), snippet);
});
