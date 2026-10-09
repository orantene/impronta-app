/**
 * TUL-354 (live dashboard card checks): the pure parts, unit-tested without a browser or a database.
 *
 * The spec (`e2e-live/dashboard-cards.spec.ts`) signs in as the TEST talent TAL-93900 with the timing harness's
 * service-role minted session and READS the signed-in talent dashboard on production. Everything that decides a
 * verdict, or that guards against a write, lives here so it can fail in a unit test:
 *   - the target guard (TAL-93900 only; TAL-93938 Jorgelina is refused and never appears on a page we read);
 *   - the read-only action guard (no Save, Publish, Delete, Submit, or typing into persisted fields);
 *   - 24h time and dd/mm date verdicts for the Spanish talent;
 *   - the single localized skip link (TUL-278);
 *   - load-more and media-library verdicts (TUL-228 / TUL-277 / TUL-87).
 */
import { FORBIDDEN_TALENT_CODES, TEST_TALENT_CODE, assertTestTalent } from "./timing-harness";

/** Refuses anything but the test talent, before any network call. */
export function assertDashboardTarget(code: string): void {
  assertTestTalent(code);
}

/** Throws when text we read from the page names a forbidden (real) talent, so a mis-minted session cannot pass quietly. */
export function assertNoForbiddenTalent(text: string): void {
  for (const code of FORBIDDEN_TALENT_CODES) {
    if (text.toUpperCase().includes(code)) throw new Error(`REFUSED: the page names ${code}, a real talent; the session is not the test talent ${TEST_TALENT_CODE}.`);
  }
}

/** Names of clicks that persist. The spec routes every click through this; a match is refused before it runs. */
const WRITING_ACTION = /\b(save|publish|unpublish|delete|remove|submit|send|confirm|pay|guardar|publicar|eliminar|borrar|quitar|enviar|confirmar|pagar)\b/i;

export function assertReadOnlyAction(name: string): string {
  if (WRITING_ACTION.test(name)) throw new Error(`REFUSED: "${name}" looks like a write; this spec is read-only.`);
  return name;
}

// ---------------------------------------------------------------- 24h and dd/mm

/** 12-hour clock readings: "3:30 PM", "3:30 p. m.", "3 pm". Empty array means none. */
export function findAmPmTimes(text: string): string[] {
  const re = /\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s?(?:[ap]\.?\s?m\.?)(?![a-z])/gi;
  return text.match(re) ?? [];
}

/** 24h clock readings such as "08:00" or "18:30" (not followed by am/pm). */
export function find24hTimes(text: string): string[] {
  const re = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b(?!\s?[ap]\.?\s?m\b)/gi;
  return text.match(re) ?? [];
}

const NUMERIC_DATE = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/g;

/**
 * Numeric dates that cannot be dd/mm: the second part is not a month (mm/dd such as 10/25) or the first is not a day.
 * Ambiguous ones (03/04) are accepted: they cannot prove either order.
 */
export function findNonDdMmDates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMERIC_DATE)) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first > 31 || first < 1 || second > 12 || second < 1) out.push(m[0]);
  }
  return out;
}

/** Numeric dates with a day-sized first part (13 to 31): a positive sign of dd/mm (e.g. 25/10). */
export function findDdMmWitnesses(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMERIC_DATE)) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first >= 13 && first <= 31 && second >= 1 && second <= 12) out.push(m[0]);
  }
  return out;
}

export interface ClockVerdict {
  ok: boolean;
  amPm: string[];
  nonDdMm: string[];
  times24h: number;
  ddMmWitnesses: string[];
}

export function clockAndDateVerdict(text: string): ClockVerdict {
  const amPm = findAmPmTimes(text);
  const nonDdMm = findNonDdMmDates(text);
  return { ok: amPm.length === 0 && nonDdMm.length === 0, amPm, nonDdMm, times24h: find24hTimes(text).length, ddMmWitnesses: findDdMmWitnesses(text) };
}

// ---------------------------------------------------------------- skip link (TUL-278)

export const SKIP_LINK_TEXT = { es: "Saltar al contenido principal", en: "Skip to main content" } as const;

export function skipLinkTextFor(lang: string | null | undefined): string {
  return /^es\b/i.test((lang ?? "").trim()) ? SKIP_LINK_TEXT.es : SKIP_LINK_TEXT.en;
}

export interface SkipLinkProbe {
  text: string;
  href: string | null;
}

/** Exactly ONE skip link, with the page-language text, pointing at an in-page anchor. */
export function skipLinkVerdict(links: readonly SkipLinkProbe[], lang: string | null | undefined): { ok: boolean; reason: string } {
  const skips = links.filter((l) => /skip to (?:main )?content|saltar al contenido/i.test(l.text));
  if (skips.length !== 1) return { ok: false, reason: `expected exactly 1 skip link, found ${skips.length}` };
  const want = skipLinkTextFor(lang);
  if (skips[0]!.text.trim() !== want) return { ok: false, reason: `skip link text is "${skips[0]!.text.trim()}", expected "${want}"` };
  if (!skips[0]!.href || !skips[0]!.href.startsWith("#")) return { ok: false, reason: `skip link href "${skips[0]!.href ?? ""}" is not an in-page anchor` };
  return { ok: true, reason: "one localized skip link" };
}

// ---------------------------------------------------------------- load more (TUL-228 / TUL-277)

/** A load-more click is a read: it must APPEND (the count grows) and never drop what was there. */
export function loadMoreVerdict(before: number, after: number): { ok: boolean; reason: string } {
  if (after < before) return { ok: false, reason: `items dropped from ${before} to ${after}` };
  if (after === before) return { ok: false, reason: `no items appended (still ${before})` };
  return { ok: true, reason: `${before} -> ${after} items` };
}

// ---------------------------------------------------------------- media library (TUL-87)

/** The library GET is healthy when it is a 200 or a non-error JSON answer; any 5xx fails. */
export function libraryResponseVerdict(res: { status: number; contentType: string | null | undefined }): { ok: boolean; reason: string } {
  const json = /json/i.test(res.contentType ?? "");
  if (res.status >= 500) return { ok: false, reason: `server error ${res.status}` };
  if (res.status === 200 || (json && res.status < 400)) return { ok: true, reason: `${res.status} ${json ? "json" : "non-json"}` };
  return { ok: false, reason: `status ${res.status}${json ? " (json)" : ""}` };
}

/** True when the library's red error card text is present (en or es copy of dashboard.mediaLibrary.errorTitle). */
export function hasLibraryErrorCard(text: string): boolean {
  return /Could not load the media library|No se pudo cargar la biblioteca de medios/i.test(text);
}

// ---------------------------------------------------------------- empty states (TUL-243)

export const TODAY_CLEAR_COPY = { es: "Todo al día por ahora.", en: "You are clear for now." } as const;

/** The empty "Needs attention" card must carry its copy; a populated card (a count, a row) is not an empty state. */
export function attentionEmptyVerdict(cardText: string, lang: string | null | undefined): { state: "empty" | "populated"; ok: boolean; reason: string } {
  const want = /^es\b/i.test((lang ?? "").trim()) ? TODAY_CLEAR_COPY.es : TODAY_CLEAR_COPY.en;
  if (cardText.includes(want)) return { state: "empty", ok: true, reason: `shows "${want}"` };
  const populated = /\b\d+\b/.test(cardText.replace(/\s+/g, " ")) || /Reply|Responder|View all|Ver todo|esperando|waiting/i.test(cardText);
  if (populated) return { state: "populated", ok: true, reason: "has items, not an empty state" };
  return { state: "empty", ok: false, reason: `card looks empty but "${want}" is missing` };
}
