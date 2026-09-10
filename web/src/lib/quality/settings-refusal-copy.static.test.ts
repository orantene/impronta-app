import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WEB_ROOT } from "./supabase-unchecked-read";
import {
  CLIENT_LOAD_REFUSAL,
  PAYMENT_PROVIDER_REFUSALS,
  POS_MODES_REFUSALS,
} from "../settings/refusals";

/**
 * A REFUSAL HAS TO REACH A PERSON AS A SENTENCE, IN THEIR OWN LANGUAGE.
 *
 * Both asynchronous settings cards used to render `auth.error` — English
 * prose written by `requireWorkspaceStaffAction` for a server log — straight
 * onto a screen that ships in three languages. The actions now answer with an
 * id and the card looks the sentence up. That only works while every id has
 * copy in every locale, which is what this guard holds.
 *
 * It also holds the direction: an id must not be answered with the SAME
 * string in two languages, because a catalogue entry copied from English is
 * how an untranslated refusal hides behind a green guard.
 */

const LOCALES = ["en", "es", "fr"] as const;

type Catalog = Record<string, unknown>;

const catalogs = new Map<string, Catalog>(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(WEB_ROOT, "messages", `${l}.json`), "utf8")) as Catalog]),
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

const CARDS = [
  {
    name: "Point of sale › Selling modes",
    keyBase: "dashboard.adminWorkspace.posModes",
    ids: [...POS_MODES_REFUSALS, CLIENT_LOAD_REFUSAL],
  },
  {
    name: "Payments & providers",
    keyBase: "dashboard.adminWorkspace.paymentsProviders",
    ids: [...PAYMENT_PROVIDER_REFUSALS, CLIENT_LOAD_REFUSAL],
  },
] as const;

for (const card of CARDS) {
  test(`${card.name}: every refusal id has a sentence in en, es and fr`, () => {
    for (const id of card.ids) {
      const key = `${card.keyBase}.errors.${id}`;
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

  test(`${card.name}: the retry that clears a dead load is translated too`, () => {
    const key = `${card.keyBase}.retry`;
    const texts = LOCALES.map((locale) => lookup(catalogs.get(locale)!, key));
    for (const [i, value] of texts.entries()) {
      assert.equal(typeof value, "string", `${LOCALES[i]}.json is missing ${key}`);
    }
    assert.notEqual(texts[1], texts[0], `${key} is not translated into Spanish`);
    assert.notEqual(texts[2], texts[0], `${key} is not translated into French`);
  });
}

test("neither settings action returns an English sentence to the screen", () => {
  // The shape, not the list: any `error: "…"` literal in these two files is a
  // sentence that would render untranslated. `logServerError` still carries
  // the guard's own English to whoever is on call.
  for (const rel of [
    "src/lib/server-actions/pos-modes.ts",
    "src/lib/server-actions/payment-providers.ts",
  ]) {
    const src = readFileSync(join(WEB_ROOT, rel), "utf8");
    assert.doesNotMatch(
      src,
      /\berror:\s*"/,
      `${rel} returns a hard-coded English sentence; return a refusal id and let the card translate it`,
    );
  }
});

test("the counted noun on the roles card has both plural forms, in all three", () => {
  // "0 member" and "3 miembro" were what a single {count} string produced.
  for (const locale of LOCALES) {
    const node = lookup(catalogs.get(locale)!, "dashboard.adminWorkspace.rolesLimits.memberCount");
    assert.ok(node && typeof node === "object", `${locale}.json memberCount must be a one/other pair`);
    const pair = node as Record<string, unknown>;
    for (const form of ["one", "other"]) {
      assert.equal(typeof pair[form], "string", `${locale}.json memberCount.${form} is missing`);
      assert.match(pair[form] as string, /\{count\}/, `${locale}.json memberCount.${form} must show the count`);
    }
  }
});

test("GUARD BITES: an id with no copy is reported", () => {
  const key = "dashboard.adminWorkspace.posModes.errors.an_id_nobody_wrote_copy_for";
  for (const locale of LOCALES) {
    assert.equal(
      lookup(catalogs.get(locale)!, key),
      undefined,
      "the lookup used by this guard found copy that does not exist",
    );
  }
});
