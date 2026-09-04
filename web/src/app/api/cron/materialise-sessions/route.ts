/**
 * Cron — materialise session occurrences (Sessions & Classes P1.2b).
 *
 * Endpoint: GET /api/cron/materialise-sessions  (CRON_SECRET bearer auth)
 *
 * Turns every active `session_series` into real `sessions` rows for the next 90
 * days, each with its own `session_tier` capacity pool, and does nothing else.
 * The decision is pure and lives in `lib/sessions/materialise.ts`; this file is
 * the I/O around it, so the rules below are unit-tested rather than trusted.
 *
 *
 * IDEMPOTENT BY CONSTRUCTION, NOT BY CARE
 * ═══════════════════════════════════════
 * Two writes per occurrence, both no-ops on a second run:
 *   INSERT … ON CONFLICT (series_id, starts_at) DO NOTHING   (P1.1's index)
 *   upsert_capacity_pool(…)                                   only when absent
 *
 * Which makes "run it twice and count the rows" a real proof rather than a
 * reading of the code.
 *
 *
 * A POOL IS CREATED WITH ITS SESSION AND NEVER RE-ASSERTED
 * ═══════════════════════════════════════════════════════
 * The obvious version calls `upsert_capacity_pool` for every occurrence every
 * night, on the grounds that the RPC is idempotent. It is idempotent on the
 * pool's IDENTITY and destructive on its CONTENTS: `ON CONFLICT … DO UPDATE SET
 * units_total = EXCLUDED.units_total` (`20261229000200`). A nightly re-assert
 * would therefore
 *
 *   - silently revert a per-session seat edit — "the 21st seats 40, the rest of
 *     the room is a private party" quietly becomes 60 again overnight, with no
 *     error and no trace, and the operator finds out from the customer who
 *     bought seat 41; and
 *   - write a RAW NUMBER where the arithmetic must be `available + held` under
 *     the pool's row lock, shrinking the ceiling below what is held so the next
 *     release pushes remaining ABOVE it.
 *
 * So this creates pools and never sets them. Changing seats afterwards is
 * `set_session_seats` (`20261229000340`), which does the locked arithmetic —
 * and which this file deliberately never calls, because `available + held`
 * applied to a series' seat count RAISES the ceiling on a session that has
 * already sold. Correct for an editor, silently wrong here, and it would read
 * as a fix because it goes through the locked function rather than around it.
 *
 *
 * THE REPAIR PATH RUNS ON EVERY SWEEP, NOT ONLY AFTER THE FAILURE
 * ══════════════════════════════════════════════════════════════
 * If the session INSERT lands and the pool creation then fails — a timeout, a
 * deploy mid-run — the session exists and cannot be sold. A re-run that asks
 * "does the session exist" says yes and moves on, so the class would sit on the
 * public schedule for ever with nothing behind it, and the only symptom is that
 * nobody can buy it. So pools are reconciled for every in-window session, not
 * only the ones just created (`poolBackfill`). A repair that only runs after the
 * failure it repairs has never been executed.
 *
 *
 * IT REFUSES RATHER THAN GUESSING A TIMEZONE
 * ══════════════════════════════════════════
 * `venues.timezone` is `NOT NULL DEFAULT 'UTC'` and every venue in production
 * carries that default, so the column cannot tell "the operator chose UTC" from
 * "nobody opened the venue screen". A series therefore carries the zone the
 * operator CONFIRMED, and one without it materialises NOTHING and says why. A
 * class in Playa del Carmen six hours off would be valid instants all the way
 * down, and the first signal would be a customer at an empty room.
 *
 * Scheduled daily in `web/vercel.json`. Manual:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/materialise-sessions
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import {
  DEFAULT_HORIZON_DAYS,
  decideMaterialisation,
  type ExistingOccurrence,
  type SeriesInput,
} from "@/lib/sessions/materialise";
import type { IsoWeekday } from "@/lib/sessions/recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trim "18:00:00" (Postgres `time`) to the "HH:MM" the resolver parses. */
function timeToHhmm(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 5) : "";
}

