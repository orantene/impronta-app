import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const msg = (l: string) => JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));

test("TUL-804: the design step promises no fixed number of looks", () => {
  for (const l of ["en", "es"]) {
    const sub: string = msg(l).public.onboarding.design.sub;
    assert.doesNotMatch(sub, /\b(three|tres|two|dos|3|2)\b/i, l);
  }
});
