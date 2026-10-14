import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * TUL-721: every raw native date input in the admin shell must have a
 * DateFormatHint beside it (Spanish shows dd/mm/aaaa under it), and each
 * file's DateFormatHint import must resolve to a real file.
 */
const ROOT = join(process.cwd(), "src/components/admin/shell/internal");

/** Files whose raw date input is deliberately hint-free. */
const ALLOW: Record<string, string> = {
  "talent/agenda/HoursFields.tsx":
    "the raw date input is the non-Spanish branch only; Spanish gets a dd/mm/aaaa text field",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

const INPUT_RE = /<(?:input|Input)\b(?:(?!\/>)[\s\S])*?type="date"(?:(?!\/>)[\s\S])*?\/>/g;

test("every type=date input under admin/shell/internal has a DateFormatHint sibling", () => {
  const bad: string[] = [];
  for (const file of walk(ROOT)) {
    const rel = file.slice(ROOT.length + 1);
    const src = readFileSync(file, "utf8");
    const inputs = [...src.matchAll(INPUT_RE)];
    if (inputs.length === 0 || ALLOW[rel]) continue;
    const hints = (src.match(/<DateFormatHint\b/g) ?? []).length;
    if (hints < inputs.length) bad.push(`${rel}: ${inputs.length} date input(s), ${hints} hint(s)`);
    const imp = src.match(/import \{ DateFormatHint \} from "([^"]+)"/);
    if (!imp) bad.push(`${rel}: missing DateFormatHint import`);
    else {
      const target = resolve(dirname(file), imp[1]) + ".tsx";
      if (!existsSync(target)) bad.push(`${rel}: DateFormatHint import does not resolve (${imp[1]})`);
    }
  }
  assert.deepEqual(bad, []);
});
