/** TUL-691: /client uses the claim-landing fallback, so a claimed client never hits the apex or role picker. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/app/client/page.tsx"), "utf8");

test("/client routes its last resort through clientRootFallback and sends clients to /account", () => {
  assert.match(src, /clientRootFallback\(/);
  assert.match(src, /fallback === "account"\) redirect\("\/account"\)/);
});

test("the apex bounce happens only on the discover branch", () => {
  const apex = src.match(/redirect\(`https:\/\/\$\{TULALA_APEX_HOST\}`\)/g) ?? [];
  assert.equal(apex.length, 1);
  assert.match(src, /fallback === "discover"\) redirect\(`https:\/\/\$\{TULALA_APEX_HOST\}`\)/);
});
