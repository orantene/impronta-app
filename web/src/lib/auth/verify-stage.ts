/**
 * Staged copy for the slow "confirm the code" step (TUL-769). The server action
 * verifies the code, creates the account and sets up the page in one round
 * trip that can take 5-10 s, so the screen walks through honest stages by
 * elapsed time instead of sitting on one frozen label.
 */
export type VerifyStage = 0 | 1 | 2;

export const VERIFY_STAGE_AT_MS = [0, 2500, 6000] as const;

export function verifyStageAt(elapsedMs: number): VerifyStage {
  if (elapsedMs >= VERIFY_STAGE_AT_MS[2]) return 2;
  if (elapsedMs >= VERIFY_STAGE_AT_MS[1]) return 1;
  return 0;
}

/** Progress percent shown on the bar: always moving, never claims 100. */
export function verifyProgressPercent(elapsedMs: number): number {
  const p = 100 * (1 - Math.exp(-Math.max(0, elapsedMs) / 6000));
  return Math.min(92, Math.max(8, Math.round(p)));
}
