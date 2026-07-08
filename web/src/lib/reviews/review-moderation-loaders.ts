/**
 * Staff-scoped read helpers for review MODERATION ops.
 *
 * Plain server module (NOT "use server") so it can be imported by server
 * components AND wrapped by a thin server-action boundary for "use client"
 * surfaces (the reported-reviews queue). It exposes two reads that power the
 * moderation surface:
 *
 *   loadReportedReviews(tenantId)            — reviews a subject flagged
 *                                              (talent_reviews.reported_at set),
 *                                              joined with the talent's display
 *                                              name + this row's recent
 *                                              review_moderation_events.
 *   loadModerationIntegritySignals(tenantId) — per talent, the delta between the
 *                                              PUBLIC rating_avg and the ALL-rows
 *                                              rating_all_avg + a hidden-review
 *                                              count. A large positive gap is the
 *                                              laundering fingerprint: bad
 *                                              (low-star) reviews were hidden, so
 *                                              the public average floated up.
 *
 * This is the FIRST read of review_moderation_events and of
 * talent_profiles.rating_all_avg / rating_all_count (both written by migration
 * 20261110040000 but never read until now).
 *
 * Auth model: every entry point requires an AGENCY-STAFF session (requireStaff)
 * and then reads through the SERVICE-ROLE client scoped to `tenantId` in the
 * query. review_moderation_events + the hidden/reported rows are staff-only
 * under RLS anyway; running on the service role avoids brittle cross-table RLS
 * joins while the explicit tenant_id filter keeps every read tenant-scoped.
 * Callers that fail the staff gate get an empty payload — never an error, never
 * a leak. NEW tables/columns are read with .returns<T>() (database.types.ts not
 * regenerated this wave).
 */

import { requireStaff } from "@/lib/server/action-guards";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** A single moderation-audit event on a review (immutable trail row). */
export type ReviewModerationEvent = {
  id: string;
  action: "hide" | "unhide" | "spam_flag" | "unspam" | "report";
  reasonCode: string | null;
  justification: string | null;
  actorUserId: string | null;
  actorIsPlatform: boolean;
  createdAt: string;
};

/** A reported (subject-flagged) review awaiting staff moderation. */
export type ReportedReview = {
  reviewId: string;
  /** Only 'talent' today — talent_reviews carries reported_at. Kept explicit so
   * the queue can render a "reporter side" label and grow to client reviews. */
  reviewKind: "talent";
  tenantId: string;
  talentProfileId: string;
  talentName: string | null;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  /** ISO timestamp the subject flagged it. */
  reportedAt: string;
  createdAt: string;
  /** Who the report came FROM — the talent flags a client→talent review. */
  reporterSide: "talent";
  /** Most-recent moderation events on this review, newest first. */
  recentEvents: ReviewModerationEvent[];
};

/** Per-talent laundering fingerprint: public avg vs all-rows avg + hidden count. */
export type ModerationIntegritySignal = {
  talentProfileId: string;
  talentName: string | null;
  /** Public-facing average (published + verified rows only). */
  publicAvg: number;
  /** Count behind the public average. */
  publicCount: number;
  /** Average across ALL non-spam rows regardless of status (the "truth"). */
  allAvg: number;
  allCount: number;
  /** publicAvg - allAvg. A large POSITIVE gap = bad reviews were hidden. */
  gap: number;
  /** Reviews currently hidden for this talent (the laundering mechanism). */
  hiddenCount: number;
};

type ReportedRow = {
  id: string;
  tenant_id: string;
  talent_profile_id: string;
  rating: number;
  body: string | null;
  status: "published" | "hidden";
  reported_at: string | null;
  created_at: string;
};

type ModerationEventRow = {
  id: string;
  review_kind: "talent" | "client";
  review_id: string;
  action: "hide" | "unhide" | "spam_flag" | "unspam" | "report";
  reason_code: string | null;
  justification: string | null;
  actor_user_id: string | null;
  actor_is_platform: boolean;
  created_at: string;
};

type ProfileNameRow = { id: string; display_name: string | null };

type ProfileRatingRow = {
  id: string;
  display_name: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  rating_all_avg: number | null;
  rating_all_count: number | null;
};

type HiddenCountRow = { talent_profile_id: string; status: "published" | "hidden" };

