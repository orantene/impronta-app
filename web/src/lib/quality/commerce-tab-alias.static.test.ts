import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { COMMERCE_TABS } from "@/app/(workspace)/platform/admin/commerce/_registry";

const page = readFileSync(
  join(process.cwd(), "src/app/(workspace)/platform/admin/commerce/[tab]/page.tsx"),
  "utf8",
);

test("TUL-925: /commerce/<tab> redirects known tabs and 404s the rest", () => {
  assert.match(page, /COMMERCE_TABS\.some\(\(t\) => t\.id === tab\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /redirect\(`\/platform\/admin\/commerce\?tab=\$\{tab\}`\)/);
  assert.ok(COMMERCE_TABS.some((t) => t.id === "revenue"));
});
