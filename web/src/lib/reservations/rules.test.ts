import test from "node:test";
import assert from "node:assert/strict";
import {
  depositCentsForParty,
  noShowFeeCentsForParty,
  parseServiceRules,
  parseTurnTimeBands,
  requiresCardOnFile,
  turnMinutesForParty,
} from "./rules";

const GOOD_BANDS = [
  { minParty: 1, maxParty: 2, turnMinutes: 75 },
  { minParty: 3, maxParty: 4, turnMinutes: 90 },
  { minParty: 5, maxParty: 8, turnMinutes: 120 },
];

test("bands parse when every entry is well formed", () => {
  assert.deepEqual(parseTurnTimeBands(GOOD_BANDS), GOOD_BANDS);
});

test("bands accept snake_case, because that is what the JSONB will hold", () => {
  assert.deepEqual(parseTurnTimeBands([{ min_party: 1, max_party: 4, turn_minutes: 90 }]), [
    { minParty: 1, maxParty: 4, turnMinutes: 90 },
  ]);
});

test("ONE malformed band discards the WHOLE table, never a partial list", () => {
  // A half-read band table is a turn time that is wrong for exactly the party
  // sizes whose rows broke, and nobody finds out until a table is double-seated.
  const withOneBadRow = [...GOOD_BANDS, { minParty: 9, maxParty: "twelve", turnMinutes: 150 }];
  assert.deepEqual(parseTurnTimeBands(withOneBadRow), []);
});

test("overlapping bands are refused rather than resolved by order", () => {
  // "First match wins" would make the turn time depend on how the rows happen
  // to be sorted, which is not a decision anyone made.
  assert.deepEqual(
    parseTurnTimeBands([
      { minParty: 1, maxParty: 4, turnMinutes: 90 },
      { minParty: 4, maxParty: 8, turnMinutes: 120 },
    ]),
    [],
  );
});

test("an inverted band is refused", () => {
  assert.deepEqual(parseTurnTimeBands([{ minParty: 6, maxParty: 2, turnMinutes: 90 }]), []);
});

test("garbage of every shape yields no bands and never throws", () => {
  for (const junk of [null, undefined, 0, "", "[]", {}, [], [null], [[]], [{}]]) {
    assert.deepEqual(parseTurnTimeBands(junk), [], `for ${JSON.stringify(junk)}`);
  }
});

test("a malformed blob falls back to the DEFAULT turn, never to a guess", () => {
  const rules = parseServiceRules(
    { turn_time_bands: "not json at all", default_turn_minutes: 90 },
    "v1",
  );
  assert.equal(rules.turnTimeBands.length, 0);
  for (const party of [1, 2, 4, 6, 8]) {
    assert.equal(turnMinutesForParty(rules, party), 90);
  }
});

test("a party outside every band gets the default, not the nearest band", () => {
  const rules = parseServiceRules({ turn_time_bands: GOOD_BANDS, default_turn_minutes: 90 }, "v1");
  assert.equal(turnMinutesForParty(rules, 2), 75);
  assert.equal(turnMinutesForParty(rules, 8), 120);
  // 12 is outside every band. Borrowing 120 from the 5-8 band would invent a
  // rule nobody wrote.
  assert.equal(turnMinutesForParty(rules, 12), 90);
});

test("a null threshold means NEVER ASK, and is not 0 and not a sentinel", () => {
  const never = parseServiceRules({ card_on_file_from_party: null }, "v1");
  assert.equal(never.cardOnFileFromParty, null);
  for (const party of [1, 6, 50]) assert.equal(requiresCardOnFile(never, party), false);

  const fromSix = parseServiceRules({ card_on_file_from_party: 6 }, "v1");
  assert.equal(requiresCardOnFile(fromSix, 5), false);
  assert.equal(requiresCardOnFile(fromSix, 6), true);
});

test("a bad threshold collapses to null, never to 0", () => {
  // 0 would mean "ask every party of one" — the opposite of what a broken
  // value should produce.
  for (const bad of [0, -3, "six", {}, 1.5]) {
    assert.equal(parseServiceRules({ card_on_file_from_party: bad }, "v1").cardOnFileFromParty, null);
  }
});

test("deposit is per person above the threshold, and zero below it", () => {
  const rules = parseServiceRules(
    { deposit_from_party: 8, deposit_cents_per_person: 2000 },
    "v1",
  );
  assert.equal(depositCentsForParty(rules, 7), 0);
  assert.equal(depositCentsForParty(rules, 8), 16_000);
});

test("no-show fee honours its basis", () => {
  const perPerson = parseServiceRules(
    { no_show_fee_cents: 1500, no_show_fee_basis: "per_person" },
    "v1",
  );
  const perParty = parseServiceRules(
    { no_show_fee_cents: 1500, no_show_fee_basis: "per_party" },
    "v1",
  );
  assert.equal(noShowFeeCentsForParty(perPerson, 4), 6000);
  assert.equal(noShowFeeCentsForParty(perParty, 4), 1500);
});

test("BIGINT arriving as a string is money, not zero", () => {
  const rules = parseServiceRules({ no_show_fee_cents: "1500" }, "v1");
  assert.equal(rules.noShowFeeCents, 1500);
});

test("an empty row is a complete, closed set of defaults", () => {
  const rules = parseServiceRules({}, "v1");
  assert.equal(rules.isActive, false, "a venue is not taking reservations until it says so");
  assert.equal(rules.allowPublicUpsize, false, "online upsizing is off by default");
  assert.equal(rules.walkinsEnabled, true);
  assert.equal(rules.cardOnFileFromParty, null);
  assert.equal(rules.depositFromParty, null);
  assert.equal(rules.defaultTurnMinutes, 90);
});

test("a max party below the min widens to the min rather than offering nothing", () => {
  const rules = parseServiceRules({ party_size_min: 4, party_size_max: 2 }, "v1");
  assert.equal(rules.partySizeMin, 4);
  assert.equal(rules.partySizeMax, 4);
});

test("a venue with no reservation offering parses as not-bookable, not as broken", () => {
  // Rules and windows can exist before a catalog row does, and they should:
  // the settings page is usable and only the BOOKING refuses, with a reason.
  assert.equal(parseServiceRules({}, "v1").reservationOfferingId, null);
  assert.equal(parseServiceRules({ reservation_offering_id: "" }, "v1").reservationOfferingId, null);
  assert.equal(
    parseServiceRules({ reservation_offering_id: 12345 }, "v1").reservationOfferingId,
    null,
  );
  assert.equal(
    parseServiceRules({ reservation_offering_id: "f0b1c2d3-0000-4000-8000-000000000001" }, "v1")
      .reservationOfferingId,
    "f0b1c2d3-0000-4000-8000-000000000001",
  );
});
