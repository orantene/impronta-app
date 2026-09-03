import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * booking-hours-timezone-fallback.test.ts — clearing the timezone box must
 * INHERIT, never write the literal "UTC".
 *
 * THE BUG THIS PINS: every workspace in production runs on UTC and not one of
 * them chose it, so every hour this feature has ever shown or sent was an hour
 * in somebody else's day. The load path was fixed (the editor now opens on the
 * venue -> workspace -> setting answer). The residue was the CLEAR path: the
 * field fell back to a hardcoded "UTC", so an operator who emptied the box to
 * reset it did not inherit — they silently persisted a zone nobody picked, and
 * saving made the wrong answer real.
 *
 * A grep guard rather than a render test because the card is a client
 * component with no test renderer in this lane, and the thing worth protecting
 * is one literal.
 */

const CARD = resolve(
  process.cwd(),
  "src/components/appointments/BookingHoursCard.tsx",
);

test("clearing the timezone field falls back to the resolved default", () => {
  const src = readFileSync(CARD, "utf8");

  assert.match(
    src,
    /e\.target\.value\.trim\(\)\s*\|\|\s*resolvedDefault/,
    'the timezone input must fall back to the resolved venue/workspace zone; ' +
      'falling back to a literal is how an unchosen zone becomes real',
  );

  assert.doesNotMatch(
    src,
    /e\.target\.value\.trim\(\)\s*\|\|\s*"UTC"/,
    'the timezone input must not fall back to the literal "UTC"',
  );

  assert.match(
    src,
    /setResolvedDefault\(res\.defaultTimezone\)/,
    "the card must keep the loader's resolved default so it has something to inherit",
  );
});
