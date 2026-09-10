/**
 * A KEYED ANSWER FROM THE ISSUES INBOX HAS TO REACH A PERSON AS A SENTENCE,
 * IN THEIR OWN LANGUAGE.
 *
 * Same shape and same reasoning as `lib/quality/settings-refusal-copy.static
 * .test.ts`: an id only works while every id has copy in every locale, and a
 * catalogue entry copied from English is how an untranslated answer hides
 * behind a green guard.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { WEB_ROOT } from "@/lib/quality/supabase-unchecked-read";
import { RESUME_OUTCOME_KEYS } from "./outcome-copy";

const LOCALES = ["en", "es", "fr"] as const;

type Catalog = Record<string, unknown>;

const catalogs = new Map<string, Catalog>(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(WEB_ROOT, "messages", `${l}.json`), "utf8")) as Catalog,
  ]),
);

function lookup(catalog: Catalog, key: string): unknown {
  let cur: unknown = catalog;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

test("every keyed Issues answer has its own sentence in en, es and fr", () => {
  assert.ok(RESUME_OUTCOME_KEYS.length > 0, "the vocabulary is empty, so this guard measures nothing");
  for (const id of RESUME_OUTCOME_KEYS) {
    const key = `dashboard.issues.result.${id}`;
    const seen = new Map<string, string>();
    for (const locale of LOCALES) {
      const value = lookup(catalogs.get(locale)!, key);
      assert.equal(typeof value, "string", `${locale}.json is missing ${key}`);
      const text = value as string;
      assert.ok(text.trim().length > 0, `${locale}.json has an empty ${key}`);
      seen.set(locale, text);
    }
    assert.notEqual(seen.get("es"), seen.get("en"), `${key} is not translated into Spanish`);
    assert.notEqual(seen.get("fr"), seen.get("en"), `${key} is not translated into French`);
  }
});

test("GUARD BITES: a key with no copy is reported", () => {
  const key = "dashboard.issues.result.an_id_nobody_wrote_copy_for";
  for (const locale of LOCALES) {
    assert.equal(lookup(catalogs.get(locale)!, key), undefined);
  }
});

test("no user-facing copy on this surface uses an em dash", () => {
  for (const id of RESUME_OUTCOME_KEYS) {
    for (const locale of LOCALES) {
      const text = lookup(catalogs.get(locale)!, `dashboard.issues.result.${id}`) as string;
      assert.ok(!text.includes("—"), `${locale}.json ${id} uses an em dash`);
    }
  }
});
