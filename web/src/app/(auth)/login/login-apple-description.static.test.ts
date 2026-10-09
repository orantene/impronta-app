/**
 * TUL-518 A1-2: /login subtitle must not promise Apple while the provider
 * flag is off. Copy is chosen from AUTH_APPLE_PROVIDER_ENABLED.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("login description key follows isAppleAuthProviderEnabled", () => {
  const page = read("src/app/(auth)/login/page.tsx");
  assert.match(page, /appleSignInEnabled = isAppleAuthProviderEnabled\(\)/);
  assert.match(page, /public\.auth\.login\.descriptionNoApple/);
  assert.match(
    page,
    /appleSignInEnabled\s*\?\s*"public\.auth\.login\.description"\s*:\s*"public\.auth\.login\.descriptionNoApple"/,
  );
  assert.match(page, /\{appleSignInEnabled \? \(/);
});

test("en and es catalogs ship both Apple and no-Apple login descriptions", () => {
  const en = JSON.parse(read("messages/en.json")) as {
    public: { auth: { login: Record<string, string> } };
  };
  const es = JSON.parse(read("messages/es.json")) as {
    public: { auth: { login: Record<string, string> } };
  };
  assert.match(en.public.auth.login.description, /Apple/);
  assert.doesNotMatch(en.public.auth.login.descriptionNoApple, /Apple/);
  assert.match(es.public.auth.login.description, /Apple/);
  assert.doesNotMatch(es.public.auth.login.descriptionNoApple, /Apple/);
  assert.match(es.public.auth.login.descriptionNoApple, /Google o correo/);
});
