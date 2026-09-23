import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmsByHandCopy, talentOffersInstantBooking } from "./talent-booking-mode";

test("only Portfolio can book a time; free, Pro, and a missing plan confirm by hand", () => {
  assert.equal(talentOffersInstantBooking("talent_portfolio"), true);
  assert.equal(talentOffersInstantBooking("talent_basic"), false);
  assert.equal(talentOffersInstantBooking("talent_pro"), false);
  assert.equal(talentOffersInstantBooking(null), false);
  assert.equal(talentOffersInstantBooking("website"), false);
});

test("the hand-confirmation line is EN, ES, and FR", () => {
  assert.equal(confirmsByHandCopy("en"), "She confirms by hand.");
  assert.equal(confirmsByHandCopy("es"), "Ella confirma a mano.");
  assert.equal(confirmsByHandCopy("fr"), "Elle confirme à la main.");
  assert.equal(confirmsByHandCopy(null), "She confirms by hand.");
});
