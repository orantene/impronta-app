/**
 * Custom clauses: the free-text booking rules a talent writes herself, one
 * ordered list per language. Part of the immutable policy VERSION
 * (`talent_policy_versions.custom_clauses`). Pure: parsing, validation and
 * the per-visitor choice of list. No machine translation: a visitor whose
 * language list is empty reads the other language's list, as written.
 */

import type { PolicyLocale } from "./render";

export type CustomClauses = { es: string[]; en: string[] };

export const CUSTOM_CLAUSES_MAX_ITEMS = 20;
export const CUSTOM_CLAUSE_MAX_CHARS = 400;

export type CustomClausesError = "too_many" | "too_long";

/**
 * Tolerant read of a stored value: anything malformed, or with no lines at all,
 * is "no custom clauses" (fail closed, never throws).
 */
export function parseCustomClauses(raw: unknown): CustomClauses | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const lines = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0)
      : [];
  const out = { es: lines(o.es), en: lines(o.en) };
  return out.es.length + out.en.length > 0 ? out : null;
}

/** A textarea value (one rule per line) to ordered lines, blanks dropped. */
export function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Lines back to a textarea value. */
export function textFromLines(lines: readonly string[]): string {
  return lines.join("\n");
}

/**
 * Strict check for what a talent saves: trims, drops blank lines, enforces the
 * limits (the same ones the DB CHECK enforces). Empty in both languages is
 * `null`, i.e. no custom clauses.
 */
export function validateCustomClauses(
  input: { es: readonly string[]; en: readonly string[] } | null | undefined,
): { ok: true; value: CustomClauses | null } | { ok: false; error: CustomClausesError } {
  if (!input) return { ok: true, value: null };
  const clean = (xs: readonly string[]) => xs.map((x) => String(x).trim()).filter((x) => x.length > 0);
  const value = { es: clean(input.es ?? []), en: clean(input.en ?? []) };
  for (const list of [value.es, value.en]) {
    if (list.length > CUSTOM_CLAUSES_MAX_ITEMS) return { ok: false, error: "too_many" };
    if (list.some((l) => l.length > CUSTOM_CLAUSE_MAX_CHARS)) return { ok: false, error: "too_long" };
  }
  return { ok: true, value: value.es.length + value.en.length > 0 ? value : null };
}

/** The list a visitor reads: their language, else the other one, else none. */
export function customClausesFor(clauses: CustomClauses | null | undefined, locale: PolicyLocale): string[] {
  if (!clauses) return [];
  const mine = locale === "es" ? clauses.es : clauses.en;
  if (mine.length > 0) return mine;
  return locale === "es" ? clauses.en : clauses.es;
}

export function sameCustomClauses(a: CustomClauses | null, b: CustomClauses | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const CUSTOM_CLAUSES_HEADING: Record<PolicyLocale, string> = {
  es: "Reglas del estudio",
  en: "Studio rules",
};
