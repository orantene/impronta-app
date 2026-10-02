/**
 * THEME RELEASES (Phase 3): admin edits to a release's generated item list.
 * Pure. Screenshot URL lives in `detail.screenshotUrl`; the critical mark
 * swaps the type to `critical` and remembers the original in `detail.wasType`.
 */
import type { ReleaseItem, ReleaseItemType } from "../types";

export const ITEM_TYPES: readonly ReleaseItemType[] = [
  "code",
  "token-default",
  "variant-default",
  "new-block",
  "layout",
  "critical",
];

const NOTE_MAX = 600;

export interface ItemEdit {
  type?: ReleaseItemType;
  noteEn?: string;
  noteEs?: string;
  screenshotUrl?: string | null;
  critical?: boolean;
}

function cleanNote(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
}

/** Https-only (the release page renders it in an img). Empty clears it. */
export function cleanScreenshotUrl(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function screenshotOf(item: ReleaseItem): string | null {
  const v = item.detail?.screenshotUrl;
  return typeof v === "string" ? v : null;
}

export function applyItemEdit(item: ReleaseItem, edit: ItemEdit): ReleaseItem {
  let next: ReleaseItem = { ...item };
  const detail: Record<string, unknown> = { ...(item.detail ?? {}) };
  if (edit.type && ITEM_TYPES.includes(edit.type)) next.type = edit.type;
  if (edit.critical !== undefined) {
    if (edit.critical && next.type !== "critical") {
      detail.wasType = next.type;
      next.type = "critical";
    } else if (!edit.critical && next.type === "critical") {
      const was = detail.wasType;
      next.type = ITEM_TYPES.includes(was as ReleaseItemType) && was !== "critical" ? (was as ReleaseItemType) : "layout";
      delete detail.wasType;
    }
  }
  const en = cleanNote(edit.noteEn);
  const es = cleanNote(edit.noteEs);
  if (en !== undefined || es !== undefined) {
    next = { ...next, note: { ...(item.note ?? {}), ...(en !== undefined ? { en } : {}), ...(es !== undefined ? { es } : {}) } };
  }
  if (edit.screenshotUrl !== undefined) {
    const url = cleanScreenshotUrl(edit.screenshotUrl);
    if (url) detail.screenshotUrl = url;
    else delete detail.screenshotUrl;
  }
  if (Object.keys(detail).length > 0) next.detail = detail;
  else delete next.detail;
  return next;
}

/** Stable per-item id (the engine's default). */
export function itemId(item: ReleaseItem): string {
  return item.id ?? `${item.type}:${item.key}`;
}

/** Replace one item by id; unknown ids leave the list untouched. */
export function editItemInList(items: ReadonlyArray<ReleaseItem>, id: string, edit: ItemEdit): ReleaseItem[] {
  return items.map((it) => (itemId(it) === id ? applyItemEdit(it, edit) : it));
}

/** Items still missing a note in a language (the page shows a nudge). */
export function itemsMissingNotes(items: ReadonlyArray<ReleaseItem>): number {
  return items.filter((i) => !i.note?.en?.trim() || !i.note?.es?.trim()).length;
}
