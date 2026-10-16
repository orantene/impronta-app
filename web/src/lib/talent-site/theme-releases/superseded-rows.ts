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
export const DESIGN_SWITCHED_REASON = "design_switched";

export interface StaleCandidate {
  id: string;
  state: string;
  /** The release's to-version; null when the release row could not be read. */
  toVersion: number | null;
  /** True when the row's release belongs to a design the site is no longer on (switched away). */
  otherDesign?: boolean;
  report?: Record<string, unknown> | null;
}

export interface SupersedeChange {
  id: string;
  report: Record<string, unknown>;
}

/** Open rows whose release target is at or below the site's pin. A null pin plans nothing. */
export function planSupersede(pin: number | null, rows: ReadonlyArray<StaleCandidate>): SupersedeChange[] {
  const out: SupersedeChange[] = [];
  for (const r of rows) {
    if (!OPEN_UPDATE_STATES.includes(r.state as (typeof OPEN_UPDATE_STATES)[number])) continue;
    // Switching theme closes every open notice of the design she left, whatever the pin.
    if (r.otherDesign) {
      out.push({ id: r.id, report: { ...(r.report ?? {}), reason: DESIGN_SWITCHED_REASON } });
      continue;
    }
    if (typeof pin !== "number") continue;
    if (typeof r.toVersion !== "number" || r.toVersion > pin) continue;
    out.push({ id: r.id, report: { ...(r.report ?? {}), reason: SUPERSEDED_REASON, supersededByPin: pin } });
  }
  return out;
}

/** True for a row `planSupersede` closed (offers no blocks of its own). */
export function isSupersededReport(report: unknown): boolean {
  const reason = report && typeof report === "object" ? (report as { reason?: unknown }).reason : null;
  return reason === SUPERSEDED_REASON || reason === DESIGN_SWITCHED_REASON;
}
