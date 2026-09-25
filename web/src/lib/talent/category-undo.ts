/** 30-day undo log for category rename/merge. Local only. No column. */

export type CategoryUndoEntry = {
  id: string;
  at: string;
  from: string;
  to: string;
  itemIds: string[];
};

const KEY = "talent-studio-category-undo";
const DAY_MS = 30 * 24 * 60 * 60 * 1000;

function read(talentId: string): CategoryUndoEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${KEY}:${talentId}`);
    const rows = raw ? (JSON.parse(raw) as CategoryUndoEntry[]) : [];
    const cutoff = Date.now() - DAY_MS;
    return rows.filter((row) => Date.parse(row.at) >= cutoff);
  } catch {
    return [];
  }
}

function write(talentId: string, rows: CategoryUndoEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${KEY}:${talentId}`, JSON.stringify(rows));
}

export function listCategoryUndos(talentId: string): CategoryUndoEntry[] {
  return read(talentId);
}

export function pushCategoryUndo(talentId: string, entry: Omit<CategoryUndoEntry, "id" | "at">) {
  const rows = read(talentId);
  rows.unshift({ ...entry, id: `${Date.now()}`, at: new Date().toISOString() });
  write(talentId, rows.slice(0, 40));
}

export function popCategoryUndo(talentId: string): CategoryUndoEntry | null {
  const rows = read(talentId);
  const next = rows.shift() ?? null;
  write(talentId, rows);
  return next;
}
