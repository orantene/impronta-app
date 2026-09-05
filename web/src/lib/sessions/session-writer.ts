/**
 * session-writer.ts — THE ONLY PLACE a `session_tier` pool is created.
 *
 * Not a `"use server"` file: it is a library the cron and the staff action both
 * call. The decisions live in `session-plan.ts`; this does I/O and no thinking.
 *
 *
 * WHY ONE FUNCTION AND NOT TWO GOOD ONES
 * ══════════════════════════════════════
 * Before this file, `api/cron/materialise-sessions` inserted a session and
 * called `upsert_capacity_pool` in the same loop, and it was correct. The
 * temptation when adding a human scheduler was to write a second one beside it,
 * which is also easy to get right the first day. Two creators of one pool
 * diverge the first time either changes: the cron's pool grows a parent, or the
 * hold TTL moves, and now a class booked through the screen behaves differently
 * from the same class booked through the sweep. The symptom appears in Capacity
 * and looks like Capacity's bug.
 *
 * So the cron was refactored ONTO this rather than left alongside it. If you are
 * about to add a third caller, add it here too.
 *
 *
 * WHY `ensureSessionPools` NEVER RE-ASSERTS AN EXISTING POOL
 * ═════════════════════════════════════════════════════════
 * `upsert_capacity_pool` is ON CONFLICT DO UPDATE SET units_total = EXCLUDED.
 * A repair pass that re-asserted every pool it was asked for would therefore
 * RESET the seat count of every pool that already existed — including one an
 * operator had deliberately raised for a busy night, and including one with
 * seats already sold against it. So this reads the existing keys first and
 * creates only the absent ones. Adding a tier to a night is additive; changing
 * seats is an edit path, and this is not it.
 *
 * That is also why the cron's original comment said it creates a pool with its
 * session and never re-asserts it. Same rule, now enforced in one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { TierUnits } from "@/lib/sessions/session-plan";

/** Capacity's defaults for a session tier pool. One definition, not four. */
const HOLD_TTL_SECONDS = 900;
const UNIT_LABEL = "seat";

export type SessionRowInput = {
  tenantId: string;
  startsAt: string;
  endsAt: string;
  seriesId?: string | null;
  venueId?: string | null;
  offeringId?: string | null;
  eventId?: string | null;
  title?: string | null;
};

export type CreateSessionResult =
  | { ok: true; sessionId: string; poolsCreated: number }
  | { ok: false; reason: "insert_failed" | "duplicate_occurrence" }
  | { ok: false; reason: "pools_failed"; sessionId: string; poolsCreated: number };

type Admin = SupabaseClient<never, never, never>;

/**
 * Create one session and the capacity pool for each tier of it.
 *
 * The session is inserted first and the pools follow, which means a failure
 * between them leaves a session with fewer pools than asked for. That is
 * REPORTED (`pools_failed`, carrying the id) rather than rolled back, because
 * the alternative — deleting a session that may already be referenced — is
 * worse, and because `ensureSessionPools` repairs exactly this case. The cron's
 * `poolBackfill` path is the same repair, and it runs every sweep.
 */
export async function createSessionWithPools(
  admin: Admin,
  session: SessionRowInput,
  pools: ReadonlyArray<TierUnits>,
): Promise<CreateSessionResult> {
  const { data: inserted, error: insertError } = await admin
    .from("sessions")
    .upsert(
      {
        tenant_id: session.tenantId,
        series_id: session.seriesId ?? null,
        venue_id: session.venueId ?? null,
        offering_id: session.offeringId ?? null,
        event_id: session.eventId ?? null,
        title: session.title ?? null,
        starts_at: session.startsAt,
        ends_at: session.endsAt,
        status: "scheduled",
      },
      { onConflict: "series_id,starts_at", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (insertError) {
    logServerError("sessions.createSessionWithPools.insert", insertError);
    return { ok: false, reason: "insert_failed" };
  }
  // `ignoreDuplicates` returns no row when the occurrence already existed. For
  // the cron that is the normal second-run path; for a human it means somebody
  // already scheduled this series at this instant. Distinct from an error.
  if (!inserted?.id) return { ok: false, reason: "duplicate_occurrence" };

  const sessionId = String(inserted.id);
  const poolsCreated = await createPools(admin, session.tenantId, sessionId, pools);
  if (poolsCreated < pools.length) {
    return { ok: false, reason: "pools_failed", sessionId, poolsCreated };
  }
  return { ok: true, sessionId, poolsCreated };
}

/**
 * Create pools for tiers of an EXISTING session that do not have one yet.
 *
 * The late-tier case: a tier added after a night was scheduled is unsellable
 * for that night until this runs. Never touches a pool that already exists, for
 * the reason in this file's header.
 *
 * Returns the keys it created, so a caller can say "VIP is now on sale for this
 * night" rather than "done".
 */
export async function ensureSessionPools(
  admin: Admin,
  tenantId: string,
  sessionId: string,
  wanted: ReadonlyArray<TierUnits>,
): Promise<{ created: string[]; alreadyPresent: string[]; failed: string[] }> {
  const { data: existing, error } = await admin
    .from("capacity_pools")
    .select("pool_key")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "session_tier")
    .eq("subject_id", sessionId);

  if (error) {
    logServerError("sessions.ensureSessionPools.read", error);
    // Refusing beats guessing: creating on a failed read would re-assert every
    // pool and reset seat counts, which is the one thing this must not do.
    return { created: [], alreadyPresent: [], failed: wanted.map((w) => w.poolKey) };
  }

  const present = new Set((existing ?? []).map((row) => String(row.pool_key)));
  const created: string[] = [];
  const alreadyPresent: string[] = [];
  const failed: string[] = [];

  for (const tier of wanted) {
    if (present.has(tier.poolKey)) {
      alreadyPresent.push(tier.poolKey);
      continue;
    }
    const ok = await createOnePool(admin, tenantId, sessionId, tier);
    (ok ? created : failed).push(tier.poolKey);
  }

  return { created, alreadyPresent, failed };
}

async function createPools(
  admin: Admin,
  tenantId: string,
  sessionId: string,
  pools: ReadonlyArray<TierUnits>,
): Promise<number> {
  let made = 0;
  for (const tier of pools) {
    if (await createOnePool(admin, tenantId, sessionId, tier)) made += 1;
  }
  return made;
}

async function createOnePool(
  admin: Admin,
  tenantId: string,
  sessionId: string,
  tier: TierUnits,
): Promise<boolean> {
  const { error } = await admin.rpc("upsert_capacity_pool", {
    p_tenant_id: tenantId,
    p_subject_kind: "session_tier",
    p_subject_id: sessionId,
    p_units_total: tier.units,
    p_pool_key: tier.poolKey,
    // Parentless on purpose today. When Spaces gives a room a pool, the parent
    // belongs here and in exactly one place, which is why this is the one
    // creator.
    p_parent_pool_id: null,
    p_overbook_units: 0,
    p_hold_ttl_seconds: HOLD_TTL_SECONDS,
    p_unit_label: UNIT_LABEL,
    p_is_active: true,
  });
  if (error) {
    logServerError("sessions.createOnePool", error);
    return false;
  }
  return true;
}
