/**
 * Cron — "your class is tomorrow" (Sessions & Classes P1.8).
 *
 * Endpoint: GET /api/cron/session-reminders  (CRON_SECRET bearer auth)
 *
 * The decision is pure and lives in `lib/sessions/reminder-window.ts`; the copy
 * is pure and lives in `lib/sessions/reminder-copy.ts`. This is the I/O between
 * them, so both rules are unit-tested rather than trusted.
 *
 *
 * WHY IT RUNS HOURLY AND NOT DAILY
 * ════════════════════════════════
 * Venues span UTC-12 to UTC+14. A single daily run fires at a different local
 * hour in every one of them — 09:00 for a studio in one zone is the middle of
 * the night in another, and "tomorrow" is not even the same date. Hourly, plus
 * a stable per-admission-per-local-date event id, means each holder is reminded
 * exactly once at a sane local hour wherever their venue is.
 *
 * The idempotency is the dispatch_log unique index on
 * `(event, recipient, channel)`, keyed by
 * `session-reminder:<admissionId>:<localDate>`. Twenty four runs, one email.
 *
 *
 * IT REFUSES RATHER THAN GUESSING A ZONE
 * ══════════════════════════════════════
 * A session whose venue has no CONFIRMED timezone gets no reminder, and the
 * refusal is reported rather than counted as "nothing to do". `venues.timezone`
 * is `NOT NULL DEFAULT 'UTC'`, so the column cannot tell "chose UTC" from
 * "never opened the screen" — and a reminder at a guessed hour is a plausible
 * wrong answer nobody sees until a customer misses a class. A missing reminder
 * is at least visible to the operator who expected it.
 *
 * `not_tomorrow` and the refusals are counted SEPARATELY for the same reason.
 * "Not tomorrow" is the normal answer for almost every row on almost every run;
 * a refusal means a workspace's customers are silently never told. Summing them
 * into one number would hide the second inside the first for ever.
 *
 *
 * WHAT IT WILL NOT DO
 * ═══════════════════
 * Send to an admission that is not `valid`. A refunded or void holder being
 * told to turn up is worse than telling them nothing, and `status` is the
 * commercial state that says so.
 *
 * Scheduled hourly in `web/vercel.json`. Manual:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/session-reminders
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import {
  decideSessionReminder,
  reminderQueryWindow,
  type RemindableSession,
} from "@/lib/sessions/reminder-window";
import { buildSessionReminder } from "@/lib/sessions/reminder-copy";
import { notifySessionReminder } from "@/lib/notifications/producers/session-reminder-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "no_zone x3, no_copy x1" — refusal reasons counted, for the log line.
 *
 * Flat string on purpose: `improntaLog` accepts scalars only, and a log field
 * that has to be re-parsed to be read is not a log field.
 */
