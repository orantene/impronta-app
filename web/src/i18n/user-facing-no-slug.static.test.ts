import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-702: workspace owners see "web address", never the developer word "slug".
test("workspace settings strings say web address, not slug", () => {
  for (const loc of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), "utf8"));
    const flat = JSON.stringify(m);
    for (const needle of [/Nombre · Slug/, /Name · Slug/, /Slug del espacio/, /Workspace slug"/, /Define el slug/, /tu-slug/]) {
      assert.doesNotMatch(flat, needle, `${loc}: ${needle}`);
    }
  }
});
