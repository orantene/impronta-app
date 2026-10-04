import assert from "node:assert/strict";
import { test } from "node:test";

import { chatBookingsLabel } from "./chat-bookings-label";
import { resolveWords } from "./resolve";

test("private chef overrides the bookings tab; spa keeps the i18n default", () => {
  const chef = resolveWords({ presetId: "private_chef", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatBookingsLabel(chef), "Mis eventos");
  const chefEn = resolveWords({ presetId: "private_chef", overrides: {}, terminologyId: null }, "en");
  assert.equal(chatBookingsLabel(chefEn), "Your events");

  const spa = resolveWords({ presetId: "spa_wellness", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatBookingsLabel(spa), null);

  const salon = resolveWords({ presetId: "salon_barber", overrides: {}, terminologyId: null }, "es");
  assert.equal(chatBookingsLabel(salon), null);
});
