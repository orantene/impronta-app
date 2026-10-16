import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-902 / TUL-868 / TUL-850: a bare lowercase locale code ("es", "en")
// rendered as a JSX child reads as a stray text node (the CSS uppercase is
// invisible to text extraction). Codes must be rendered through toUpperCase().
const dir = join(process.cwd(), "src/components/marketing");
const BARE = /\{\s*(?:props\.)?(?:locale|lang|activeLocale|code)\s*\}\s*(?=<|\n\s*<\/)/;

test("no marketing component renders a bare locale/code expression as a JSX child", () => {
  const offenders: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    const src = readFileSync(join(dir, f), "utf8");
    src.split("\n").forEach((line, i) => {
      if (/^\s*\{\s*(?:props\.)?(?:locale|lang|activeLocale|code)\s*\}\s*$/.test(line)) offenders.push(`${f}:${i + 1}`);
    });
    if (BARE.test(src)) offenders.push(`${f} (inline)`);
  }
  assert.deepEqual(offenders, []);
});

test("language toggle and menu render the uppercase code, the FAQ section never renders a locale", () => {
  const read = (n: string) => readFileSync(join(dir, n), "utf8");
  assert.match(read("marketing-language-toggle.tsx"), /\{code\.toUpperCase\(\)\}/);
  assert.match(read("marketing-language-menu.tsx"), /\{activeLocale\.toUpperCase\(\)\}/);
  assert.doesNotMatch(read("faq-section.tsx"), /\{\s*locale\s*\}/);
});
