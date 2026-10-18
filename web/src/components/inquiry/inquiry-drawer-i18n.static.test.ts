import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// TUL-951: the inquiry drawer reads every string from public.inquiryDrawer.* and renders
// in the PAGE language. Parity + no hardcoded English literals in its files.
const root = process.cwd();
const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8")).public.inquiryDrawer;
const es = JSON.parse(readFileSync(join(root, "messages/es.json"), "utf8")).public.inquiryDrawer;

function flat(o: Record<string, unknown>, p = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object") flat(v as Record<string, unknown>, `${p}${k}.`, out);
    else out[`${p}${k}`] = String(v);
  }
  return out;
}
const E = flat(en);
const S = flat(es);

const DIR = join(root, "src/components/inquiry");
const FILES = readdirSync(DIR)
  .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))
  .map((f) => join(DIR, f));

describe("inquiry drawer catalog (TUL-951)", () => {
  it("en and es define exactly the same keys", () => {
    assert.deepEqual(Object.keys(S).sort(), Object.keys(E).sort());
  });

  it("Spanish values differ from English unless a short loanword/format", () => {
    const same = Object.keys(E).filter((k) => E[k] === S[k] && /[a-z]{4}/i.test(E[k]));
    // Allow-list of words identical in both languages.
    const allowed = new Set(["requesterEmail"]);
    assert.deepEqual(same.filter((k) => !allowed.has(k)), []);
  });

  it("every public.inquiryDrawer key used in the drawer files exists in both catalogs", () => {
    const missing: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/["'`]public\.inquiryDrawer\.([A-Za-z0-9_.]+)["'`]/g)) {
        const key = m[1];
        if (!(key in E)) missing.push(`en:${key}`);
        if (!(key in S)) missing.push(`es:${key}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});

describe("no hardcoded English in the drawer components (TUL-951)", () => {
  it("JSX text, aria/placeholder/title attributes and default props carry no English literals", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        // attribute literals
        if (/\b(?:placeholder|aria-label|title|alt)="[^"{]*[A-Za-z]{3}[^"]*"/.test(line)) offenders.push(`${f}:${i + 1} attr`);
        // default prop values
        if (/\b(?:placeholder|label|title)\s*=\s*"[A-Z][a-z]+ [a-z]/.test(line)) offenders.push(`${f}:${i + 1} default`);
        // bare JSX text line: Capitalised words only, no JS punctuation
        if (/^[A-Z][a-z]+(?: [a-zA-Z']+)+[.,!?]?$/.test(trimmed)) offenders.push(`${f}:${i + 1} text "${trimmed}"`);
        // single bare word of UI chrome
        if (/^(?:Add|Remove|Send|Cancel|Close|Review|Back|Next|Done)$/.test(trimmed)) offenders.push(`${f}:${i + 1} word`);
        // template-literal English sentences in aria
        if (/aria-label=\{`[A-Z][a-z]+ /.test(line)) offenders.push(`${f}:${i + 1} aria template`);
      });
    }
    assert.deepEqual(offenders, []);
  });

  it("the directory sheet hands the PAGE locale to the drawer", () => {
    const sheet = readFileSync(join(root, "src/components/directory/directory-inquiry-sheet.tsx"), "utf8");
    assert.match(sheet, /<DashboardLocaleProvider locale=\{props\.locale\}>/);
  });
});
