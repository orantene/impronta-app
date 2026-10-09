/**
 * THEME CORE P1 (audit rec. 5): an update row that a newer pin has overtaken
 * must not stay open. Pure planner; the writer is `superseded-rows.server.ts`.
 *
 * The `talent_site_theme_updates.state` CHECK allows only available, previewed,
 * applied, dismissed, undone, so "superseded" is stored as `applied` with
 * `report.reason = "superseded_by_pin"` (the same shape `nothing_applicable`
 * uses). `reopenAppliedRows` therefore still reopens it if a restore lowers the
 * pin back below the release. No migration needed.
 */
import { OPEN_UPDATE_STATES } from "./talent-update/view";

export const SUPERSEDED_REASON = "superseded_by_pin";

export interface StaleCandidate {
  id: string;
  state: string;
  /** The release's to-version; null when the release row could not be read. */
  toVersion: number | null;
  report?: Record<string, unknown> | null;
}

export interface SupersedeChange {
  id: string;
  report: Record<string, unknown>;
}

/** Open rows whose release target is at or below the site's pin. A null pin plans nothing. */
export function planSupersede(pin: number | null, rows: ReadonlyArray<StaleCandidate>): SupersedeChange[] {
  if (typeof pin !== "number") return [];
  const out: SupersedeChange[] = [];
  for (const r of rows) {
    if (!OPEN_UPDATE_STATES.includes(r.state as (typeof OPEN_UPDATE_STATES)[number])) continue;
    if (typeof r.toVersion !== "number" || r.toVersion > pin) continue;
    out.push({ id: r.id, report: { ...(r.report ?? {}), reason: SUPERSEDED_REASON, supersededByPin: pin } });
  }
  return out;
}

/** True for a row `planSupersede` closed (offers no blocks of its own). */
export function isSupersededReport(report: unknown): boolean {
  return !!report && typeof report === "object" && (report as { reason?: unknown }).reason === SUPERSEDED_REASON;
}
