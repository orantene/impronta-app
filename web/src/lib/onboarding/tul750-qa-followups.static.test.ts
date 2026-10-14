import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isTulalaBrandLabel } from "../brand/is-tulala-brand-label";

// TUL-750/16/683 staging QA follow-ups.
const WEB = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

test("TUL-683: strip items named Tulala render the logo component, not serif text", () => {
  assert.equal(isTulalaBrandLabel("TULALA"), true);
  assert.equal(isTulalaBrandLabel(" Tulala "), true);
  assert.equal(isTulalaBrandLabel("Tulala Studio"), false);
  for (const f of ["src/lib/site-admin/sections/trust_strip/Component.tsx", "src/lib/site-admin/sections/press_strip/Component.tsx"]) {
    const src = read(f);
    assert.match(src, /isTulalaBrandLabel\(/, f);
    assert.match(src, /<TulalaWordmark/, f);
  }
});

test("TUL-750/16: /account area carries the shared header with the logo", () => {
  const src = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(src, /data-account-header/);
  assert.match(src, /<TulalaLogo/);
});

test("TUL-750/16: every sign-out label is localized (en Log out / es Cerrar sesión)", () => {
  const en = JSON.parse(read("messages/en.json"));
  const es = JSON.parse(read("messages/es.json"));
  assert.equal(en.public.clientAccountArea.logOut, "Log out");
  assert.equal(es.public.clientAccountArea.logOut, "Cerrar sesión");
  assert.equal(es.public.clientAccount.logOut, "Cerrar sesión");
  assert.equal(es.public.header.signOutAria, "Cerrar sesión");
  const menu = read("src/components/account-menu.tsx");
  assert.doesNotMatch(menu, /<span>Sign out<\/span>/);
  assert.match(menu, /\{signOutLabel\}/);
  for (const f of ["src/components/public-header.tsx", "src/components/site-shell/HeaderAuthArea.tsx"]) {
    assert.match(read(f), /signOutLabel=\{t\("public\.header\.signOutAria"\)\}/, f);
  }
});

test("TUL-750/16: sign-up passes the locale to the confirm email (redirect lang + metadata) and the hook falls back to it", () => {
  const actions = read("src/app/auth/actions.ts");
  assert.ok((actions.match(/&lang=\$\{lang\}/g) ?? []).length >= 2);
  assert.equal((actions.match(/data: \{[^}]*\blang\b/g) ?? []).length, 2);
  const hook = readFileSync(join(WEB, "../supabase/functions/send-email-hook/index.ts"), "utf8");
  assert.match(hook, /user\.user_metadata\?\.lang/);
  assert.match(hook, /Confirma tu correo/);
  const live = read("src/app/api/hooks/auth-email/route.ts");
  assert.match(live, /payload\.user\?\.user_metadata\?\.lang/);
});
