import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeCaptionNorms,
  isRedundant,
  MIN_CARDS_FOR_NORMS,
  NO_CAPTION_NORMS,
} from "./caption-norms";

/** The shape the live Impronta roster had at audit time. */
function improntaLikeRoster() {
  const cards = [];
  for (let i = 0; i < 34; i++) {
    cards.push({
      locationLabel: "Playa del Carmen, MX",
      availabilityLabel: "Available from Jul 26",
    });
  }
  for (let i = 0; i < 6; i++) {
    cards.push({
      locationLabel: "Cancun, MX",
      availabilityLabel: "Available from Jul 26",
    });
  }
  for (let i = 0; i < 3; i++) {
    cards.push({
      locationLabel: null,
      availabilityLabel: "Availability unknown — ask to confirm",
    });
  }
  return cards;
}

test("finds the norms that made the live grid unreadable", () => {
  const norms = computeCaptionNorms(improntaLikeRoster());
  assert.equal(norms.dominantLocation, "Playa del Carmen, MX");
  assert.equal(norms.dominantAvailability, "Available from Jul 26");
});

test("the majority drops the redundant line, the exceptions keep theirs", () => {
  const norms = computeCaptionNorms(improntaLikeRoster());
  // 34 cards agree with the grid → their city line is noise
  assert.equal(isRedundant("Playa del Carmen, MX", norms.dominantLocation), true);
  // the Cancun minority is exactly the signal a client is scanning for
  assert.equal(isRedundant("Cancun, MX", norms.dominantLocation), false);
  // an availability nobody else has stays visible
  assert.equal(
    isRedundant("Availability unknown — ask to confirm", norms.dominantAvailability),
    false,
  );
});

test("a genuinely mixed grid keeps every line", () => {
  const mixed = [
    { locationLabel: "Tulum, MX", availabilityLabel: "Available from Jul 26" },
    { locationLabel: "Cancun, MX", availabilityLabel: "Available from Aug 2" },
    { locationLabel: "Playa del Carmen, MX", availabilityLabel: "Available now" },
    { locationLabel: "Merida, MX", availabilityLabel: "Available from Sep 1" },
    { locationLabel: "Tulum, MX", availabilityLabel: "Available from Jul 30" },
    { locationLabel: "Cancun, MX", availabilityLabel: "Available from Aug 9" },
    { locationLabel: "Bacalar, MX", availabilityLabel: "Available from Aug 3" },
  ];
  const norms = computeCaptionNorms(mixed);
  assert.equal(norms.dominantLocation, null);
  assert.equal(norms.dominantAvailability, null);
});

test("small grids never suppress — 'normal' is meaningless there", () => {
  const tiny = Array.from({ length: MIN_CARDS_FOR_NORMS - 1 }, () => ({
    locationLabel: "Playa del Carmen, MX",
    availabilityLabel: "Available from Jul 26",
  }));
  assert.deepEqual(computeCaptionNorms(tiny), NO_CAPTION_NORMS);
});

test("a majority of blanks does not crown a tiny minority as the norm", () => {
  // 3 cards share a city; 37 have none. Without measuring against the full
  // grid this would wrongly read as "everyone is in Cancun".
  const cards = [
    ...Array.from({ length: 3 }, () => ({
      locationLabel: "Cancun, MX",
      availabilityLabel: null,
    })),
    ...Array.from({ length: 37 }, () => ({
      locationLabel: null,
      availabilityLabel: null,
    })),
  ];
  assert.equal(computeCaptionNorms(cards).dominantLocation, null);
});

test("isRedundant is inert without a norm or a value", () => {
  assert.equal(isRedundant("Playa del Carmen, MX", null), false);
  assert.equal(isRedundant(null, "Playa del Carmen, MX"), false);
  assert.equal(isRedundant("", "Playa del Carmen, MX"), false);
});
