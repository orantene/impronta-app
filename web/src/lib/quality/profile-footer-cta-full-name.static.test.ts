import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const LAYOUTS = [
  "_noir/NoirProfileLayout.tsx",
  "_light/LightProfileLayout.tsx",
  "_lumen/LumenProfileLayout.tsx",
  "_atelier/AtelierProfileLayout.tsx",
];

describe("TUL-1024 profile footer CTA uses the display name", () => {
  for (const f of LAYOUTS) {
    it(`${f} fills the CTA with the full name, not the first word`, () => {
      const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]", f), "utf8");
      assert.match(src, /footerCtaTitle"\)\.replace\("\{firstName\}", name\)/);
      assert.doesNotMatch(src, /footerCtaTitle"\)\.replace\("\{firstName\}", firstName\)/);
    });
  }
});
