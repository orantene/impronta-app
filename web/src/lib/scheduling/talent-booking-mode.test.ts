import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmsByHandCopy, talentOffersInstantBooking } from "./talent-booking-mode";

test("instant booking is allowed on every talent plan, including free and a missing plan", () => {
  assert.equal(talentOffersInstantBooking("talent_portfolio"), true);
  assert.equal(talentOffersInstantBooking("talent_basic"), true);
  assert.equal(talentOffersInstantBooking("talent_pro"), true);
  assert.equal(talentOffersInstantBooking(null), true);
});

test("the hand-confirmation line is EN, ES, and FR", () => {
  assert.equal(confirmsByHandCopy("en"), "She confirms by hand.");
  assert.equal(confirmsByHandCopy("es"), "Ella confirma a mano.");
  assert.equal(confirmsByHandCopy("fr"), "Elle confirme à la main.");
  assert.equal(confirmsByHandCopy(null), "She confirms by hand.");
});
