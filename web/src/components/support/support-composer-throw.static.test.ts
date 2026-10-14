import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/components/support/SupportPanelForms.tsx"), "utf8");

test("Composer.send treats a thrown onSend as a failed send", () => {
  const send = src.slice(src.indexOf("const send = async"), src.indexOf("return (", src.indexOf("const send = async")));
  assert.match(send, /try\s*{[\s\S]*await onSend\(text\)[\s\S]*}\s*catch/);
  // busy is released after the try/catch, never inside the success branch only.
  assert.ok(send.indexOf("catch") < send.indexOf("setBusy(false)"));
});
