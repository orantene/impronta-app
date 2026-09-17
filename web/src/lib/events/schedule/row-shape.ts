/**
 * Pure row helpers shared by the staff store and the public loader (PR B).
 * ON MERGE WITH PR A these move into `model.ts` / `grouping.ts`; keep them
 * dependency-free (no `server-only`) so the unit tests can import them.
 */

import { DEFAULT_EVENT_PROGRAM_SETTINGS, PROGRAM_GROUP_BY, type EventProgramSettings } from "./contract";

export function readProgramSettings(raw: unknown): EventProgramSettings {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<EventProgramSettings>;
  return {
    enabled: p.enabled === true,
    heading: typeof p.heading === "string" && p.heading.trim() ? p.heading : DEFAULT_EVENT_PROGRAM_SETTINGS.heading,
    heading_i18n: p.heading_i18n && typeof p.heading_i18n === "object" ? p.heading_i18n : undefined,
    set_times_public: p.set_times_public !== false,
    group_by: (PROGRAM_GROUP_BY as readonly string[]).includes(p.group_by as string) ? (p.group_by as EventProgramSettings["group_by"]) : DEFAULT_EVENT_PROGRAM_SETTINGS.group_by,
  };
}

/** Time first, then the manual order; TBA items last. The staff list and the public list agree. */
export function sortScheduleRows<T extends { starts_at: string | null; time_tba: boolean; sort_order: number; title: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTba = a.time_tba || !a.starts_at;
    const bTba = b.time_tba || !b.starts_at;
    if (aTba !== bTba) return aTba ? 1 : -1;
    if (!aTba && !bTba && a.starts_at !== b.starts_at) return (a.starts_at as string) < (b.starts_at as string) ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title);
  });
}

const PROGRAM_SPACE_KINDS_FIRST = ["stage", "room", "area"];

export function rankSpaces<T extends { kind: string; name: string; sort_order?: number }>(rows: T[]): T[] {
  const rank = (k: string) => { const i = PROGRAM_SPACE_KINDS_FIRST.indexOf(k); return i === -1 ? PROGRAM_SPACE_KINDS_FIRST.length : i; };
  return [...rows].sort((a, b) => rank(a.kind) - rank(b.kind) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}
