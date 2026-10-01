/**
 * Gridline G9b: the task a visitor picked in the task picker (W-11), carried
 * into the booking sheet, chat and inquiry form as editable context.
 *
 * Carrier: two optional fields on the existing `tulala:offering-*` event
 * detail (`task`, `note`). The note is a pre-fill only: the visitor edits it
 * in the sheet (or the form / chat composer) and nothing is sent before they
 * submit. On submit it lands as one typed block (`OfferingTaskBrief`) on
 * records that already exist:
 *   - chat / inquiry form → `inquiries.source_context.offering.brief`
 *     through `startGuestChatInquiry` → `createInquiryFromIntent`;
 *   - sheet confirm (instant / request) → `inquiries.source_context.brief`
 *     on the purchase thread the pipeline opens.
 * `note` is only stored where the visitor edited it in a note field (the
 * sheet). Where the pre-fill went into a message box (chat composer, inquiry
 * form), the message itself is the visitor's words and the brief keeps only
 * the task.
 * No migration: `source_context` is the existing jsonb provenance column.
 */

import {
  clampIntakeRecords,
  intakeAnswerRecords,
  type IntakeAnswerRecord,
  type IntakeAnswers,
  type IntakeQuestion,
} from "./offering-intake";

export type OfferingTaskRef = { id: string; label: string };

/** The persisted shape (snake_case, like the rest of source_context). */
export type OfferingTaskBrief = {
  task_id?: string;
  task_label?: string;
  note?: string;
  /** Gridline G13: answers to the service's intake questions (offering-intake.ts). */
  intake?: IntakeAnswerRecord[];
};

export const TASK_NOTE_MAX = 500;
const LABEL_MAX = 120;

function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s ? s : undefined;
}

/** Pre-fill text for the editable note: the task as the visitor tapped it. */
export function taskNotePrefill(task: OfferingTaskRef | null | undefined): string {
  return clean(task?.label, TASK_NOTE_MAX) ?? "";
}

/**
 * Build (and clamp) the persisted brief. Returns null when nothing useful is
 * left, so callers can spread it conditionally. Safe on untrusted input.
 */
export function taskBriefFrom(
  task: Partial<OfferingTaskRef> | null | undefined,
  note: unknown,
  intake?: unknown,
): OfferingTaskBrief | null {
  const out: OfferingTaskBrief = {};
  const answers = clampIntakeRecords(intake);
  if (answers.length) out.intake = answers;
  const id = clean(task?.id, LABEL_MAX);
  const label = clean(task?.label, LABEL_MAX);
  const n = clean(note, TASK_NOTE_MAX);
  if (id) out.task_id = id;
  if (label) out.task_label = label;
  if (n) out.note = n;
  return Object.keys(out).length > 0 ? out : null;
}

/** Field label in the sheet and form. */
export function taskNoteLabel(locale: string): string {
  return locale.toLowerCase().startsWith("es") ? "¿Qué pasa?" : "What's going on?";
}

export function taskNoteHint(locale: string): string {
  return locale.toLowerCase().startsWith("es")
    ? "Lo elegiste arriba. Puedes cambiarlo o agregar detalles."
    : "You picked this above. Change it or add details.";
}

/** Re-clamp a brief that arrived from the client (server side). */
export function clampTaskBrief(b: OfferingTaskBrief | null | undefined): OfferingTaskBrief | null {
  if (!b || typeof b !== "object") return null;
  return taskBriefFrom({ id: b.task_id, label: b.task_label }, b.note, b.intake);
}

/**
 * Gridline G13: the brief a booking detail carries on submit. The task (G9b)
 * and the intake answers (G13) are independent: a service with questions sends
 * its answers even when the sheet was not opened from the task picker.
 * `keepNote` is false where the note went into a message box instead.
 */
export function briefFromDetail(
  d:
    | {
        task?: OfferingTaskRef | null;
        note?: string | null;
        intake?: IntakeQuestion[];
        answers?: IntakeAnswers;
      }
    | null
    | undefined,
  keepNote: boolean,
): OfferingTaskBrief | null {
  if (!d) return null;
  const intake = intakeAnswerRecords(d.intake, d.answers);
  return taskBriefFrom(d.task ?? null, d.task && keepNote ? d.note : null, intake);
}
