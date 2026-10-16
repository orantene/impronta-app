import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { helpCorpusForLocale } from "./help-corpus-locale";

const HERE = dirname(fileURLToPath(import.meta.url));

test("TUL-882: the signed-in support AI grounds on the corpus for the request locale", () => {
  const route = readFileSync(join(HERE, "../../app/api/ai/support-chat/route.ts"), "utf8");
  assert.match(route, /retrieveHelpEntriesForLocale\(latestRequester\?\.body \?\? access\.ticket\.subject, reqLocale,/);
  assert.doesNotMatch(route, /\bretrieveHelpEntries\(/);
});

test("TUL-882: es and en select different corpora", () => {
  assert.notStrictEqual(helpCorpusForLocale("es-MX"), helpCorpusForLocale("en"));
  assert.strictEqual(helpCorpusForLocale("es"), helpCorpusForLocale("es_419"));
});
