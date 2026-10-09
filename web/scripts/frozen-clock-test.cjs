/**
 * Frozen wall clock for date-sensitive test lanes (test:scheduling).
 *
 * Slot and booking tests carry fixed fixture dates, while the code under test
 * often defaults `now = new Date()` (sanitizeSlotStart, firstSlotStart, ...).
 * A test that forgets to pass `now` then reads the REAL clock and rots: on
 * 2026-10-09 the TUL-275 tests (2026-10-08 fixtures) broke batch #3036.
 *
 * Required via NODE_OPTIONS, this pins `Date.now()` and `new Date()` (no
 * arguments) to one instant, so such a test fails or passes the same way on
 * every day. Only the Date clock is frozen: setTimeout/setInterval and
 * performance.now() keep running, so timer-based tests still work.
 *
 * Override with TEST_FROZEN_NOW (an ISO string) when a lane needs another day.
 */
"use strict";

const FROZEN_ISO = process.env.TEST_FROZEN_NOW || "2026-10-08T12:00:00.000Z";
const FROZEN_MS = Date.parse(FROZEN_ISO);
if (!Number.isFinite(FROZEN_MS)) throw new Error(`frozen-clock-test: bad TEST_FROZEN_NOW ${FROZEN_ISO}`);

const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FROZEN_MS);
    else super(...args);
  }
  static now() {
    return FROZEN_MS;
  }
}
FrozenDate.parse = RealDate.parse;
FrozenDate.UTC = RealDate.UTC;
globalThis.Date = FrozenDate;
globalThis.__FROZEN_TEST_NOW__ = FROZEN_ISO;
