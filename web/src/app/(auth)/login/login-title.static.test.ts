/**
 * TUL-518: the /es/login tab title is Spanish, not the root English tagline.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createTranslator } from "@/i18n/messages";

const root = path.resolve(process.cwd());

test("login metadata titles the tab with the localized login title", () => {
  const page = readFileSync(path.join(root, "src/app/(auth)/login/page.tsx"), "utf8");
  assert.match(page, /export async function generateMetadata\(/);
  assert.match(page, /return \{ title: t\("public\.auth\.login\.title"\) \}/);
});

test("the login title exists in Spanish and English", () => {
  assert.equal(createTranslator("es")("public.auth.login.title"), "Iniciar sesión");
  assert.equal(createTranslator("en")("public.auth.login.title"), "Log in");
});
