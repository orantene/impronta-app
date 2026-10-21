import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyMatchOffered } from "@/lib/notifications/producers/match-notify";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { matchMeEnabled } from "./flag";
import { loadMatchCandidates } from "./match-candidates.server";
import { widenIfDue } from "./match-me.server";
import { shouldWiden, type MatchStatus } from "./rules";
import { shapeMyRequests, shapeOffers, type MatchOffer, type MyMatchRequest, type RequestRow } from "./views";

const LIST_LIMIT = 30;

type DueRow = { id: string; tenant_id: string; status: string; round_started_at: string; description: string };

/**
 * Lazy 2-hour widen: no cron. Whenever a request list is read, any OPEN request whose round is
 * older than 2 hours offers its next 5 (widenIfDue is idempotent and conditional on the round).
 * `offeredCounts` (when known) keeps a request nobody was ever offered out of the widen.
 */
async function widenDueRequests(admin: SupabaseClient, rows: readonly DueRow[], offeredCounts?: Readonly<Record<string, number>>): Promise<void> {
  const nowMs = Date.now();
  const due = rows.filter((r) =>
    shouldWiden({ status: r.status as MatchStatus, roundStartedAtMs: Date.parse(r.round_started_at), offeredCount: offeredCounts ? (offeredCounts[r.id] ?? 0) : undefined }, nowMs),
  );
  if (due.length === 0) return;
  const candidatesByTenant = new Map<string, Awaited<ReturnType<typeof loadMatchCandidates>>>();
  for (const r of due) {
    if (!candidatesByTenant.has(r.tenant_id)) candidatesByTenant.set(r.tenant_id, await loadMatchCandidates(r.tenant_id));
    const offered = await widenIfDue(r.id, r.tenant_id, candidatesByTenant.get(r.tenant_id)!, nowMs);
    if (offered.length > 0) await notifyMatchOffered({ admin, tenantId: r.tenant_id, requestId: r.id, talentIds: offered, summary: r.description });
  }
}

/** The signed-in client's own requests on THIS site's workspace. */
export async function loadMyMatchRequests(userId: string, tenantId: string): Promise<MyMatchRequest[]> {
  const admin = createServiceRoleClient();
  if (!matchMeEnabled() || !admin || !userId || !tenantId) return [];
  const reqs = await admin
    .from("match_requests")
    .select("id, tenant_id, description, zone, status, created_at, winner_talent_id, round_started_at")
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (reqs.error) {
    logServerError("matchMe.mine.requests", reqs.error);
    return [];
  }
  const rows = (reqs.data ?? []) as unknown as Array<RequestRow & { tenant_id: string; round_started_at: string }>;
  const ids = rows.map((r) => r.id);
  const countRecipients = () =>
    ids.length ? admin.from("match_request_recipients").select("request_id").in("request_id", ids) : Promise.resolve({ data: [], error: null });
  const tally = (data: unknown[] | null) => {
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ request_id: string }>) out[r.request_id] = (out[r.request_id] ?? 0) + 1;
    return out;
  };
  // Counts first: a request nobody was ever offered stays out of the widen ("no one is available").
  const before = await countRecipients();
  if (before.error) logServerError("matchMe.mine.recipients", before.error);
  await widenDueRequests(admin, rows, before.error ? undefined : tally(before.data));
  const winners = [...new Set(rows.map((r) => r.winner_talent_id).filter((x): x is string => !!x))];
  const [recs, names] = await Promise.all([
    countRecipients(),
    winners.length ? admin.from("talent_profiles").select("id, display_name").in("id", winners) : Promise.resolve({ data: [], error: null }),
  ]);
  if (recs.error) logServerError("matchMe.mine.recipients", recs.error);
  if (names.error) logServerError("matchMe.mine.names", names.error);
  const offeredCounts = tally(recs.data);
  const winnerNames: Record<string, string | null> = {};
  for (const n of (names.data ?? []) as Array<{ id: string; display_name: string | null }>) winnerNames[n.id] = n.display_name;
  return shapeMyRequests({ requests: rows, offeredCounts, winnerNames, countsKnown: !recs.error });
}

/** The jobs offered to THIS professional and still open. The client's contact is never selected. */
export async function loadMyMatchOffers(talentProfileId: string): Promise<MatchOffer[]> {
  const admin = createServiceRoleClient();
  if (!matchMeEnabled() || !admin || !talentProfileId) return [];
  const offers = await admin
    .from("match_request_recipients")
    .select("request_id, offered_at, status")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "offered")
    .order("offered_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (offers.error) {
    logServerError("matchMe.offers.list", offers.error);
    return [];
  }
  const offerRows = (offers.data ?? []) as Array<{ request_id: string; offered_at: string; status: string }>;
  if (offerRows.length === 0) return [];
  const reqs = await admin
    .from("match_requests")
    .select("id, tenant_id, description, zone, status, created_at, winner_talent_id, round_started_at")
    .in("id", offerRows.map((o) => o.request_id));
  if (reqs.error) {
    logServerError("matchMe.offers.requests", reqs.error);
    return [];
  }
  const rows = (reqs.data ?? []) as unknown as Array<RequestRow & { tenant_id: string; round_started_at: string }>;
  await widenDueRequests(admin, rows);
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id))];
  const ag = tenantIds.length ? await admin.from("agencies").select("id, display_name").in("id", tenantIds) : { data: [], error: null };
  if (ag.error) logServerError("matchMe.offers.agencies", ag.error);
  const workspaceNames: Record<string, string | null> = {};
  for (const a of (ag.data ?? []) as Array<{ id: string; display_name: string | null }>) workspaceNames[a.id] = a.display_name;
  return shapeOffers({ offers: offerRows, requests: rows, workspaceNames });
}
