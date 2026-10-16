import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// TUL-1115: the support panel keeps no inline user-facing English. Rendered
// copy comes from the dictionary (t("dashboard.adminSupport...")) or from the
// documented local ES/EN map support-a11y-copy.ts.

const DIR = __dirname;
const FILES = readdirSync(DIR).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("support panel has no inline English (TUL-1115)", () => {
  it("scans the support components", () => {
    assert.ok(FILES.length >= 10);
    assert.ok(FILES.includes("SupportPanel.tsx"));
  });
  for (const file of FILES) {
    it(`${file}: no JSX text, label attribute or capitalised fallback literal`, () => {
      const src = strip(readFileSync(join(DIR, file), "utf8"));
      const offenders: string[] = [];
      for (const m of src.matchAll(/<[a-z][\w.-]*(?:\s[^<>]*)?>\s*([A-Za-z][^<>{}=;]{2,}?)\s*</g)) {
        // Agent monogram ("OT"), not copy.
        if (!/^[A-Z]{1,3}$/.test(m[1].trim())) offenders.push(`text: ${m[1]}`);
      }
      for (const m of src.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"{]*[A-Za-z][^"]*)"/g)) offenders.push(`attr: ${m[1]}`);
      for (const m of src.matchAll(/(?:\?\?|\|\||:)\s*"([A-Z][a-z]+(?: [A-Za-z]+)*)"\s*[;,)}]/g)) {
        if (!/^(General|Billing)$/.test(m[1])) offenders.push(`literal: ${m[1]}`);
      }
      assert.deepEqual(offenders, []);
    });
  }
});
