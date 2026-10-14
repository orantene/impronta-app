import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

test("TUL-677: a valid reply link shows the thread, not the blank contact form", () => {
  const src = readFileSync(join(here, "MarketingContactPage.tsx"), "utf8");
  const form = src.indexOf("<MarketingContactForm");
  assert.ok(form > 0);
  // The form must sit in the "no resume token" branch of a ternary.
  const before = src.slice(0, form);
  assert.match(before, /resumeToken\s*\?\s*\(?\s*<MarketingContactResume[\s\S]*:\s*\(\s*<>[\s\S]*$/);
});
