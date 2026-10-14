import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-870: whitelabel agency login <head> carries the agency brand everywhere.
test("auth layout metadata brands description, og, twitter and apple web-app title", () => {
  const s = readFileSync(join(process.cwd(), "src/app/(auth)/layout.tsx"), "utf8");
  const fn = s.slice(s.indexOf("export async function generateMetadata"), s.indexOf("type AuthShellResolution"));
  for (const re of [/openGraph: \{ siteName: brand\.title, title: brand\.title/, /appleWebApp: \{ title: brand\.title \}/, /twitter: \{ title: brand\.title/, /applicationName: brand\.title/, /public\.auth\.brandedDescription/]) {
    assert.match(fn, re);
  }
  for (const l of ["en", "es"]) {
    const v = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")).public.auth.brandedDescription;
    assert.match(v, /\{name\}/, l);
  }
});
