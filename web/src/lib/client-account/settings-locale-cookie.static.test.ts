import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/lib/client-account/profile-actions.ts"), "utf8");
const island = readFileSync(join(process.cwd(), "src/components/client-account/AccountClientIslands.tsx"), "utf8");

test("TUL-1259: saving the account language also writes the deliberate locale cookie (the cookie outranks the saved profile)", () => {
  assert.match(src, /jar\.set\(LOCALE_COOKIE, clean\.locale, localeCookieOptions\)/);
  assert.match(src, /LOCALE_AUTO_COOKIE, "", \{ \.\.\.localeCookieOptions, maxAge: 0 \}/, "the auto marker is cleared");
  assert.ok(src.indexOf("preferred_locale: clean.locale") < src.indexOf("jar.set(LOCALE_COOKIE"), "profile saved before the cookie");
});

test("TUL-1259: the settings form refreshes after a successful save", () => {
  assert.match(island, /if \(r\.ok\) router\.refresh\(\)/);
});
