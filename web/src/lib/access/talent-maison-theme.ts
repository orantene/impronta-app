/**
 * Dark-launch switch for the Maison free-website theme (Theme Gallery + setup).
 *
 * Same shape as `TALENT_AGENDA_V2`:
 *   unset | 0 | false → off for every talent (default; production until audit)
 *   talents           → only profile ids in `TALENT_MAISON_THEME_TALENTS`
 *   1 | true | all    → every talent
 *
 * Why a fourth flag: the three existing talent-site flags are already on in
 * production. Shipping Maison into the catalog without its own switch would
 * show a half-built theme to real talents.
 *
 * Owner ruling (2026-09-27): stay OFF in production for everyone; enable
 * QA fixtures via `talents` + allow-list (not `all` until audit is done).
 * Prod cohort (Vercel `TALENT_MAISON_THEME_TALENTS`): TAL-QAFIXFREE
 * (`6d4e7d73-8577-42fb-b0d3-d2e55a64ca14`) and demo-jor-clone / TAL-93900
 * (`c99f8adb-8ebb-4aad-911a-897e73efd369`, pinned in `clone-jor.mts`).
 * Do not put live Jor (`f048e578-…` / TAL-JORGBEAUTY) on the allow-list.
 */

export type MaisonThemeMode = "off" | "talents" | "all";

export function readMaisonThemeMode(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.TALENT_MAISON_THEME_ENABLED
    : undefined,
): MaisonThemeMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "true" || v === "1") return "all";
  if (v === "talents") return "talents";
  return "off";
}

export function readMaisonThemeTalentAllowlist(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.TALENT_MAISON_THEME_TALENTS
    : undefined,
): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Should Maison theme surfaces render for this talent profile?
 * Mode `off` always returns false, even if the id is on the allow-list.
 * Mode `all` returns true (talent id optional).
 * Mode `talents` requires a matching allow-list id.
 */
export function isTalentMaisonThemeEnabled(
  talentProfileId?: string | null,
  opts?: { mode?: MaisonThemeMode; allowlist?: ReadonlySet<string> },
): boolean {
  const mode = opts?.mode ?? readMaisonThemeMode();
  if (mode === "off") return false;
  if (mode === "all") return true;
  if (!talentProfileId) return false;
  const allow = opts?.allowlist ?? readMaisonThemeTalentAllowlist();
  return allow.has(talentProfileId);
}
