/**
 * Talent Studio v2 (Presence tabs, identity bar, Messages v5 path, mobile nav).
 *
 * Explicit env only — never default ON from NODE_ENV. Local and prod behave the
 * same: unset/missing → OFF. Set TALENT_STUDIO_V2=1 (or true/on) to enable;
 * TALENT_STUDIO_V2=0 (or false/off) forces off.
 */

export type StudioFlagEnv = {
  TALENT_STUDIO_V2?: string;
  NODE_ENV?: string;
};

export function talentStudioV2Enabled(
  env: StudioFlagEnv = typeof process !== "undefined" ? process.env : {},
): boolean {
  const raw = (env.TALENT_STUDIO_V2 ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return false;
}