function toWeekdays(value: unknown): IsoWeekday[] {
  if (!Array.isArray(value)) return [];
  const out: IsoWeekday[] = [];
  for (const raw of value) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.push(n as IsoWeekday);
  }
  return out;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/materialise-sessions", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  const now = new Date();
  const horizonIso = new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000).toISOString();

  let created = 0;
  let poolsCreated = 0;
  let skipped = 0;
  const refusals: Array<{ seriesId: string; reason: string }> = [];

  try {
    const { data: seriesRows, error: seriesError } = await admin
      .from("session_series")
      .select(
        "id, tenant_id, venue_id, offering_id, title, local_time, timezone, duration_minutes, weekdays, seats, starts_on, ends_on, is_active",
      )
      .eq("is_active", true);

    // Every Supabase call destructures `error`. A `const { data } = await` with
    // no `error` is how a failed read becomes an empty result and a silent
    // no-op sweep that reports success.
    if (seriesError) {
      logServerError("cron/materialise-sessions.series", seriesError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    for (const row of seriesRows ?? []) {
      const series: SeriesInput = {
        id: String(row.id),
        tenantId: String(row.tenant_id),
        title: String(row.title ?? ""),
        localTime: timeToHhmm(row.local_time),
        timeZone: typeof row.timezone === "string" ? row.timezone : null,
        weekdays: toWeekdays(row.weekdays),
        durationMinutes: Number(row.duration_minutes),
        startsOn: String(row.starts_on),
        endsOn: typeof row.ends_on === "string" ? row.ends_on : null,
        seats: Number(row.seats),
        isActive: row.is_active === true,
      };

      // Occurrences already materialised for THIS series, with whether each
      // already has a pool. `hasPool` is what makes the repair path possible.
      const { data: existingRows, error: existingError } = await admin
        .from("sessions")
        .select("id, starts_at")
        .eq("series_id", series.id)
        .gte("starts_at", now.toISOString())
        .lte("starts_at", horizonIso);
      if (existingError) {
        logServerError("cron/materialise-sessions.existing", existingError);
        continue;
      }

      const existingIds = (existingRows ?? []).map((r) => String(r.id));
      const pooled = new Set<string>();
      if (existingIds.length > 0) {
        const { data: poolRows, error: poolError } = await admin
          .from("capacity_pools")
          .select("subject_id")
          .eq("tenant_id", series.tenantId)
          .eq("subject_kind", "session_tier")
          .in("subject_id", existingIds);
        if (poolError) {
          logServerError("cron/materialise-sessions.pools", poolError);
          continue;
        }
        for (const p of poolRows ?? []) pooled.add(String(p.subject_id));
      }

      const existing: ExistingOccurrence[] = (existingRows ?? []).map((r) => ({
        id: String(r.id),
        startsAt: String(r.starts_at),
        hasPool: pooled.has(String(r.id)),
      }));

      // Instants held at this venue by OTHER series, for the gap-shift
      // collision. Scoped to the venue because two classes at one instant in
      // two different rooms is normal; only the same room is a problem, and the
      // venue is the coarsest thing this phase knows about rooms.
      let venueOccupancy: Array<{ startsAt: string }> = [];
      if (row.venue_id) {
        const { data: venueRows, error: venueError } = await admin
          .from("sessions")
          .select("starts_at, series_id")
          .eq("venue_id", String(row.venue_id))
          .eq("status", "scheduled")
          .gte("starts_at", now.toISOString())
          .lte("starts_at", horizonIso);
        if (venueError) {
          logServerError("cron/materialise-sessions.venue", venueError);
          continue;
        }
        venueOccupancy = (venueRows ?? [])
          .filter((r) => String(r.series_id ?? "") !== series.id)
          .map((r) => ({ startsAt: String(r.starts_at) }));
      }

      const decision = decideMaterialisation(
        series,
        existing,
        now,
        DEFAULT_HORIZON_DAYS,
        venueOccupancy,
      );

      if (!decision.ok) {
        // A refusal is reported, never swallowed. "This series produced nothing
        // this week" is a normal Tuesday; "this series can never produce
        // anything" is a workspace whose schedule silently never appears.
        refusals.push({ seriesId: decision.seriesId, reason: decision.reason });
        continue;
      }

      skipped += decision.skipped.length;

      for (const occ of decision.create) {
        const { data: inserted, error: insertError } = await admin
          .from("sessions")
          .upsert(
            {
              tenant_id: series.tenantId,
              series_id: series.id,
              venue_id: row.venue_id ?? null,
              offering_id: row.offering_id ?? null,
              starts_at: occ.startsAt,
              ends_at: occ.endsAt,
              status: "scheduled",
            },
            { onConflict: "series_id,starts_at", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
        if (insertError) {
          logServerError("cron/materialise-sessions.insert", insertError);
          continue;
        }
        // `ignoreDuplicates` returns no row when the occurrence already existed,
        // which is the normal second-run path and not an error.
        if (!inserted?.id) continue;
        created += 1;

        const { error: poolError } = await admin.rpc("upsert_capacity_pool", {
          p_tenant_id: series.tenantId,
          p_subject_kind: "session_tier",
          p_subject_id: String(inserted.id),
          p_units_total: series.seats,
          p_pool_key: "default",
          p_parent_pool_id: null,
          p_overbook_units: 0,
          p_hold_ttl_seconds: 900,
          p_unit_label: "seat",
          p_is_active: true,
        });
        if (poolError) {
          // Left for the next sweep's backfill rather than retried here: the
          // session exists, the repair path will find it, and hammering a
          // failing RPC inside a loop is how one bad row stalls a whole run.
          logServerError("cron/materialise-sessions.pool", poolError);
          continue;
        }
        poolsCreated += 1;
      }

      // The repair path, exercised every run.
      for (const sessionId of decision.poolBackfill) {
        const { error: backfillError } = await admin.rpc("upsert_capacity_pool", {
          p_tenant_id: series.tenantId,
          p_subject_kind: "session_tier",
          p_subject_id: sessionId,
          p_units_total: series.seats,
          p_pool_key: "default",
          p_parent_pool_id: null,
          p_overbook_units: 0,
          p_hold_ttl_seconds: 900,
          p_unit_label: "seat",
          p_is_active: true,
        });
        if (backfillError) {
          logServerError("cron/materialise-sessions.backfill", backfillError);
          continue;
        }
        poolsCreated += 1;
      }
    }

    improntaLog({
      message: `[cron.materialise-sessions] series=${(seriesRows ?? []).length} sessions=${created} pools=${poolsCreated} skipped=${skipped} refused=${refusals.length}`,
    });

    return NextResponse.json({
      ok: true,
      series: (seriesRows ?? []).length,
      sessionsCreated: created,
      poolsCreated,
      skippedCollisions: skipped,
      refusals,
    });
  } catch (error) {
    logServerError("cron/materialise-sessions", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
