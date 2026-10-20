import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPublicOpenTimes } from "@/lib/scheduling/public-open-times";

/**
 * /book default service (B2/D3): mark which services have online times, so the
 * page can open on one that does and send the rest to a request.
 *
 * Cost guard: only the first {@link OPEN_TIMES_PROBE_LIMIT} bookable services
 * are probed (in parallel, through the same `loadPublicOpenTimes` the slots
 * route uses). The rest stay `undefined` = unknown, never "no times". A probe
 * that fails leaves the flag unset: an outage must not hide a bookable service.
 * Services that can never show times (house-owned, on_request) are `false`
 * without a query.
 */
export const OPEN_TIMES_PROBE_LIMIT = 3;
const PROBE_DAYS = 14;

type Probeable = {
  id: string;
  talentProfileId?: string | null;
  visibility?: string | null;
  hasOpenTimes?: boolean | null;
};

export async function annotateOpenTimes<T extends Probeable>(
  admin: SupabaseClient,
  offerings: T[],
  ctx: { host: { kind: string; tenantId: string | null }; talentSiteId?: string | null; now?: Date },
): Promise<void> {
  const now = ctx.now ?? new Date();
  const probe: T[] = [];
  for (const o of offerings) {
    if (!o.talentProfileId || o.visibility === "on_request") {
      o.hasOpenTimes = false;
    } else if (probe.length < OPEN_TIMES_PROBE_LIMIT) {
      probe.push(o);
    }
  }
  await Promise.all(
    probe.map(async (o) => {
      try {
        const r = await loadPublicOpenTimes(admin, {
          host: {
            kind: ctx.host.kind,
            tenantId: ctx.host.tenantId,
            talentSiteId: ctx.talentSiteId ?? null,
          },
          offeringId: o.id,
          from: now,
          days: PROBE_DAYS,
          parseDuration: (base) => base,
          now,
        });
        if (r.ok) o.hasOpenTimes = r.slots.length > 0;
      } catch {
        // Unknown stays unknown.
      }
    }),
  );
}
