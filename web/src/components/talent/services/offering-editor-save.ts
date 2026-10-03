/**
 * Shared save helpers for the Services EditorScreen / ServicesHome path.
 *
 * - Status: "Save changes" on a live offering must keep published; only a real
 *   "Save draft" (new / draft / hidden) forces draft — blankOffering defaults
 *   to published, so a blind `next.status` path broke Manicure Gel QA.
 * - Errors: validateOffering / server actions return English sentences; Spanish
 *   dashboards need copy.t + title-bearing templates before display.
 */

export function resolveOfferingEditorSaveStatus(input: {
  publish: boolean;
  offeringId: string;
  currentStatus: string;
}): "published" | "draft" {
  if (input.publish) return "published";
  // Existing live row + Save changes (publish=false): keep it live.
  if (input.offeringId && input.currentStatus === "published") return "published";
  return "draft";
}

/** Exact EN keys that map through dashboard i18n when Spanish. */
export const OFFERING_SAVE_ERROR_EXACT_EN = [
  "Server configuration error.",
  "Give it a name (e.g. “60-min massage”).",
  "Pick a currency.",
  "Pick how clients book.",
  "The deposit must be a whole percent.",
  "Cancelling hours must be a whole number.",
] as const;

type TitleTemplate = {
  re: RegExp;
  es: (title: string) => string;
};

const TITLE_TEMPLATES: TitleTemplate[] = [
  {
    re: /^“(.+)” needs a price — or switch it to “Contact for price\.”$/,
    es: (title) => `“${title}” necesita un precio — o cámbialo a “Consultar precio.”`,
  },
  {
    re: /^Direct booking needs one exact price — set an amount on “(.+)” \(zero is free\) or switch it to “Inquiry to book\.”$/,
    es: (title) =>
      `La reserva directa necesita un precio exacto — pon un monto en “${title}” (cero es gratis) o cámbialo a “Consulta para reservar.”`,
  },
  {
    re: /^Set the deposit percent \(1–99\) for “(.+)” — or switch it to full payment \/ free reserve\.$/,
    es: (title) =>
      `Define el porcentaje de anticipo (1–99) para “${title}” — o cámbialo a pago completo / reserva gratis.`,
  },
  {
    re: /^Say why “(.+)” needs the buyer's name\.$/,
    es: (title) => `Di por qué “${title}” necesita el nombre del comprador.`,
  },
  {
    re: /^“(.+)” follows your Instant default\. Add an exact price, or set it to Request to book\.$/,
    es: (title) =>
      `“${title}” sigue tu predeterminado Instantáneo. Pon un precio exacto, o cámbialo a Pedir reserva.`,
  },
  {
    re: /^“(.+)” follows your Instant default\. Set its deposit percent \(1 to 99\), or set it to Request to book\.$/,
    es: (title) =>
      `“${title}” sigue tu predeterminado Instantáneo. Define su porcentaje de anticipo (1 a 99), o cámbialo a Pedir reserva.`,
  },
  {
    re: /^Direct booking needs one exact price\. Set an amount on “(.+)” in Services first\.$/,
    es: (title) =>
      `La reserva directa necesita un precio exacto. Pon un monto en “${title}” en Servicios primero.`,
  },
  {
    re: /^Set the deposit percent \(1 to 99\) for “(.+)”\.$/,
    es: (title) => `Define el porcentaje de anticipo (1 a 99) para “${title}”.`,
  },
];

/**
 * Localize a save/validation error for the Services editor.
 * `t` is dashboard copy.t (EN→ES dictionary). Untranslated Spanish falls back
 * to the generic save-failure line rather than raw English.
 */
export function localizeOfferingSaveError(
  message: string,
  opts: {
    isSpanish: boolean;
    t: (value: string) => string;
    generic: string;
  },
): string {
  const trimmed = message.trim();
  if (!trimmed) return opts.generic;
  if (!opts.isSpanish) return trimmed;

  const exact = opts.t(trimmed);
  if (exact !== trimmed) return exact;

  for (const tmpl of TITLE_TEMPLATES) {
    const m = trimmed.match(tmpl.re);
    if (m?.[1]) return tmpl.es(m[1]);
  }

  return opts.generic;
}
