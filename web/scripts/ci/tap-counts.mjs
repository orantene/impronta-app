/**
 * tap-counts.mjs - pure helpers for run-orphan-tests.mjs.
 * A file that reports `# tests 0` (or prints no TAP summary at all) ran nothing
 * and must fail the run, even when the process exits 0.
 */

/** Sum the `# tests N` summary lines found in TAP text. Returns null when none. */
export function parseTapCounts(tap) {
  const re = /^# (tests|pass|fail) (\d+)\s*$/gm;
  const out = { tests: 0, pass: 0, fail: 0 };
  let seen = false;
  for (const m of tap.matchAll(re)) {
    out[m[1]] += Number(m[2]);
    seen = true;
  }
  return seen ? out : null;
}

/**
 * Judge one file's (or batch's) result. Returns { ok, reason }.
 * ok only when exit code is 0, a TAP summary exists, tests > 0 and fail === 0.
 */
export function assertNonZero(label, status, tap) {
  if (status !== 0) return { ok: false, reason: `${label}: exit code ${status}` };
  const counts = parseTapCounts(tap);
  if (!counts) return { ok: false, reason: `${label}: no TAP summary (ran no tests)` };
  if (counts.tests === 0) return { ok: false, reason: `${label}: reported 0 tests` };
  if (counts.fail > 0) return { ok: false, reason: `${label}: ${counts.fail} failing` };
  return { ok: true, reason: "" };
}
