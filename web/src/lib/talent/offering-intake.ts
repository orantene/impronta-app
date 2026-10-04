/**
 * Gridline G13 (C4): per-service intake questions.
 *
 * Storage: `talent_offerings.attributes.intake` (the existing long-tail JSON
 * sink, no migration). The talent authors up to INTAKE_MAX_QUESTIONS questions
 * per service in the service editor; the shared booking sheet renders them on
 * its first step for every mode (instant, request, inquiry), and the answers
 * ride the G9b brief carrier (`OfferingTaskBrief.intake`) into the inquiry:
 *   - chat / inquiry form → `source_context.offering.brief.intake` through
 *     `startGuestChatInquiry` → `createInquiryFromIntent`, and a readable block
 *     appended to the first message so both sides see it in the thread;
 *   - sheet confirm → `source_context.brief.intake` on the purchase thread and
 *     a readable message next to the order card.
 *
 * Pure and import-free (client-safe; runs in the tsx test lanes).
 * A service without questions reads as `[]` and nothing renders.
 */

export type IntakeFieldType = "text" | "chips" | "select" | "upload" | "area";
export const INTAKE_FIELD_TYPES: readonly IntakeFieldType[] = ["text", "chips", "select", "upload", "area"];

export type IntakeQuestion = {
  key: string;
  type: IntakeFieldType;
  label: string;
  /** chips (pick any) and select (pick one). */
  options?: string[];
  placeholder?: string;
  help?: string;
};

/** The visitor's working answers on the sheet (keyed by question key). */
export type IntakeAnswers = Record<string, string | string[]>;

/** The persisted answer (snake-free, self-describing so the record survives an edit of the questions). */
export type IntakeAnswerRecord = {
  key: string;
  type: IntakeFieldType;
  label: string;
  value: string | string[];
};

export const INTAKE_MAX_QUESTIONS = 8;
export const INTAKE_MAX_OPTIONS = 12;
export const INTAKE_LABEL_MAX = 120;
export const INTAKE_OPTION_MAX = 60;
export const INTAKE_TEXT_MAX = 200;
export const INTAKE_AREA_MAX = 1000;
export const INTAKE_UPLOAD_MAX_FILES = 3;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isType(v: unknown): v is IntakeFieldType {
  return typeof v === "string" && (INTAKE_FIELD_TYPES as readonly string[]).includes(v);
}

function slugKey(label: string, i: number): string {
  const s = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return s || `q${i + 1}`;
}

function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const o of raw) {
    const s = clean(o, INTAKE_OPTION_MAX);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= INTAKE_MAX_OPTIONS) break;
  }
  return out;
}

/**
 * Untrusted JSON → valid questions. Drops unlabeled questions and chips/select
 * questions without options; de-duplicates keys. Accepts the mockup's short
 * keys too (`k`, `l`, `opts`, `p`, `h`) so a design payload can seed it.
 */
export function normalizeIntakeQuestions(raw: unknown): IntakeQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeQuestion[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (out.length >= INTAKE_MAX_QUESTIONS) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = clean(r.label ?? r.l, INTAKE_LABEL_MAX);
    if (!label) continue;
    const type: IntakeFieldType = isType(r.type) ? r.type : "text";
    const options = cleanOptions(r.options ?? r.opts);
    if ((type === "chips" || type === "select") && options.length === 0) continue;
    let key = clean(r.key ?? r.k, 40).replace(/[^A-Za-z0-9_-]/g, "") || slugKey(label, out.length);
    while (keys.has(key)) key = `${key}_${out.length + 1}`;
    keys.add(key);
    const q: IntakeQuestion = { key, type, label };
    if (type === "chips" || type === "select") q.options = options;
    const placeholder = clean(r.placeholder ?? r.p, INTAKE_LABEL_MAX);
    const help = clean(r.help ?? r.h, INTAKE_LABEL_MAX);
    if (placeholder) q.placeholder = placeholder;
    if (help) q.help = help;
    out.push(q);
  }
  return out;
}

/** Read `attributes.intake` without inventing schema. */
export function intakeFromAttributes(attributes: Record<string, unknown> | null | undefined): IntakeQuestion[] {
  return normalizeIntakeQuestions(attributes?.intake);
}

/** Editor write: the attributes with `intake` set (removed when empty). */
export function patchIntakeAttributes(
  attributes: Record<string, unknown> | null | undefined,
  questions: readonly IntakeQuestion[],
): Record<string, unknown> {
  const next = { ...(attributes ?? {}) };
  const clean = normalizeIntakeQuestions(questions);
  if (clean.length > 0) next.intake = clean;
  else delete next.intake;
  return next;
}

