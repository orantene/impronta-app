import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FLOATING_CHROME_STACK_CSS } from "@/lib/talent-site/floating-chrome-stack";

const root = join(__dirname, "..");
const client = readFileSync(join(root, "components/locale-suggestion-banner-client.tsx"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

test("TUL-560: the language suggestion is a small bottom-left toast, never a row above the header", () => {
  const cls = client.match(/className="([^"]*print:hidden[^"]*)"/)?.[1] ?? "";
  assert.ok(cls, "outer toast className found");
  assert.match(cls, /\bfixed\b/);
  assert.match(cls, /\bleft-3\b/);
  assert.match(cls, /max-w-\[340px\]/);
  assert.doesNotMatch(cls, /\btop-/);
  assert.doesNotMatch(cls, /\bshrink-0\b/, "no longer an in-flow row");
});

test("TUL-560: the toast floats above the bottom chrome reserve and above the demo badge", () => {
  assert.match(FLOATING_CHROME_STACK_CSS, /\[data-locale-suggestion\]\{bottom:calc\(var\(--floating-chrome-bottom\) \+ 12px\)\}/);
  assert.match(
    FLOATING_CHROME_STACK_CSS,
    /body:has\(\[data-demo-badge\]\) \[data-locale-suggestion\]\{bottom:calc\(var\(--floating-chrome-bottom\) \+ 44px\)\}/,
  );
});

test("TUL-516: floating chrome stack styles mount before the language banner", () => {
  const stack = layout.indexOf("<FloatingChromeStackStyles");
  const banner = layout.indexOf("<LocaleSuggestionBanner ");
  assert.ok(stack > 0 && banner > 0);
  assert.ok(stack < banner, "stack CSS precedes locale suggestion in <body>");
});
