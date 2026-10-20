import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { pickMatches, resolveAccept, shouldWiden, type AcceptOutcome, type MatchCandidate, type MatchStatus } from "./rules";

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/** Records a job and offers it to up to 5 candidates. The caller has authorized the client. */
export async function createMatchRequest(input: {
  tenantId: string;
  clientUserId: string;
  description: string;
  zone: string | null;
  candidates: readonly MatchCandidate[];
}): Promise<{ id: string; offered: string[] } | null> {
  const admin = createServiceRoleClient();
  const description = input.description.trim().slice(0, 2000);
  if (!admin || !description) return null;
  const { data, error } = await admin
    .from("match_requests")
    .insert({ tenant_id: input.tenantId, client_user_id: input.clientUserId, description, zone: input.zone?.trim() || null })
    .select("id")
    .single();
  if (error || !data) {
    logServerError("matchMe.create", error);
    return null;
  }
  const picked = pickMatches(input.candidates, { zone: input.zone });
  const offered = await offerTo(admin, data.id, 1, picked);
  return { id: data.id, offered };
}

async function offerTo(admin: Admin, requestId: string, round: number, picked: readonly MatchCandidate[]): Promise<string[]> {
  if (picked.length === 0) return [];
  const { error } = await admin
    .from("match_request_recipients")
    .insert(picked.map((p) => ({ request_id: requestId, talent_profile_id: p.id, round })));
  if (error) {
    logServerError("matchMe.offer", error);
    return [];
  }
  return picked.map((p) => p.id);
}

/** First accept wins: the conditional update (status still open) is the atomic step. */
export async function acceptMatch(requestId: string, talentId: string): Promise<AcceptOutcome> {
  const admin = createServiceRoleClient();
  if (!admin) return "closed";
  const [req, rec] = await Promise.all([
    admin.from("match_requests").select("status, winner_talent_id").eq("id", requestId).maybeSingle(),
    admin.from("match_request_recipients").select("talent_profile_id").eq("request_id", requestId),
  ]);
  if (req.error || rec.error || !req.data) {
    logServerError("matchMe.accept.read", req.error ?? rec.error);
    return "closed";
  }
  const outcome = resolveAccept(
    { status: req.data.status as MatchStatus, winnerId: req.data.winner_talent_id, offeredIds: (rec.data ?? []).map((r) => r.talent_profile_id) },
    talentId,
  );
  if (outcome !== "won") return outcome;
  const won = await admin
    .from("match_requests")
    .update({ status: "accepted", winner_talent_id: talentId, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id");
  if (won.error) {
    logServerError("matchMe.accept.win", won.error);
    return "closed";
  }
  if ((won.data ?? []).length === 0) return "already_taken";
  // Everyone else is told (their offer closes); the winner's row records the accept.
  const closed = await Promise.all([
    admin.from("match_request_recipients").update({ status: "accepted" }).eq("request_id", requestId).eq("talent_profile_id", talentId),
    admin.from("match_request_recipients").update({ status: "closed" }).eq("request_id", requestId).neq("talent_profile_id", talentId),
  ]);
  for (const r of closed) if (r.error) logServerError("matchMe.accept.close", r.error);
  return "won";
}

/** Idempotent: run when a request is read or on a schedule; offers the next 5 once 2h passed. */
export async function widenIfDue(requestId: string, candidates: readonly MatchCandidate[], nowMs = Date.now()): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const req = await admin.from("match_requests").select("status, zone, round, round_started_at").eq("id", requestId).maybeSingle();
  if (req.error || !req.data) {
    logServerError("matchMe.widen.read", req.error);
    return [];
  }
  const roundStartedAtMs = Date.parse(req.data.round_started_at);
  if (!shouldWiden({ status: req.data.status as MatchStatus, roundStartedAtMs }, nowMs)) return [];
  const prior = await admin.from("match_request_recipients").select("talent_profile_id").eq("request_id", requestId);
  if (prior.error) {
    logServerError("matchMe.widen.prior", prior.error);
    return [];
  }
  // Claim the round first (conditional on the round we read) so two callers cannot both widen.
  const claim = await admin
    .from("match_requests")
    .update({ round: req.data.round + 1, round_started_at: new Date(nowMs).toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .eq("round", req.data.round)
    .select("id");
  if (claim.error || (claim.data ?? []).length === 0) return [];
  const picked = pickMatches(candidates, { zone: req.data.zone }, { excludeIds: (prior.data ?? []).map((r) => r.talent_profile_id) });
  return offerTo(admin, requestId, req.data.round + 1, picked);
}
