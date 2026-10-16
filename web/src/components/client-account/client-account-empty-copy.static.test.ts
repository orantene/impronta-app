import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");

test("TUL-776: a client with no visits is invited to book a first visit, not 'Book again'", () => {
  assert.match(src, /a\("noVisits"\)\} <Link[^>]*>\{a\("bookFirst"\)\}/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8"));
    assert.ok(m.public.clientAccountArea.bookFirst, l);
    assert.doesNotMatch(m.public.clientAccountArea.bookFirst, /again|de nuevo|—/i);
  }
});
