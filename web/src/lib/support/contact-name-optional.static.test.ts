import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/** The contact form labels Name as optional; neither the browser nor the server may require it (TUL-602, re-applied from #3682). */
test("contact form name field is not required in the browser", () => {
  const src = readFileSync("src/components/marketing/support/MarketingContactForm.tsx", "utf8");
  const block = src.slice(src.indexOf("{copy.nameLabel}"), src.indexOf("{copy.emailLabel}"));
  assert.equal(/\brequired\b/.test(block), false);
});

test("contact action does not reject an empty name and stores null", () => {
  const src = blankComments(readFileSync("src/lib/support/guest-actions.ts", "utf8"));
  assert.equal(src.includes("!input.name.trim()"), false);
  assert.equal(src.includes("contactName: input.name.trim(),"), false);
});
