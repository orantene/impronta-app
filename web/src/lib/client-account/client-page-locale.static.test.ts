// TUL-1856: /client page bodies must resolve their language the same way the client layout
// does (URL, cookie, saved language, Accept-Language), not from the path-derived header alone.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

test("no client page calls getRequestLocale directly", () => {
  const roots = [join(process.cwd(), "src/app/(workspace)/[tenantSlug]/client"), join(process.cwd(), "src/app/client")];
  const offenders = roots.flatMap(pages).filter((f) => /getRequestLocale\s*\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("the shared helper goes through resolveAccountLocale, which reads Accept-Language", () => {
  const helper = readFileSync(join(process.cwd(), "src/lib/client-account/client-page-locale.server.ts"), "utf8");
  assert.match(helper, /resolveAccountLocale\(/);
  const acct = readFileSync(join(process.cwd(), "src/lib/client-account/account-locale.server.ts"), "utf8");
  assert.match(acct, /acceptLanguage: h\.get\("accept-language"\)/);
});
