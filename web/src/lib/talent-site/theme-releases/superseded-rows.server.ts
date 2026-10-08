import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { resolveBellsForRows } from "./theme-bells.server";
import { planSupersede, type StaleCandidate } from "./superseded-rows";
import { OPEN_UPDATE_STATES } from "./talent-update/view";

export interface PinnedSite {
  siteId: string;
  talentProfileId: string;
  designSlug: string;
  pin: number | null;
}

const CHUNK = 100;

/**
 * Close every open update row on these sites whose release (same design) targets
 * a version at or below the site's pin. Best-effort: logs and returns 0 on a
 * failure, never throws (callers sit on apply / fan-out paths). Returns rows closed.
 */
export async function supersedeStaleUpdateRows(admin: SupabaseClient, sites: ReadonlyArray<PinnedSite>): Promise<number> {
  try {
    const pinned = sites.filter((s) => typeof s.pin === "number");
    let closed = 0;
    for (let i = 0; i < pinned.length; i += CHUNK) {
      const batch = pinned.slice(i, i + CHUNK);
      const { data: rows, error } = await admin
        .from("talent_site_theme_updates")
        .select("id, talent_site_id, release_id, state, report")
        .in("talent_site_id", batch.map((s) => s.siteId))
        .in("state", [...OPEN_UPDATE_STATES]);
      if (error) {
        logServerError("themeUpdate.supersede.rows", error);
        continue;
      }
      const list = (rows ?? []) as Array<{
        id: string;
        talent_site_id: string;
        release_id: string;
        state: string;
        report?: Record<string, unknown> | null;
      }>;
      if (list.length === 0) continue;
      const { data: rels, error: rErr } = await admin
        .from("talent_theme_releases")
        .select("id, design_slug, to_version")
        .in("id", [...new Set(list.map((r) => r.release_id))]);
      if (rErr) {
        logServerError("themeUpdate.supersede.releases", rErr);
        continue;
      }
      const relById = new Map(
        ((rels ?? []) as Array<{ id: string; design_slug: string; to_version: number }>).map((r) => [r.id, r]),
      );
      for (const site of batch) {
        const candidates: StaleCandidate[] = list
          .filter((r) => r.talent_site_id === site.siteId)
          .map((r) => {
            const rel = relById.get(r.release_id);
            // A release of another design says nothing about this pin.
            return {
              id: r.id,
              state: r.state,
              report: r.report ?? null,
              toVersion: rel && rel.design_slug === site.designSlug ? rel.to_version : null,
            };
          });
        const changes = planSupersede(site.pin, candidates);
        const done: string[] = [];
        for (const c of changes) {
          const { error: upErr } = await admin
            .from("talent_site_theme_updates")
            .update({ state: "applied", report: c.report, updated_at: new Date().toISOString() } as never)
            .eq("id", c.id)
            .in("state", [...OPEN_UPDATE_STATES]);
          if (upErr) logServerError("themeUpdate.supersede.write", upErr);
          else done.push(c.id);
        }
        closed += done.length;
        if (done.length > 0) await resolveBellsForRows(admin, site.talentProfileId, done);
      }
    }
    return closed;
  } catch (err) {
    logServerError("themeUpdate.supersede", err);
    return 0;
  }
}
export { isSupersededReport } from "./superseded-rows";