/** Resolve talent display names for a set of profile ids (service-role). */
async function resolveTalentNames(
  svc: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  profileIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(profileIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const { data } = await svc
    .from("talent_profiles")
    .select("id, display_name")
    .in("id", ids)
    .returns<ProfileNameRow[]>();
  for (const row of data ?? []) {
    out.set(row.id, (row.display_name ?? "").trim() || null);
  }
  return out;
}

/**
 * Reviews a subject flagged for moderation (talent_reviews.reported_at set),
 * newest report first, each joined with the reviewed talent's name and the
 * recent review_moderation_events on that row. Staff-scoped to `tenantId`.
 * Returns [] for a non-staff caller, an unknown/blank tenant, or when nothing is
 * reported.
 */
export async function loadReportedReviews(
  tenantId: string,
  limit = 100,
): Promise<ReportedReview[]> {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const tid = (tenantId ?? "").trim();
  if (!tid) return [];

  const svc = createServiceRoleClient();
  if (!svc) return [];

  const { data: reported, error } = await svc
    .from("talent_reviews")
    .select(
      "id, tenant_id, talent_profile_id, rating, body, status, reported_at, created_at",
    )
    .eq("tenant_id", tid)
    .not("reported_at", "is", null)
    .order("reported_at", { ascending: false })
    .limit(limit)
    .returns<ReportedRow[]>();

  if (error || !reported || reported.length === 0) return [];

  const reviewIds = reported.map((r) => r.id);
  const [names, eventsByReview] = await Promise.all([
    resolveTalentNames(svc, reported.map((r) => r.talent_profile_id)),
    (async () => {
      const map = new Map<string, ReviewModerationEvent[]>();
      const { data: events } = await svc
        .from("review_moderation_events")
        .select(
          "id, review_kind, review_id, action, reason_code, justification, actor_user_id, actor_is_platform, created_at",
        )
        .eq("review_kind", "talent")
        .eq("tenant_id", tid)
        .in("review_id", reviewIds)
        .order("created_at", { ascending: false })
        .returns<ModerationEventRow[]>();
      for (const e of events ?? []) {
        const list = map.get(e.review_id) ?? [];
        list.push({
          id: e.id,
          action: e.action,
          reasonCode: e.reason_code,
          justification: e.justification,
          actorUserId: e.actor_user_id,
          actorIsPlatform: e.actor_is_platform,
          createdAt: e.created_at,
        });
        map.set(e.review_id, list);
      }
      return map;
    })(),
  ]);

  return reported
    .filter((r): r is ReportedRow & { reported_at: string } => !!r.reported_at)
    .map((r) => ({
      reviewId: r.id,
      reviewKind: "talent" as const,
      tenantId: r.tenant_id,
      talentProfileId: r.talent_profile_id,
      talentName: names.get(r.talent_profile_id) ?? null,
      rating: r.rating,
      body: r.body,
      status: r.status,
      reportedAt: r.reported_at,
      createdAt: r.created_at,
      reporterSide: "talent" as const,
      recentEvents: eventsByReview.get(r.id) ?? [],
    }));
}

/**
 * Per-talent integrity signals for a tenant: the gap between the PUBLIC average
 * (rating_avg) and the ALL-rows average (rating_all_avg) plus the count of
 * currently-hidden reviews. A large positive `gap` with a nonzero `hiddenCount`
 * is the laundering fingerprint — low-star reviews were hidden, floating the
 * public average above the true all-rows average.
 *
 * Only returns talents with at least one review on record (all-count > 0) and a
 * measurable gap, sorted worst-gap first. Staff-scoped to `tenantId`; returns []
 * for a non-staff caller or unknown tenant.
 *
 * @param minGap Minimum publicAvg - allAvg to surface. Default 0.10 (a tenth of
 *   a star) filters out rounding noise. Pass 0 to see every talent with reviews.
 */
export async function loadModerationIntegritySignals(
  tenantId: string,
  minGap = 0.1,
): Promise<ModerationIntegritySignal[]> {
  const auth = await requireStaff();
  if (!auth.ok) return [];

  const tid = (tenantId ?? "").trim();
  if (!tid) return [];

  const svc = createServiceRoleClient();
  if (!svc) return [];

  // The reviews in this tenant tell us which talent profiles to score, and let
  // us count currently-hidden rows per talent (the laundering mechanism).
  const { data: rows, error } = await svc
    .from("talent_reviews")
    .select("talent_profile_id, status")
    .eq("tenant_id", tid)
    .returns<HiddenCountRow[]>();

  if (error || !rows || rows.length === 0) return [];

  const hiddenCounts = new Map<string, number>();
  const profileIds = new Set<string>();
  for (const r of rows) {
    if (!r.talent_profile_id) continue;
    profileIds.add(r.talent_profile_id);
    if (r.status === "hidden") {
      hiddenCounts.set(
        r.talent_profile_id,
        (hiddenCounts.get(r.talent_profile_id) ?? 0) + 1,
      );
    }
  }
  const ids = Array.from(profileIds);
  if (ids.length === 0) return [];

  // The split aggregates live on talent_profiles (public rating_avg vs the
  // all-rows rating_all_avg written by the integrity recompute). FIRST read.
  const { data: profiles } = await svc
    .from("talent_profiles")
    .select(
      "id, display_name, rating_avg, rating_count, rating_all_avg, rating_all_count",
    )
    .in("id", ids)
    .returns<ProfileRatingRow[]>();

  const out: ModerationIntegritySignal[] = [];
  for (const p of profiles ?? []) {
    const allCount = p.rating_all_count ?? 0;
    if (allCount <= 0) continue;
    const publicAvg = Number(p.rating_avg ?? 0);
    const allAvg = Number(p.rating_all_avg ?? 0);
    const gap = Math.round((publicAvg - allAvg) * 100) / 100;
    if (gap < minGap) continue;
    out.push({
      talentProfileId: p.id,
      talentName: (p.display_name ?? "").trim() || null,
      publicAvg: Math.round(publicAvg * 100) / 100,
      publicCount: p.rating_count ?? 0,
      allAvg: Math.round(allAvg * 100) / 100,
      allCount,
      gap,
      hiddenCount: hiddenCounts.get(p.id) ?? 0,
    });
  }

  out.sort((a, b) => b.gap - a.gap);
  return out;
}
