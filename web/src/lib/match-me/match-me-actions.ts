"use server";

/**
 * TUL-1464: the two server actions behind "Match me with a professional".
 *  - `requestMatch`: a signed-in CLIENT describes a job on this site; up to 5 matching
 *    professionals of THIS workspace are offered it.
 *  - `acceptMatchAsTalent`: the signed-in professional accepts; the first one wins, the rest
 *    are told, and the client is told someone accepted (never any contact detail).
 * The decisions live in `rules.ts` / `match-me.server.ts`; this file only authenticates,
 * rate-limits and notifies.
 */
import { z } from "zod";

import { isClientAccountEligible } from "@/lib/client-account/pure";
import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "@/lib/client-account/tenant.server";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { notifyMatchAccepted, notifyMatchOffered, notifyMatchTaken } from "@/lib/notifications/producers/match-notify";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { loadMatchCandidates } from "./match-candidates.server";
import { acceptMatch, createMatchRequest } from "./match-me.server";

export type RequestMatchResult =
  | { ok: true; requestId: string; offered: number }
  | { ok: false; reason: "invalid" | "unavailable" | "not_signed_in" | "not_client" | "rate_limited" | "nobody_matches" };

const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const REQUESTS_PER_CLIENT = 5;

export async function requestMatch(input: { description: string; zone?: string | null }): Promise<RequestMatchResult> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, reason: "unavailable" };
  const parsed = z
    .object({ description: z.string().trim().min(1).max(2000), zone: z.string().trim().max(120).nullish() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false, reason: "unavailable" };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, reason: "not_signed_in" };
  if (!isClientAccountEligible(session.profile?.app_role ?? null)) return { ok: false, reason: "not_client" };
  const tenant = await resolveAccountTenant();
  const admin = createServiceRoleClient();
  if (!tenant || !admin) return { ok: false, reason: "unavailable" };
  if (!tryConsumeRateLimit(`match-request:${session.user.id}`, REQUESTS_PER_CLIENT, REQUEST_WINDOW_MS)) {
    return { ok: false, reason: "rate_limited" };
  }
  const candidates = await loadMatchCandidates(tenant.tenantId);
  const created = await createMatchRequest({
    tenantId: tenant.tenantId,
    clientUserId: session.user.id,
    description: parsed.data.description,
    zone: parsed.data.zone ?? null,
    candidates,
  });
  if (!created) return { ok: false, reason: "unavailable" };
  if (created.offered.length === 0) return { ok: false, reason: "nobody_matches" };
  await notifyMatchOffered({ admin, tenantId: tenant.tenantId, requestId: created.id, talentIds: created.offered, summary: parsed.data.description });
  return { ok: true, requestId: created.id, offered: created.offered.length };
}

export type AcceptMatchResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "not_signed_in" | "forbidden" | "already_taken" | "not_offered" | "closed" };

export async function acceptMatchAsTalent(input: { requestId: string }): Promise<AcceptMatchResult> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, reason: "unavailable" };
  const parsed = z.object({ requestId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const me = await requireTalentSelf();
  if (!me.ok) return { ok: false, reason: "not_signed_in" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  // The request's own tenant decides the scope; acceptMatch then requires the caller to own the
  // offered profile AND that profile to be on this tenant's roster.
  const req = await admin.from("match_requests").select("tenant_id, client_user_id").eq("id", parsed.data.requestId).maybeSingle();
  if (req.error) {
    logServerError("matchMe.accept.request", req.error);
    return { ok: false, reason: "unavailable" };
  }
  const row = req.data as { tenant_id: string; client_user_id: string } | null;
  if (!row) return { ok: false, reason: "closed" };
  const outcome = await acceptMatch(parsed.data.requestId, me.talentProfile.id, { tenantId: row.tenant_id, callerUserId: me.session.user.id });
  if (outcome !== "won") return { ok: false, reason: outcome };
  const others = await admin.from("match_request_recipients").select("talent_profile_id").eq("request_id", parsed.data.requestId).neq("talent_profile_id", me.talentProfile.id);
  if (others.error) logServerError("matchMe.accept.others", others.error);
  await Promise.all([
    notifyMatchTaken({ admin, tenantId: row.tenant_id, requestId: parsed.data.requestId, talentIds: (others.data ?? []).map((r) => (r as { talent_profile_id: string }).talent_profile_id) }),
    notifyMatchAccepted({ admin, tenantId: row.tenant_id, requestId: parsed.data.requestId, clientUserId: row.client_user_id, proTalentId: me.talentProfile.id }),
  ]);
  return { ok: true };
}
