/**
 * Hydration guard for the shared talent dashboard shell (React #418 on
 * /talent/today and /talent/services). Render code must not read the clock or
 * format a date in the host timezone: the server and the browser disagree.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(__dirname, "../../../..");
const FILES = [
  "components/admin/shell/internal/talent.tsx",
  "components/admin/shell/internal/page-modules/WorkspacePlanBadge.tsx",
  "components/admin/shell/internal/primitives/guided-tour.tsx",
  "components/talent/services/TalentOrdersQueue.tsx",
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function callArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

describe("talent shell hydration safety", () => {
  for (const rel of FILES) {
    const src = stripComments(readFileSync(path.join(ROOT, rel), "utf8"));

    it(`${rel}: toLocale* always carries an explicit timeZone`, () => {
      for (const m of src.matchAll(/\.toLocale\w*\(/g)) {
        const args = callArgs(src, m.index! + m[0].length - 1);
        assert.ok(/timeZone/.test(args), `${rel}: ${m[0]}...) has no timeZone`);
      }
    });

    it(`${rel}: new Date() / Date.now() only directly inside an effect`, () => {
      for (const m of src.matchAll(/new Date\(\)|Date\.now\(\)/g)) {
        const before = src.slice(0, m.index!);
        const effectAt = before.lastIndexOf("useEffect(");
        assert.ok(effectAt >= 0, `${rel}: clock read outside any effect`);
        const between = before.slice(effectAt);
        // The nearest effect must still be open: no closing "}, [" deps line yet.
        assert.ok(!/\},\s*\[[^\]]*\]\s*\)/.test(between), `${rel}: clock read in render code after the last effect`);
      }
    });
  }
});
