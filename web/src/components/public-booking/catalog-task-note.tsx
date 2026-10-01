"use client";

/**
 * Gridline G9b: the editable "¿Qué pasa?" note on the sheet's first step.
 * Rendered only when the sheet was opened from the task picker (the detail
 * carries `task`). The value lives on the sheet's `detail` state, so the
 * CH-3 resume snapshot (which stores `detail`) keeps the visitor's edit.
 */
import {
  TASK_NOTE_MAX,
  briefFromDetail,
  taskNoteHint,
  taskNoteLabel,
  type OfferingTaskBrief,
} from "@/lib/talent/offering-task-brief";

import type { CatalogBookingDetail } from "./CatalogBookingSheet";

export function CatalogTaskNote({
  detail,
  locale,
  onChange,
}: {
  detail: CatalogBookingDetail;
  locale: string;
  onChange: (note: string) => void;
}) {
  if (!detail.task) return null;
  return (
    <label className="jb-field" data-catalog-task-note={detail.task.id}>
      <span>{taskNoteLabel(locale)}</span>
      <textarea
        rows={2}
        maxLength={TASK_NOTE_MAX}
        value={detail.note ?? ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid="cb-task-note"
      />
      <small className="jb-fixture">{taskNoteHint(locale)}</small>
    </label>
  );
}

/** What the sheet's confirm sends: the task (G9b) and intake answers (G13); null when neither. */
export function catalogTaskBrief(detail: CatalogBookingDetail | null): OfferingTaskBrief | null {
  return briefFromDetail(detail, true);
}
