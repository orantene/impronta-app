/**
 * Every Package 1 engine refusal code has a sentence in en, es and fr.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const WEB = process.cwd();
const CODES = [
  "over_limit",
  "pin_invalid",
  "not_manager",
  "already_approved",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
  "unavailable",
  "locked",
  "no_session",
  "already_linked",
  "nothing_owed",
  "already_collected",
  "negative",
  "not_draft",
  "exceeds_outstanding",
  "provider_unavailable",
  "expired",
  "not_open",
  "space_occupied",
  "lines_paid",
  "no_place",
  "already_accepted",
  "amount",
  "already_closed",
] as const;

function load(locale: "en" | "es" | "fr"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(WEB, "messages", `${locale}.json`), "utf8")) as Record<string, unknown>;
}

function at(root: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

test("every engine refusal code has en es fr sentences and no em dash", () => {
  const en = load("en");
  const es = load("es");
  const fr = load("fr");
  for (const code of CODES) {
    const path = ["dashboard", "pos", "engine", "refusal", code];
    const enS = at(en, path);
    const esS = at(es, path);
    const frS = at(fr, path);
    assert.equal(typeof enS, "string", `en missing ${code}`);
    assert.equal(typeof esS, "string", `es missing ${code}`);
    assert.equal(typeof frS, "string", `fr missing ${code}`);
    for (const sentence of [enS, esS, frS] as string[]) {
      assert.doesNotMatch(sentence, /\u2014/, `${code} has an em dash`);
    }
  }
});
