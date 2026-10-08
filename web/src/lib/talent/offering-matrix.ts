/**
 * Typed per-service comparison fields (Gridline G8): materials, warranty and
 * response time, plus the "this is my emergency service" flag the matrix
 * highlights while the live status is on.
 *
 * Stored in the existing long-tail JSON sink `talent_offerings.attributes`
 * under `matrix` (no migration), as an EN/ES pair per field like `price_unit`:
 *
 *   attributes.matrix = {
 *     materials: { en, es }, warranty: { en, es }, response: { en, es },
 *     emergency: true
 *   }
 *
 * Values are what the talent typed. Nothing here computes a promise: a field
 * left empty is simply absent, and the matrix drops a row no service filled.
 */

export const OFFERING_MATRIX_KEYS = ["materials", "warranty", "response"] as const;
export type OfferingMatrixKey = (typeof OFFERING_MATRIX_KEYS)[number];

export type OfferingMatrixText = { en?: string; es?: string };

export type OfferingMatrixFields = {
  materials?: OfferingMatrixText;
  warranty?: OfferingMatrixText;
  response?: OfferingMatrixText;
  /** The service the matrix highlights while "emergencies today" is on. */
  emergency?: boolean;
};

export const OFFERING_MATRIX_TEXT_MAX = 140;

function cleanText(raw: unknown): OfferingMatrixText | undefined {
  // A bare string is read as the same line for both languages.
  if (typeof raw === "string") {
    const v = raw.trim().slice(0, OFFERING_MATRIX_TEXT_MAX);
    return v ? { en: v, es: v } : undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const map = raw as Record<string, unknown>;
  const out: OfferingMatrixText = {};
  for (const lang of ["en", "es"] as const) {
    const v = typeof map[lang] === "string" ? (map[lang] as string).trim().slice(0, OFFERING_MATRIX_TEXT_MAX) : "";
    if (v) out[lang] = v;
  }
  return out.en || out.es ? out : undefined;
}

/** Read `attributes.matrix` without inventing schema. Bad data yields `{}`. */
export function offeringMatrixFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
): OfferingMatrixFields {
  const raw = attributes?.matrix;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: OfferingMatrixFields = {};
  for (const key of OFFERING_MATRIX_KEYS) {
    const t = cleanText(src[key]);
    if (t) out[key] = t;
  }
  if (src.emergency === true) out.emergency = true;
  return out;
}

/** The typed value for one field in the visitor's language, or "" when unfilled. */
export function offeringMatrixValue(
  attributes: Record<string, unknown> | null | undefined,
  key: OfferingMatrixKey,
  locale: string,
): string {
  const t = offeringMatrixFromAttributes(attributes)[key];
  if (!t) return "";
  const lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
  return t[lang] ?? t.en ?? t.es ?? "";
}

/**
 * The next `attributes.matrix` after editing one language of one field. An
 * emptied field is removed; an emptied matrix is removed from attributes.
 */
export function patchOfferingMatrix(
  attributes: Record<string, unknown> | null | undefined,
  edit:
    | { key: OfferingMatrixKey; lang: "en" | "es"; value: string }
    | { key: "emergency"; value: boolean },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(attributes ?? {}) };
  const cur = offeringMatrixFromAttributes(attributes);
  const matrix: OfferingMatrixFields = { ...cur };
  if (edit.key === "emergency") {
    if (edit.value) matrix.emergency = true;
    else delete matrix.emergency;
  } else {
    const text: OfferingMatrixText = { ...(cur[edit.key] ?? {}) };
    const v = edit.value.slice(0, OFFERING_MATRIX_TEXT_MAX);
    if (v.trim()) text[edit.lang] = v;
    else delete text[edit.lang];
    if (text.en || text.es) matrix[edit.key] = text;
    else delete matrix[edit.key];
  }
  if (Object.keys(matrix).length === 0) delete next.matrix;
  else next.matrix = matrix;
  return next;
}

/** True when at least one offering typed a value for this field. */
export function matrixRowFilled(
  offerings: ReadonlyArray<{ attributes?: Record<string, unknown> | null }>,
  key: OfferingMatrixKey,
  locale: string,
): boolean {
  return offerings.some((o) => offeringMatrixValue(o.attributes, key, locale) !== "");
}
