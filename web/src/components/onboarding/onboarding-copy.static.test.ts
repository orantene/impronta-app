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

test("TUL-991: the saving screen says 'you can close this' once and promises no ten seconds", () => {
  for (const l of ["en", "es"]) {
    const b = msg(l).public.onboarding.building;
    for (const k of ["sub", "subTalent"]) {
      assert.doesNotMatch(b[k], /close this|cerrar esto/i, `${l}.${k}`);
      assert.doesNotMatch(b[k], /ten seconds|diez segundos/i, `${l}.${k}`);
    }
    assert.match(b.canClose, /close this|cerrar esto/i);
  }
});
