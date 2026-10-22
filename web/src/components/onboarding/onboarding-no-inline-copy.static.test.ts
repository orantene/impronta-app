import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-1129: the /start wizard's copy lives in the es/en dictionaries. Fails when a step adds
 * inline JSX text or a literal copy attribute (placeholder, title, aria-label, alt, label),
 * or hardcodes the terms line again.
 */
const DIRS = [join(__dirname, "steps"), __dirname];
const COPY_ATTRS = ["placeholder", "title", "aria-label", "alt", "label"];

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function offendersIn(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?<![=\-])>([^<>{}();=`]*)[<{]/g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    if (/^[A-Za-z][A-Za-z'’.,!?:-]*( [A-Za-z][A-Za-z'’.,!?:-]*)+$/.test(text)) out.push(text);
  }
  for (const attr of COPY_ATTRS) {
    for (const m of src.matchAll(new RegExp(`\\s${attr}="([^"]*[A-Za-z]{2,}[^"]*)"`, "g"))) {
      out.push(`${attr}="${m[1]}"`);
    }
  }
  return out;
}

test("the detector flags inline JSX text and literal copy attributes", () => {
  assert.ok(offendersIn("<p>By continuing you accept</p>").length > 0);
  assert.ok(offendersIn('<input placeholder="Your name" />').length > 0);
  assert.deepEqual(offendersIn("<p>{t('a.b')}</p>"), []);
});

for (const dir of DIRS) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    test(`onboarding ${file}: no inline user-facing strings`, () => {
      const found = offendersIn(strip(readFileSync(join(dir, file), "utf8")));
      assert.deepEqual(found, [], `inline copy in ${file}; move it to messages/{en,es}.json`);
    });
  }
}
