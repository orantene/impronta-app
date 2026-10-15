import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-750: on staging the /client discovery bounce went to the production apex
// (hard-coded https://tulala.digital) and signed QA out of staging. It must use
// the environment's marketing origin (production still resolves to tulala.digital).
test("/client discovery bounce uses resolveMarketingOrigin, not the hard-coded apex", () => {
  const src = readFileSync(join(process.cwd(), "src/app/client/page.tsx"), "utf8");
  assert.doesNotMatch(src, /redirect\(`https:\/\/\$\{TULALA_APEX_HOST\}`\)/);
  assert.match(src, /redirect\(resolveMarketingOrigin\(\)\)/);
});
