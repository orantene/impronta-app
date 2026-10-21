/**
 * legal-date.ts: "2026-10-01" -> "1 de octubre de 2026" for the Spanish legal
 * pages (TUL-1799). English keeps the ISO date it always showed.
 *
 * Month names are spelled out here instead of via Intl so the server and the
 * test runner can never disagree about ICU data.
 */

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export function formatLegalDate(iso: string, locale: string | null | undefined): string {
  if (!(locale ?? "").toLowerCase().startsWith("es")) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const month = MONTHS_ES[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} de ${month} de ${m[1]}`;
}
