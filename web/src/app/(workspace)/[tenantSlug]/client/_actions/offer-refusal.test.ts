/**
 * D-174: the Approve & lock dialog printed `no_client_participant` raw. The
 * action names the refusal by code and the dialog reads the sentence from
 * the catalogue in en, es and fr.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { offerRefusalCode, type OfferRefusalCode } from "./offer-refusal";

const CODES: OfferRefusalCode[] = ["no_client_participant", "version_conflict", "forbidden", "unavailable"];

test("the engine's refusal words map to a code the dialog can say", () => {
  assert.equal(offerRefusalCode({ error: "no_client_participant" }), "no_client_participant");
  assert.equal(offerRefusalCode({ reason: "no_client_participant" }), "no_client_participant");
  assert.equal(offerRefusalCode({ conflict: true }), "version_conflict");
  assert.equal(offerRefusalCode({ forbidden: true }), "forbidden");
  assert.equal(offerRefusalCode({ error: "something_else" }), "unavailable");
  assert.equal(offerRefusalCode({}), "unavailable");
});

test("every refusal code has an en, es and fr sentence with no raw code and no em dash", () => {
  for (const locale of ["en", "es", "fr"] as const) {
    const catalog = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as {
      dashboard: { clientOffer: { refusal: Record<string, string> } };
    };
    for (const code of CODES) {
      const sentence = catalog.dashboard.clientOffer.refusal[code];
      assert.equal(typeof sentence, "string", `${locale}: ${code}`);
      assert.ok(sentence.length > 20, `${locale}: ${code} is a sentence`);
      assert.ok(!sentence.includes("_"), `${locale}: ${code} does not print a code`);
      assert.ok(!/[—–]/.test(sentence), `${locale}: ${code} has no em dash`);
    }
  }
});

test("the dialog reads the sentence by code and keeps the message as the fallback", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/client/messages/OfferTab.tsx"), "utf8");
  assert.match(src, /state\.code \? t\(`dashboard\.clientOffer\.refusal\.\$\{state\.code\}`\) : state\.message/);
  const action = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/client/_actions/inquiry-offer-actions.ts"), "utf8");
  const approve = action.slice(action.indexOf("export async function approveOfferAction("), action.indexOf("export async function rejectOfferAction("));
  assert.match(approve, /const code = offerRefusalCode\(result\);/, "the approve action names the refusal by code");
  assert.ok(!/message: result\.error \?\?/.test(approve), "the raw engine word is never the approve message");
});
