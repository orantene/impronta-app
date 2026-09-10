import test from "node:test";
import assert from "node:assert/strict";

import { createTranslator } from "@/i18n/messages";

import {
  ACTION_REFUSALS,
  ATTENDANCE_REFUSALS,
  CHECKIN_REFUSALS,
  NO_SLOTS_REFUSALS,
  SLOTS_REFUSALS,
  WALKIN_REFUSALS,
  checkInRefusalKey,
  walkInRefusalKey,
} from "./refusals";

const EVERY_KEY = new Set([
  ...Object.values(ACTION_REFUSALS),
  ...Object.values(ATTENDANCE_REFUSALS),
  ...Object.values(CHECKIN_REFUSALS),
  ...Object.values(NO_SLOTS_REFUSALS),
  ...Object.values(SLOTS_REFUSALS),
  ...Object.values(WALKIN_REFUSALS),
]);

for (const locale of ["en", "es", "fr"] as const) {
  test(`every refusal the mode can map has a sentence in ${locale}`, async () => {
    const t = await createTranslator(locale);
    for (const key of EVERY_KEY) {
      const sentence = t(`dashboard.pos.classes.refusal.${key}`);
      assert.notEqual(sentence, `dashboard.pos.classes.refusal.${key}`, `${locale}: no sentence for ${key}`);
      assert.ok(sentence.trim().length > 0);
    }
  });
}

test("an unknown word never falls through to a wrong sentence; it becomes the cautious one", () => {
  assert.equal(checkInRefusalKey("something_new"), "unavailable");
  assert.equal(checkInRefusalKey(undefined), "unavailable");
  assert.equal(walkInRefusalKey("slot_taken"), "timeTaken");
  assert.equal(walkInRefusalKey("sold_out"), "roomFull");
  assert.equal(walkInRefusalKey("pay_in_person_not_allowed"), "mustPayOnline");
  // A blank name on the walk-in is the one `invalid` that names its cause.
  assert.equal(walkInRefusalKey("invalid"), "nameRequired");
});
