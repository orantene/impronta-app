import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { authorizeAccept, pickMatches, resolveAccept, shouldWiden, type AcceptOutcome, type MatchCandidate, type MatchStatus } from "./rules";

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
    .upsert(picked.map((p) => ({ request_id: requestId, talent_profile_id: p.id, round })), { onConflict: "request_id,talent_profile_id", ignoreDuplicates: true });
  if (error) {
    logServerError("matchMe.offer", error);
    return [];
  }
  return picked.map((p) => p.id);
}

/**
 * First accept wins: the conditional update (status still open) is the atomic step. The caller
 * must be the signed-in owner of the offered profile, on the roster of the request's tenant.
 */
export async function acceptMatch(requestId: string, talentId: string, ctx: { tenantId: string; callerUserId: string | null }): Promise<AcceptOutcome | "forbidden"> {
  const admin = createServiceRoleClient();
  if (!admin) return "closed";
  const [req, rec, talent, roster] = await Promise.all([
    admin.from("match_requests").select("status, winner_talent_id, tenant_id").eq("id", requestId).maybeSingle(),
    admin.from("match_request_recipients").select("talent_profile_id").eq("request_id", requestId),
    admin.from("talent_profiles").select("user_id").eq("id", talentId).maybeSingle(),
    admin.from("agency_talent_roster").select("id").eq("tenant_id", ctx.tenantId).eq("talent_profile_id", talentId).eq("status", "active").maybeSingle(),
  ]);
  if (req.error || rec.error || talent.error || roster.error || !req.data) {
    logServerError("matchMe.accept.read", req.error ?? rec.error ?? talent.error ?? roster.error);
    return "closed";
  }
  if (
    !authorizeAccept({
      requestTenantId: req.data.tenant_id,
      ctxTenantId: ctx.tenantId,
      talentUserId: (talent.data as { user_id: string | null } | null)?.user_id ?? null,
      callerUserId: ctx.callerUserId,
      onRoster: roster.data != null,
    })
  ) {
    return "forbidden";
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
    .eq("tenant_id", ctx.tenantId)
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

/**
 * Idempotent: run when a request is read or on a schedule; offers the next 5 once 2h passed.
 * The new offers are written FIRST and the round advances only after that succeeded, so a failed
 * write leaves the request due to widen again instead of silently skipping a round.
 */
export async function widenIfDue(requestId: string, tenantId: string, candidates: readonly MatchCandidate[], nowMs = Date.now()): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const req = await admin.from("match_requests").select("status, zone, round, round_started_at").eq("id", requestId).eq("tenant_id", tenantId).maybeSingle();
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
  const picked = pickMatches(candidates, { zone: req.data.zone }, { excludeIds: (prior.data ?? []).map((r) => r.talent_profile_id) });
  if (picked.length === 0) return [];
  const offered = await offerTo(admin, requestId, req.data.round + 1, picked);
  if (offered.length === 0) return [];
  // Advance the round only now, conditional on the round we read, so two callers cannot both widen.
  const claim = await admin
    .from("match_requests")
    .update({ round: req.data.round + 1, round_started_at: new Date(nowMs).toISOString() })
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .eq("round", req.data.round)
    .select("id");
  if (claim.error) logServerError("matchMe.widen.claim", claim.error);
  return claim.error || (claim.data ?? []).length === 0 ? [] : offered;
}