function summariseRefusals(refusals: ReadonlyArray<{ reason: string }>): string {
  if (refusals.length === 0) return "none";
  const counts = new Map<string, number>();
  for (const r of refusals) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${reason} x${n}`)
    .join(", ");
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/session-reminders", "CRON_SECRET not set; refusing to run");
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
  const window = reminderQueryWindow(now);

  let sent = 0;
  let notTomorrow = 0;
  let noCopy = 0;
  const refusals: Array<{ sessionId: string; reason: string }> = [];

  try {
    // Deliberately WIDER than a day — see reminderQueryWindow. This is a coarse
    // prefilter; `decideSessionReminder` is the actual test.
    const { data: sessionRows, error: sessionError } = await admin
      .from("sessions")
      .select("id, tenant_id, title, starts_at, status, venue_id, series_id")
      .eq("status", "scheduled")
      .gte("starts_at", window.fromIso)
      .lte("starts_at", window.toIso);
    if (sessionError) {
      logServerError("cron/session-reminders.sessions", sessionError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    const sessions = sessionRows ?? [];
    if (sessions.length === 0) {
      return NextResponse.json({ ok: true, sessions: 0, sent: 0 });
    }

    const venueIds = [
      ...new Set(sessions.map((s) => s.venue_id).filter((v): v is string => typeof v === "string")),
    ];
    const venues = new Map<string, { timezone: string; name: string }>();
    if (venueIds.length > 0) {
      const { data: venueRows, error: venueError } = await admin
        .from("venues")
        .select("id, timezone, name")
        .in("id", venueIds);
      // A failed venue read is not "no venue": it would turn every session into
      // a timezone refusal and report a whole platform as unconfigured.
      if (venueError) {
        logServerError("cron/session-reminders.venues", venueError);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
      }
      for (const v of venueRows ?? []) {
        venues.set(String(v.id), { timezone: String(v.timezone), name: String(v.name) });
      }
    }

    const seriesIds = [
      ...new Set(sessions.map((s) => s.series_id).filter((v): v is string => typeof v === "string")),
    ];
    const seriesTitles = new Map<string, string>();
    if (seriesIds.length > 0) {
      const { data: seriesRows, error: seriesError } = await admin
        .from("session_series")
        .select("id, title, timezone")
        .in("id", seriesIds);
      if (seriesError) logServerError("cron/session-reminders.series", seriesError);
      for (const r of seriesRows ?? []) seriesTitles.set(String(r.id), String(r.title));
    }

    for (const row of sessions) {
      const venue = row.venue_id ? venues.get(String(row.venue_id)) ?? null : null;
      const candidate: RemindableSession = {
        id: String(row.id),
        startsAt: String(row.starts_at),
        status: String(row.status),
        timeZone: venue?.timezone ?? null,
      };

      const decision = decideSessionReminder(candidate, now);
      if (!decision.send) {
        if (decision.reason === "not_tomorrow") notTomorrow += 1;
        else refusals.push({ sessionId: decision.sessionId, reason: decision.reason });
        continue;
      }

      // Only holders whose admission is commercially good. A refunded holder
      // told to turn up is worse than telling them nothing.
      const { data: holders, error: holderError } = await admin
        .from("admissions")
        .select("id, holder_email, holder_name, status")
        .eq("session_id", decision.sessionId)
        .eq("status", "valid");
      if (holderError) {
        logServerError("cron/session-reminders.admissions", holderError);
        continue;
      }

      const title =
        (typeof row.title === "string" && row.title) ||
        (row.series_id ? seriesTitles.get(String(row.series_id)) ?? "Your class" : "Your class");

      for (const holder of holders ?? []) {
        const email = typeof holder.holder_email === "string" ? holder.holder_email : "";
        if (!email) continue;

        const copy = buildSessionReminder({
          startsAt: candidate.startsAt,
          timeZone: decision.timeZone,
          title,
          venueName: venue?.name ?? null,
        });
        // A refusal from the copy builder means the reminder cannot be said
        // correctly. Sending a partial one would put a wrong or missing time in
        // front of a customer, which is the failure this whole path avoids.
        if (!copy) {
          noCopy += 1;
          continue;
        }

        try {
          await notifySessionReminder({
            tenantId: String(row.tenant_id),
            admissionId: String(holder.id),
            sessionId: decision.sessionId,
            localDate: decision.localDate,
            holderEmail: email,
            holderName:
              typeof holder.holder_name === "string" ? holder.holder_name : null,
            subject: copy.subject,
            heading: copy.heading,
            lines: copy.lines,
          });
          sent += 1;
        } catch (err) {
          // One bad address must not stop the other eleven.
          logServerError("cron/session-reminders.dispatch", err);
        }
      }
    }

    void improntaLog("sessions.cron.reminders", {
      sessions: sessions.length,
      sent,
      notTomorrow,
      noCopy,
      refused: refusals.length,
      // improntaLog takes FLAT SCALARS (ImprontaLogFields). An array of
      // {sessionId, reason} typechecks nowhere and reads as nothing useful in a
      // log line anyway. A count per reason is what someone grepping this at
      // 07:00 actually wants: "which way did the sweep refuse, and how often".
      // The session ids are already in the JSON response for whoever needs them.
      refusalReasons: summariseRefusals(refusals),
    });

    return NextResponse.json({
      ok: true,
      sessions: sessions.length,
      sent,
      notTomorrow,
      noCopy,
      refusals,
    });
  } catch (error) {
    logServerError("cron/session-reminders", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
