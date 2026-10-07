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
 * Prod (2026-10-04 Built-vs-Live): `TALENT_MAISON_THEME_ENABLED=all` so every
 * talent can apply Maison. The allow-list env is retained unused while
 * mode=all (legacy cohort: TAL-93939 + TAL-93900). Prefer `all` over
 * expanding the list for finished themes.
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
