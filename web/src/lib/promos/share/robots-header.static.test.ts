import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const cfg = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

test("promo pages and their OG images send X-Robots-Tag noindex", () => {
  for (const source of ["/p/:slug*", "/t/:code/p/:slug*"]) {
    const at = cfg.indexOf(`source: "${source}"`);
    assert.ok(at > 0, `${source} header rule present`);
    assert.ok(cfg.slice(at, at + 160).includes('"X-Robots-Tag"') && cfg.slice(at, at + 160).includes("noindex"));
  }
});
