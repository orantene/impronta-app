/**
 * Talent Agenda V2 gate (Today, Calendar, booking record, New).
 *
 * Master switch: `TALENT_AGENDA_V2` = off | false | 0 (default) | true | 1 | all | talents
 * Allow-list: `TALENT_AGENDA_V2_TALENTS` = comma-separated talent_profile ids
 *   (only when master is `talents`).
 *
 * When off, every talent keeps the legacy Today / Calendar pages.
 * Pure helpers stay free of Next.js so unit tests can import them.
 */

export type AgendaV2Mode = "off" | "talents" | "all";

export function readAgendaV2Mode(
  raw: string | undefined = typeof process !== "undefined" ? process.env.TALENT_AGENDA_V2 : undefined,
): AgendaV2Mode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "true" || v === "1") return "all";
  if (v === "talents") return "talents";
  return "off";
}

export function readAgendaV2TalentAllowlist(
  raw: string | undefined = typeof process !== "undefined"
    ? process.env.TALENT_AGENDA_V2_TALENTS
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
 * Should Agenda V2 render for this talent profile?
 * Flag off always returns false, even if the id is on the allow-list.
 */
export function isAgendaV2(
  talentProfileId: string | null | undefined,
  opts?: { mode?: AgendaV2Mode; allowlist?: ReadonlySet<string> },
): boolean {
  const mode = opts?.mode ?? readAgendaV2Mode();
  if (mode === "off") return false;
  if (mode === "all") return true;
  if (!talentProfileId) return false;
  const allow = opts?.allowlist ?? readAgendaV2TalentAllowlist();
  return allow.has(talentProfileId);
}
