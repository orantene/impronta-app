/**
 * Dark-launch switch for Website settings (WSF F1). Same shape as the Maison
 * flag (`talent-maison-theme.ts`):
 *   unset | 0 | false → off for every talent (default; production until audit)
 *   talents           → only profile ids in `TALENT_WEBSITE_SETTINGS_TALENTS`
 *   1 | true | all    → every talent
 *
 * QA: `talents` + the profile ids of the QA fixtures `qa-agenda-jor` and
 * `qa-fixture-free-talent` (ids differ per database; read them from
 * talent_profiles). Never put a live talent on the allow-list.
 */

export type WebsiteSettingsMode = "off" | "talents" | "all";

export function readWebsiteSettingsMode(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.TALENT_WEBSITE_SETTINGS_ENABLED
    : undefined,
): WebsiteSettingsMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "true" || v === "1") return "all";
  if (v === "talents") return "talents";
  return "off";
}

export function readWebsiteSettingsAllowlist(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.TALENT_WEBSITE_SETTINGS_TALENTS
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

/** Mode `off` always false, even for an allow-listed id. */
export function isTalentWebsiteSettingsEnabled(
  talentProfileId?: string | null,
  opts?: { mode?: WebsiteSettingsMode; allowlist?: ReadonlySet<string> },
): boolean {
  const mode = opts?.mode ?? readWebsiteSettingsMode();
  if (mode === "off") return false;
  if (mode === "all") return true;
  if (!talentProfileId) return false;
  const allow = opts?.allowlist ?? readWebsiteSettingsAllowlist();
  return allow.has(talentProfileId);
}
