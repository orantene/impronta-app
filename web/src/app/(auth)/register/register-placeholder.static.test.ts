import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("TUL-761: the shared auth email placeholder is not a business address", () => {
  for (const f of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${f}.json`), "utf8"));
    assert.doesNotMatch(m.public.auth.form.emailPlaceholder, /studio|estudio/i);
  }
});
