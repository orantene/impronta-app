/**
 * Pure helpers for TUL-334: fxlank-only cleanup of qa-onb-choice test users.
 * No I/O — unit-tested. The runner wires guards + SQL.
 */

export const FXLANK_PROJECT_REF = "fxlankepwnvelxjrahwk";
export const PRODUCTION_PROJECT_REF = "pluhdapdnuiulvxmyspd";

/** Jorgelina — never selectable, never in a delete closure. */
export const JORGELINA_TALENT_PROFILE_ID = "f048e578-cbae-45db-9a3b-34239abea136";
export const JORGELINA_PROFILE_CODE = "TAL-93938";

/** Emails that look like onboarding-choice journey throwaways on the isolated DB. */
export function isQaOnbChoiceEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (domain !== "impronta.test") return false;
  // qa-onb-choice, qa-onb-choice-myself-…, qa-onb-choice.foo — not qa-onb-choices / qa-onb-admin
  return /^qa-onb-choice([+._-]|$)/.test(local);
}

/**
 * Project ref must be exactly the isolated qa-journeys branch.
 * Refuses production and any other ref (including empty).
 */
export function assertFxlankProjectRef(ref) {
  const r = typeof ref === "string" ? ref.trim() : "";
  if (r === PRODUCTION_PROJECT_REF) {
    return { ok: false, reason: "production_ref" };
  }
  if (r !== FXLANK_PROJECT_REF) {
    return { ok: false, reason: "not_fxlank", got: r || "(empty)" };
  }
  return { ok: true, ref: r };
}

/** Extract Supabase project ref from a https://<ref>.supabase.co URL (or empty). */
export function projectRefFromSupabaseUrl(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const host = new URL(url.trim()).hostname;
    const first = host.split(".")[0] ?? "";
    return first;
  } catch {
    return "";
  }
}

/**
 * Closure safety: every auth.users / talent_profiles / agencies row in the
 * expansion must be in the allow sets. Returns abort reasons (empty = ok).
 */
export function closureSafetyViolations(input) {
  const {
    targetUserIds,
    targetTalentIds,
    targetAgencyIds,
    foundUserIds = [],
    foundTalentIds = [],
    foundAgencyIds = [],
    jorgelinaTalentId = JORGELINA_TALENT_PROFILE_ID,
  } = input;
  const users = new Set(targetUserIds);
  const talents = new Set(targetTalentIds);
  const agencies = new Set(targetAgencyIds);
  const bad = [];

  for (const id of foundUserIds) {
    if (!users.has(id)) bad.push(`closure auth.users ${id} not a qa-onb-choice target`);
  }
  for (const id of foundTalentIds) {
    if (id === jorgelinaTalentId) bad.push("closure reached Jorgelina talent profile");
    else if (!talents.has(id)) bad.push(`closure talent_profiles ${id} not owned by a target user`);
  }
  for (const id of foundAgencyIds) {
    if (!agencies.has(id)) bad.push(`closure agencies ${id} not a qa-onb-% throwaway owned by a target`);
  }
  if (talents.has(jorgelinaTalentId)) bad.push("target set includes Jorgelina");
  return bad;
}

/**
 * Children-first table order for a delete transaction.
 * `order` is discovery (parents first); reverse for deletes.
 */
export function deleteStatementsChildrenFirst(order, foundKeys, keyExpr, qIdent, litArr) {
  const stmts = ["begin;"];
  for (const table of [...order].reverse()) {
    const keys = [...(foundKeys.get(table) || [])];
    if (!keys.length) continue;
    const expr = keyExpr(table, "c");
    if (!expr) continue;
    stmts.push(`delete from ${qIdent(table)} c where ${expr} = any(${litArr(keys)});`);
  }
  stmts.push("commit;");
  return stmts;
}
