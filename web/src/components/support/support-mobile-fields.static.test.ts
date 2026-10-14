import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (f: string) => readFileSync(join(process.cwd(), "src/components/support", f), "utf8");

test("support form fields are 16px (no iOS focus zoom) and the phone field is a tel input", () => {
  for (const f of ["SupportIdeaForm.tsx", "SupportPanelForms.tsx"]) {
    const src = read(f);
    assert.match(src, /const fieldInput: CSSProperties = \{[\s\S]{0,250}fontSize: 16/, f);
    assert.match(src, /type="tel"/, f);
  }
});

test("push control exposes its state to assistive tech and has a 44px target", () => {
  const src = read("PushSubscribeControl.tsx");
  assert.match(src, /aria-pressed=/);
  assert.match(src, /aria-busy=/);
  assert.match(src, /minHeight: 44/);
});
