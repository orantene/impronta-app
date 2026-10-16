import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { getEmailCopy } from "./email-copy";

test("TUL-911: magic link / OTP email has a bilingual subject", () => {
  const en = getEmailCopy("en")["auth.magiclink"].subject;
  const es = getEmailCopy("es")["auth.magiclink"].subject;
  assert.ok(en && es);
  assert.notEqual(en, es);
  assert.match(es, /sesi/i);
});

test("TUL-911: hook route resolves locale (redirect ?lang, then user_metadata.lang) and subject from the copy catalog", () => {
  const src = readFileSync("src/app/api/hooks/auth-email/route.ts", "utf8");
  // TUL-1179 moved the ?lang read into authEmailLocale (adds the user_metadata.lang fallback).
  assert.match(src, /authEmailLocale\(data\.redirect_to, payload\.user\?\.user_metadata\?\.lang\)/);
  assert.match(readFileSync("src/lib/notifications/auth-email-locale.ts", "utf8"), /searchParams\.get\("lang"\)/);
  assert.match(src, /getEmailCopy\(locale\)\[copyKeyFor\(action\)\]\.subject/);
  assert.match(src, /case "magiclink":\s*return "auth\.magiclink"/);
});

test("TUL-911: supabase config declares the send_email hook with the env var the route verifies", () => {
  const cfg = readFileSync("../supabase/config.toml", "utf8");
  assert.match(cfg, /^\[auth\.hook\.send_email\]/m);
  assert.match(cfg, /uri = "http:\/\/host\.docker\.internal:3000\/api\/hooks\/auth-email"/);
  assert.match(cfg, /secrets = "env\(SEND_EMAIL_HOOK_SECRET\)"/);
  assert.match(readFileSync("src/app/api/hooks/auth-email/route.ts", "utf8"), /SEND_EMAIL_HOOK_SECRET/);
});
