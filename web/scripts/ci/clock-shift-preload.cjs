/* eslint-disable @typescript-eslint/no-require-imports -- Node --require hooks must be CommonJS. */

// Test-only clock shift, loaded with `node --require`. Moves `new Date()` and
// `Date.now()` forward by CLOCK_SHIFT_DAYS (default 90). Explicit dates
// (`new Date("2026-10-09T15:00Z")`, `Date.UTC`, `Date.parse`) are untouched, so a
// test that pins its clock behaves the same and a test that silently reads the
// real clock against a fixed date fails. See run-clock-shift.mjs.

const days = Number(process.env.CLOCK_SHIFT_DAYS ?? "90");
const offsetMs = Number.isFinite(days) ? days * 24 * 60 * 60 * 1000 : 0;
const RealDate = Date;

class ShiftedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...args);
  }
  static now() {
    return RealDate.now() + offsetMs;
  }
}

globalThis.Date = ShiftedDate;
