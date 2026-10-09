/**
 * Which talent an ORPHAN inquiry (submitted, zero participants) belongs to, resolved
 * unambiguously or not at all. Pure; used by scripts/backfill-orphan-inquiry-participants.mts.
 *
 * Sources, in order of strength. All present sources must agree on ONE talent profile code or
 * id; any disagreement, or more than one candidate, is ambiguous and the inquiry is skipped:
 *   1. interpreted_query.talent.selected_ids (the lineup spine the guest chat wrote)
 *   2. interpreted_query.source_context.public_profile_code (or talent_ids)
 *   3. source_page `/t/<profile code>`
 */
import { selectedTalentIds } from "./promote-early-inquiry-pure";

export type OrphanRow = {
  interpreted_query?: unknown;
  source_page?: string | null;
};

export type OrphanResolution =
  | { ok: true; talentId?: string; profileCode?: string; how: string }
  | { ok: false; reason: string };

const PROFILE_CODE = /^TAL-\d{3,}$/i;

function contextCodes(iq: unknown): string[] {
  const sc = (iq as { source_context?: { public_profile_code?: unknown; talent_ids?: unknown } } | null)?.source_context;
  const out: string[] = [];
  if (typeof sc?.public_profile_code === "string" && PROFILE_CODE.test(sc.public_profile_code.trim())) out.push(sc.public_profile_code.trim().toUpperCase());
  return out;
}

function contextIds(iq: unknown): string[] {
  const ids = (iq as { source_context?: { talent_ids?: unknown } } | null)?.source_context?.talent_ids;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
}

function pageCode(sourcePage: string | null | undefined): string[] {
  const m = (sourcePage ?? "").match(/\/t\/(TAL-\d{3,})(?:[/?#]|$)/i);
  return m ? [m[1]!.toUpperCase()] : [];
}

export function resolveOrphanTalent(row: OrphanRow): OrphanResolution {
  const ids = [...new Set([...selectedTalentIds(row.interpreted_query), ...contextIds(row.interpreted_query)])];
  const codes = [...new Set([...contextCodes(row.interpreted_query), ...pageCode(row.source_page)])];
  if (ids.length > 1) return { ok: false, reason: `ambiguous: ${ids.length} talent ids on the lineup` };
  if (codes.length > 1) return { ok: false, reason: `ambiguous: profile codes disagree (${codes.join(", ")})` };
  if (ids.length === 0 && codes.length === 0) return { ok: false, reason: "no talent on the row (no lineup, no profile code, no /t/<code> page)" };
  const how = [
    selectedTalentIds(row.interpreted_query).length ? "interpreted_query.talent.selected_ids" : null,
    contextCodes(row.interpreted_query).length ? "source_context.public_profile_code" : null,
    pageCode(row.source_page).length ? "source_page" : null,
  ].filter(Boolean).join(" + ");
  return { ok: true, talentId: ids[0], profileCode: codes[0], how: how || "source_context.talent_ids" };
}
