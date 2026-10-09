import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Run 5: the ready step showed "(llega en el proximo paso de esta construccion)" to users.
// Build-time wording must never ship in the public onboarding copy.
test("public onboarding copy has no build-time or developer wording", () => {
  for (const locale of ["en", "es"]) {
    const json = JSON.parse(readFileSync(join(here, `../../../messages/${locale}.json`), "utf8")) as {
      public?: { onboarding?: unknown };
    };
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(json.public?.onboarding);
    assert.ok(strings.length > 20, `${locale}: onboarding namespace found`);
    for (const s of strings) {
      assert.doesNotMatch(s, /of this build|this build\b|esta construcci[oó]n|pr[oó]ximo paso de esta|\bplaceholder\b/i, `${locale}: ${s}`);
    }
  }
});
