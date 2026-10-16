import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(join(__dirname, "AppDetailScreen.tsx"), "utf8");

test("app detail title is never truncated and gets its own row on phones", () => {
  assert.match(src, /<header className="flex min-h-12 flex-wrap /);
  assert.match(src, /data-testid="app-detail-title-block" className="order-last [^"]*basis-full[^"]*sm:flex-1"/);
  assert.doesNotMatch(src, /<h1 className="truncate/);
  assert.match(src, /<h1 className="break-words /);
  assert.match(src, /line-clamp-2 text-\[12px\] text-admin-ink-muted/);
});
