/**
 * TUL-1126: axe flagged /start for "no main landmark" and "content outside landmarks".
 * The /start layout wraps both the page and its loading skeleton, so one <main> there fixes both.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(process.cwd(), "src/app/start/layout.tsx"), "utf8");

test("TUL-1126: the /start layout is the page's single <main> landmark", () => {
  assert.equal(layout.match(/<main\b/g)?.length ?? 0, 1);
  assert.equal(layout.match(/<\/main>/g)?.length ?? 0, 1);
  assert.match(layout, /data-platform-surface="marketing"/, "the token scope stays on the same element");
});

test("TUL-1126: no second <main> inside the flow", () => {
  for (const f of ["src/app/start/page.tsx", "src/app/start/loading.tsx", "src/components/onboarding/start-flow.tsx", "src/components/onboarding/step-skeleton.tsx"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.equal(/<main\b/.test(src), false, `${f} must not nest a second <main>`);
  }
});
