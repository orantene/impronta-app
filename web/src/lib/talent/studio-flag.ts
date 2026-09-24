/**
 * Talent Studio v2.
 * Production default is off (NODE_ENV is "production" and the env var is unset).
 * This local dashboard turns it on because `next dev` sets NODE_ENV=development.
 * TALENT_STUDIO_V2=0 forces it off. TALENT_STUDIO_V2=1 forces it on.
 */
export function talentStudioV2Enabled(): boolean {
  if (process.env.TALENT_STUDIO_V2 === "0") return false;
  if (process.env.TALENT_STUDIO_V2 === "1") return true;
  return process.env.NODE_ENV === "development";
}
