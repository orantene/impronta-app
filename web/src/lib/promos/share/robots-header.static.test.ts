import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

test("promo share pages send X-Robots-Tag: noindex on talent hosts and the hub", () => {
  for (const source of ["/p/:slug", "/t/:code/p/:slug"]) {
    const i = config.indexOf(`source: "${source}"`);
    assert.ok(i > 0, `next.config.ts has a headers rule for ${source}`);
    const rule = config.slice(i, i + 160);
    assert.match(rule, /key: "X-Robots-Tag", value: "noindex"/);
  }
});
