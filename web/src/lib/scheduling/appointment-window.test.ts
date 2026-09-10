/**
 * appointment-window.test.ts — which window a purchase's booking is AT.
 *
 * THE CLAIM UNDER TEST is not "the function returns an object". It is that a
 * purchase which took somebody's calendar hands the booking that calendar's
 * window, that a purchase which took nobody's time hands it NOTHING rather
 * than a fabricated instant, and that a window the reschedule RPC would refuse
 * as `bad_window` never reaches the board at all.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { appointmentWindowFor } from "@/lib/scheduling/appointment-window";

const NINE = "2026-09-10T15:00:00.000Z";
const NINE_FORTY_FIVE = "2026-09-10T15:45:00.000Z";
const TEN = "2026-09-10T16:00:00.000Z";
const ELEVEN = "2026-09-10T17:00:00.000Z";

test("a reservation is the appointment's window", () => {
  assert.deepEqual(
    appointmentWindowFor({ reservation: { startsAt: NINE, endsAt: NINE_FORTY_FIVE } }),
    { startsAt: NINE, endsAt: NINE_FORTY_FIVE },
  );
});

test("a purchase that takes no time gets no window", () => {
  assert.equal(appointmentWindowFor({}), null);
  assert.equal(appointmentWindowFor({ reservation: null, holds: [] }), null);
});

test("the reservation wins over companion holds of the same booking", () => {
  const window = appointmentWindowFor({
    reservation: { startsAt: TEN, endsAt: ELEVEN },
    holds: [{ startsAt: NINE, endsAt: NINE_FORTY_FIVE }],
  });
  assert.deepEqual(window, { startsAt: TEN, endsAt: ELEVEN });
});

test("with no reservation the earliest hold stands in for it", () => {
  const window = appointmentWindowFor({
    holds: [
      { startsAt: TEN, endsAt: ELEVEN },
      { startsAt: NINE, endsAt: NINE_FORTY_FIVE },
    ],
  });
  assert.deepEqual(window, { startsAt: NINE, endsAt: NINE_FORTY_FIVE });
});

test("a window the reschedule RPC would refuse never reaches the board", () => {
  // ends before starts, ends equal to starts, and an unparsable instant are
  // three ways to write a window nothing can hold. None of them is repaired.
  assert.equal(
    appointmentWindowFor({ reservation: { startsAt: ELEVEN, endsAt: TEN } }),
    null,
  );
  assert.equal(appointmentWindowFor({ reservation: { startsAt: TEN, endsAt: TEN } }), null);
  assert.equal(
    appointmentWindowFor({ reservation: { startsAt: "whenever", endsAt: TEN } }),
    null,
  );
});

test("one unusable hold does not lose a usable one", () => {
  const window = appointmentWindowFor({
    holds: [
      { startsAt: "", endsAt: "" },
      { startsAt: TEN, endsAt: ELEVEN },
    ],
  });
  assert.deepEqual(window, { startsAt: TEN, endsAt: ELEVEN });
});
