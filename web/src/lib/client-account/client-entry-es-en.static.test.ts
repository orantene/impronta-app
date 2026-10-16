/**
 * TUL-1191: ES/EN sweep of the client account entry (sign-in, register, email code, /account).
 *
 * 1. Every /account renderer takes its language from resolveAccountLocale (URL, then the language
 *    cookie, then the saved account language), never from the path-derived locale header alone.
 * 2. The client-entry dictionary namespaces stay translated: same keys in both languages, and no
 *    Spanish value that is just the English text.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), "utf8");

test("both /account renderers resolve the language with resolveAccountLocale, not getRequestLocale", () => {
  for (const file of ["render-area.tsx", "render-tenant-area.tsx"]) {
    const src = read(file);
    assert.match(src, /import \{ resolveAccountLocale \} from "\.\/account-locale\.server"/, `${file} imports the resolver`);
    assert.match(src, /await resolveAccountLocale\(/, `${file} calls the resolver`);
    assert.doesNotMatch(src, /getRequestLocale/, `${file} no longer reads the path-derived locale directly`);
  }
});

test("resolveAccountLocale follows URL, then cookie, then saved language, and checks its read", () => {
  const src = read("account-locale.server.ts");
  assert.match(src, /LOCALE_COOKIE/);
  assert.match(src, /pickClientLayoutLocale\(/);
  assert.match(src, /urlNamesLocale\(/);
  assert.match(src, /select\("preferred_locale"\)/);
  assert.match(src, /const \{ data, error \} = await admin/, "the saved-language read destructures its error");
  assert.match(src, /logServerError\(/);
});

type Json = { [k: string]: Json } | string | number | boolean | null | Json[];

function flat(node: Json, prefix = "", out: Record<string, Json> = {}): Record<string, Json> {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = node;
  }
  return out;
}

const en = flat(JSON.parse(read("..", "..", "..", "messages", "en.json")) as Json);
const es = flat(JSON.parse(read("..", "..", "..", "messages", "es.json")) as Json);

/** Namespaces the client account entry reads. */
const ENTRY_PREFIXES = [
  "public.auth",
  "public.clientAccount",
  "public.header.account",
  "public.onboarding.code",
  "public.keyboard",
  "public.client",
];
const inEntry = (key: string) => ENTRY_PREFIXES.some((p) => key.startsWith(p));
/** Brand and technical words that are the same in both languages. */
const SAME_IN_BOTH = new Set(["google", "apple", "email", "whatsapp"]);

test("client-entry dictionary namespaces have the same keys in English and Spanish", () => {
  const missingInEs = Object.keys(en).filter((k) => inEntry(k) && !(k in es));
  const missingInEn = Object.keys(es).filter((k) => inEntry(k) && !(k in en));
  assert.deepEqual(missingInEs, [], "keys missing in es.json");
  assert.deepEqual(missingInEn, [], "keys missing in en.json");
});

test("no client-entry Spanish value is just the English text", () => {
  const untranslated: string[] = [];
  for (const [key, value] of Object.entries(en)) {
    if (!inEntry(key) || typeof value !== "string") continue;
    const spanish = es[key];
    if (typeof spanish !== "string") continue;
    const letters = value.replace(/[^A-Za-z]/g, "");
    if (spanish === value && letters.length > 3 && !SAME_IN_BOTH.has(value.trim().toLowerCase())) {
      untranslated.push(`${key} = ${value}`);
    }
  }
  assert.deepEqual(untranslated, [], "Spanish values identical to English (translate them or add a brand-word exception)");
});
