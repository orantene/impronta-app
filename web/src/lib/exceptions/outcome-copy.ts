/**
 * outcome-copy.ts — the answers the Issues inbox gives as IDS, not sentences.
 *
 * WHY IDS. `resumeException` runs on the server and answers in English; the
 * inbox ships in three languages. A sentence composed in `resume.ts` renders
 * English prose to a Spanish or French operator, which is the same defect the
 * settings cards fixed with `lib/settings/refusals.ts`. An id travels instead,
 * and the screen looks the sentence up in the reader's own catalogue.
 *
 * WHY THIS IS NOT YET EVERY ANSWER ON THE SURFACE. The runner's own
 * `message` — "minting stopped part way: …", "the recovery arm did not
 * confirm: …" — names WHICH part of a partial landed, and nothing composed
 * from an id could say that. Those stay as they are, and `resumeExceptionAction`
 * still prefers them. This vocabulary covers the answers that are decisions
 * rather than diagnostics, starting with the one that was actively wrong.
 *
 * PURITY: no imports. Read from a server module, a client component and a
 * plain node guard alike.
 */

/**
 * Every keyed answer. Each is a key under `dashboard.issues.result.*` and must
 * have its own sentence in en, es and fr — `outcome-copy.static.test.ts` fails
 * the build otherwise.
 */
export const RESUME_OUTCOME_KEYS = ["seatLostAfterPayment"] as const;

export type ResumeOutcomeKey = (typeof RESUME_OUTCOME_KEYS)[number];

export function isResumeOutcomeKey(value: string): value is ResumeOutcomeKey {
  return (RESUME_OUTCOME_KEYS as readonly string[]).includes(value);
}
