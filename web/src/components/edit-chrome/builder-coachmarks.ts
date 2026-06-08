/**
 * Per-tenant coachmark persistence (Builder 2026 M7).
 */

const STORAGE_KEY = "impronta.editChrome.coachmarks.v1";

export type CoachmarkId =
  | "cmd-k-tip"
  | "pin-workspace"
  | "outline-tab"
  | "multi-select-toolbar";

export function isCoachmarkDismissed(id: CoachmarkId): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return false;
    return parsed.includes(id);
  } catch {
    return false;
  }
}

export function dismissCoachmark(id: CoachmarkId): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(id)) list.push(id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}
