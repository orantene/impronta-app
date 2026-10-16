import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

test("next.config.ts sends Vary: Cookie on page HTML (proxy Vary is overwritten by Next)", () => {
  const cfg = read("next.config.ts");
  assert.match(cfg, /key:\s*"Vary",\s*value:\s*"Cookie"/);
  assert.match(cfg, /_next\//, "static assets must be excluded from Vary: Cookie");
});

test("proxy talent-site cache helper still sets Vary: Cookie and cookieless-only CDN cache", () => {
  const src = read("src/lib/saas/talent-site-anon-cache.ts");
  assert.match(src, /addVaryCookie\(res\)/);
  assert.match(src, /canCdnCache = isSafeRead && cookieless/);
});
