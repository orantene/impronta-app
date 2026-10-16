import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a resolved thread offers a new question and Message-Oran carries a real subject", () => {
  const panel = read("src/components/support/SupportPanel.tsx");
  assert.match(panel, /<NewQuestionStrip/);
  assert.match(panel, /subject: t\("dashboard\.adminSupport\.messageOranSubject"\)/);
  const engine = read("src/lib/support/support-engine.ts");
  assert.match(engine, /messageOranDirectly && !\(input\.subject \?\? ""\)\.trim\(\)\s*\?\s*"Direct message"/);
  for (const l of ["en", "es", "fr"]) {
    const m = JSON.parse(read(`messages/${l}.json`));
    const g = (o: Record<string, unknown>, k: string) => o[k] as Record<string, string>;
    const s = g(g(m, "dashboard"), "adminSupport");
    for (const k of ["newQuestion", "newQuestionHint", "messageOranSubject"]) assert.ok(s[k], `${l}.${k}`);
  }
});
