import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * TUL-1102: user-facing auth copy lives in the es/en dictionaries. This scans the two client
 * forms for inline text: JSX text nodes with letters, and copy-bearing attributes set to a
 * literal string. Data attributes, ids, names, autocomplete tokens and class names are fine.
 */
const FILES = [
  "src/components/auth/email-code-form.tsx",
  "src/app/(auth)/register/register-form.tsx",
  "src/components/auth/age-terms-checkbox.tsx",
];
const COPY_ATTRS = ["placeholder", "title", "aria-label", "alt", "label"];

function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

for (const file of FILES) {
  test(`${file}: no inline user-facing strings`, () => {
    const src = strip(readFileSync(file, "utf8"));
    const offenders: string[] = [];
    // JSX text: a `>` that closes a tag (not `=>`), then at least two plain words before `<` or `{`.
    for (const m of src.matchAll(/(?<![=\-])>([^<>{}();=`]*)[<{]/g)) {
      const text = m[1].replace(/\s+/g, " ").trim();
      if (/^[A-Za-z][A-Za-z'’.,!?:-]*( [A-Za-z][A-Za-z'’.,!?:-]*)+$/.test(text)) offenders.push(text);
    }
    for (const attr of COPY_ATTRS) {
      for (const m of src.matchAll(new RegExp(`\\s${attr}="([^"]*[A-Za-z]{2,}[^"]*)"`, "g"))) {
        offenders.push(`${attr}="${m[1]}"`);
      }
    }
    assert.deepEqual(offenders, [], `inline copy in ${file}; move it to messages/{en,es}.json`);
  });
}
