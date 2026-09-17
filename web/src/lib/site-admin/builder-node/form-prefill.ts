/**
 * form-prefill.ts — turn a page's query string into default values for the
 * `form` builder node.
 *
 * WHY. A marketing CTA ("Book the posing course", "Bring the show to my
 * hotel") should land the visitor on a form that already says what they
 * clicked, so the inquiry that reaches the inbox names the product without the
 * visitor retyping it. The convention is one query key per form field,
 * prefixed so an unrelated param can never leak into a field:
 *
 *   /p/experiences?f_service=Posing%20course&f_message=...#book
 *
 * Only the `f_` prefix is honoured, values are trimmed and capped, and empty
 * values are dropped — a prefill is a convenience, never a submission.
 */

export const FORM_PREFILL_PREFIX = "f_";
export const FORM_PREFILL_MAX_LENGTH = 600;

export type FormPrefill = Readonly<Record<string, string>>;

type SearchParamsLike = Readonly<Record<string, string | string[] | undefined>>;

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/** `{ f_service: "Posing" }` → `{ service: "Posing" }`. Never throws. */
export function formPrefillFromSearchParams(
  params: SearchParamsLike | null | undefined,
): FormPrefill | null {
  if (!params) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith(FORM_PREFILL_PREFIX)) continue;
    const name = key.slice(FORM_PREFILL_PREFIX.length);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") continue;
    const trimmed = value.replace(CONTROL_CHARS, "").trim();
    if (!trimmed) continue;
    out[name] = trimmed.slice(0, FORM_PREFILL_MAX_LENGTH);
  }
  return Object.keys(out).length ? out : null;
}

/** Build the query string a CTA should carry to prefill `fields`. */
export function formPrefillQuery(fields: Readonly<Record<string, string>>): string {
  const qs = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value.trim()) qs.set(`${FORM_PREFILL_PREFIX}${name}`, value.trim());
  }
  return qs.toString();
}