/** One answer value, clamped against its question. Empty → null. */
function answerFor(q: IntakeQuestion, v: unknown): string | string[] | null {
  if (q.type === "chips") {
    const list = Array.isArray(v) ? v : [];
    const picked = (q.options ?? []).filter((o) => list.includes(o));
    return picked.length ? picked : null;
  }
  if (q.type === "select") {
    const s = typeof v === "string" ? v : "";
    return (q.options ?? []).includes(s) ? s : null;
  }
  if (q.type === "upload") {
    const list = (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
      .map((f) => clean(f, INTAKE_LABEL_MAX))
      .filter(Boolean)
      .slice(0, INTAKE_UPLOAD_MAX_FILES);
    return list.length ? list : null;
  }
  const s = clean(v, q.type === "area" ? INTAKE_AREA_MAX : INTAKE_TEXT_MAX);
  return s || null;
}

/** Sheet answers → persisted records, in question order; unanswered dropped. */
export function intakeAnswerRecords(
  questions: readonly IntakeQuestion[] | null | undefined,
  answers: IntakeAnswers | null | undefined,
): IntakeAnswerRecord[] {
  if (!questions?.length || !answers) return [];
  const out: IntakeAnswerRecord[] = [];
  for (const q of questions) {
    const value = answerFor(q, answers[q.key]);
    if (value != null) out.push({ key: q.key, type: q.type, label: q.label, value });
  }
  return out;
}

/** Server re-clamp of records that arrived from a public form. */
export function clampIntakeRecords(raw: unknown): IntakeAnswerRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeAnswerRecord[] = [];
  for (const item of raw.slice(0, INTAKE_MAX_QUESTIONS)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = clean(r.label, INTAKE_LABEL_MAX);
    const key = clean(r.key, 40);
    if (!label || !key || !isType(r.type)) continue;
    let value: string | string[] | null;
    if (Array.isArray(r.value)) {
      const max = r.type === "upload" ? INTAKE_UPLOAD_MAX_FILES : INTAKE_MAX_OPTIONS;
      const list = r.value.map((x) => clean(x, INTAKE_LABEL_MAX)).filter(Boolean).slice(0, max);
      value = list.length ? list : null;
    } else {
      const s = clean(r.value, r.type === "area" ? INTAKE_AREA_MAX : INTAKE_TEXT_MAX);
      value = s || null;
    }
    if (value != null) out.push({ key, type: r.type, label, value });
  }
  return out;
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * G9b bridge: the task the visitor picked pre-selects matching chips
 * (e.g. task "Sin luz en una zona" → that emergency chip). Match is
 * case- and accent-insensitive, either way round. Never overwrites an answer.
 */
export function preselectIntakeFromTask(
  questions: readonly IntakeQuestion[] | null | undefined,
  task: { label?: string | null } | null | undefined,
  answers: IntakeAnswers = {},
): IntakeAnswers {
  const t = fold(task?.label ?? "");
  if (!t || !questions?.length) return answers;
  const next: IntakeAnswers = { ...answers };
  for (const q of questions) {
    if (q.type !== "chips" || next[q.key] !== undefined) continue;
    const hits = (q.options ?? []).filter((o) => {
      const f = fold(o);
      return f.length > 0 && (f === t || t.includes(f) || f.includes(t));
    });
    if (hits.length) next[q.key] = hits;
  }
  return next;
}

/** Readable block for the thread (both sides see it). Empty when no answers. */
export function formatIntakeBlock(records: readonly IntakeAnswerRecord[], locale: string): string {
  if (!records.length) return "";
  const es = locale.toLowerCase().startsWith("es");
  const head = es ? "Respuestas del cliente:" : "Client's answers:";
  const lines = records.map((r) => {
    const v = Array.isArray(r.value) ? r.value.join(", ") : r.value;
    const shown = r.type === "upload" ? `${es ? "foto" : "photo"}: ${v}` : v;
    return `- ${r.label}: ${shown}`;
  });
  return [head, ...lines].join("\n");
}

/** Sheet + editor chrome, EN/ES. */
export function intakeCopy(locale: string) {
  const es = locale.toLowerCase().startsWith("es");
  return {
    legend: es ? "Cuéntanos del trabajo" : "Tell us about the job",
    optional: es ? "opcional" : "optional",
    selectPlaceholder: es ? "Elige una opción" : "Choose one",
    uploadCta: es ? "Subir foto" : "Upload photo",
    uploadRemove: es ? "Quitar" : "Remove",
    uploadTooBig: es ? "La foto pesa más de 8 MB." : "The photo is over 8 MB.",
    uploadBadType: es ? "Sube una foto JPG, PNG, WebP o GIF." : "Upload a JPG, PNG, WebP or GIF photo.",
    uploadNote: es
      ? "Anotamos tu foto en la solicitud. JPG, PNG, WebP o GIF, hasta 8 MB."
      : "We note your photo on the request. JPG, PNG, WebP or GIF, up to 8 MB.",
  };
}

/** Detail spread for the `tulala:offering-*` event: `{ intake }` only when the service has questions. */
export function intakeDetail(
  attributes: Record<string, unknown> | null | undefined,
): { intake?: IntakeQuestion[] } {
  const intake = intakeFromAttributes(attributes);
  return intake.length ? { intake } : {};
}
