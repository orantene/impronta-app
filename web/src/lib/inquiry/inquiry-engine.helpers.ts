import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";
import { validateInquiryConsistency } from "./inquiry-lifecycle";
import type { EngineResult } from "./inquiry-engine.types";

/**
 * Returns a Supabase client to use for engine-side writes after the
 * `validateActorPermission` security gate has passed. Self-elevates to
 * service-role when available — RLS UPDATE policies on `public.inquiries`
 * (and friends) silently filter legitimate writers (e.g. the inquiry's own
 * client submitting an offer reject, a pure talent accepting an invitation),
 * causing UPDATE to return 0 rows and the engine to mis-report
 * version_conflict.
 *
 * Discovery: `web/scripts/qa-walk-rls.mjs` + evidence at
 * `web/docs/qa-evidence/2026-05-14/step-06-rls-walk-systemic-finding.md`.
 * First applied to createOffer (commit 85729cbc7) + clientRejectOffer
 * (commit 0e2c60243). This helper consolidates the pattern.
 *
 * Reads stay on the user-session `supabase` client so the engine still
 * sees what the actor is allowed to see. Only the mechanical write is
 * elevated.
 */
export async function inquiryWriteClient(
  supabase: SupabaseClient,
): Promise<SupabaseClient> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();
    return admin ?? supabase;
  } catch {
    return supabase;
  }
}

export async function runWithEngineLog<T>(
  action: string,
  inquiryId: string | undefined,
  actorUserId: string | undefined,
  fn: () => Promise<EngineResult<T>>,
): Promise<EngineResult<T>> {
  const started = Date.now();
  try {
    const result = await fn();
    await improntaLog("inquiry_engine", {
      action,
      inquiryId: inquiryId ?? "",
      actorUserId: actorUserId ?? "",
      result: result.success ? (result.already ? "already" : "success") : "error",
      durationMs: Date.now() - started,
      errorReason: result.success ? "" : (result.reason ?? result.error ?? ""),
    });
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await improntaLog("inquiry_engine", {
      action,
      inquiryId: inquiryId ?? "",
      actorUserId: actorUserId ?? "",
      result: "error",
      durationMs: Date.now() - started,
      errorReason: err,
    });
    return { success: false, error: err };
  }
}

export async function assertConsistencyAfterWrite(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<void> {
  const { data } = await supabase
    .from("inquiries")
    .select(
      "tenant_id, status, next_action_by, coordinator_id, current_offer_id, booked_at, is_frozen, frozen_at, frozen_by_user_id",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return;
  const c = validateInquiryConsistency({
    status: data.status as string,
    next_action_by: data.next_action_by as string | null,
    coordinator_id: data.coordinator_id as string | null,
    current_offer_id: data.current_offer_id as string | null,
    booked_at: data.booked_at as string | null,
    is_frozen: data.is_frozen as boolean,
    frozen_at: data.frozen_at as string | null,
    frozen_by_user_id: data.frozen_by_user_id as string | null,
  });
  if (!c.ok) {
    await improntaLog("inquiry_engine.consistency_alert", { inquiryId, message: c.message });
  }

  // Tenant-coherence guard (XTENANT_REHOME safety). Re-home correctness rests on
  // ~8 manual homeTenantId inserts in submitInquiry; a future edit that
  // reintroduced input.tenant_id on any single child insert would silently split
  // the inquiry across two tenants (host + managing agency) with no alert — the
  // re-homed inquiry would be half-visible under each RLS scope. Assert here that
  // every per-inquiry child row shares inquiries.tenant_id and shout loudly (and,
  // in dev, throw) on any mismatch. Cheap: three grouped SELECTs, no-op on the
  // happy path (every row already carries the same tenant_id).
  await assertTenantCoherenceAfterWrite(supabase, inquiryId, data.tenant_id as string);
}

/**
 * Confirms every per-inquiry child row (participants, requirement groups,
 * messages) shares the inquiry's tenant_id. Best-effort + non-throwing in
 * production (logs a loud consistency alert); throws in dev so a coherence
 * regression fails a test / local run instead of shipping silently.
 *
 * `agency_client_relationships` is intentionally NOT swept here: it is a durable
 * per-(tenant, client) record keyed by first_inquiry_id, shared across many
 * inquiries, so it has no 1:1 tenant coupling to a single inquiry to assert.
 */
async function assertTenantCoherenceAfterWrite(
  supabase: SupabaseClient,
  inquiryId: string,
  inquiryTenantId: string,
): Promise<void> {
  const childTables = [
    "inquiry_participants",
    "inquiry_requirement_groups",
    "inquiry_messages",
  ] as const;

  const mismatches: Array<{ table: string; foundTenantIds: string[] }> = [];
  for (const table of childTables) {
    // Pull only rows whose tenant_id disagrees with the inquiry's. On the happy
    // path this returns zero rows (a cheap index probe), so it never allocates
    // the full child set.
    const { data, error } = await supabase
      .from(table)
      .select("tenant_id")
      .eq("inquiry_id", inquiryId)
      .neq("tenant_id", inquiryTenantId)
      .limit(50);
    if (error) {
      // A read failure must never break the write path; note it and move on.
      await improntaLog("inquiry_engine.tenant_coherence_probe_error", {
        inquiryId,
        table,
        message: error.message,
      });
      continue;
    }
    if (data && data.length > 0) {
      const foundTenantIds = [
        ...new Set((data as Array<{ tenant_id: string }>).map((r) => r.tenant_id)),
      ];
      mismatches.push({ table, foundTenantIds });
    }
  }

  if (mismatches.length > 0) {
    const message = `inquiry ${inquiryId} tenant_id=${inquiryTenantId} has child rows on a different tenant: ${JSON.stringify(
      mismatches,
    )}`;
    await improntaLog("inquiry_engine.tenant_coherence_alert", { inquiryId, message });
    // Fail hard in dev/test so a coherence regression is caught before it ships;
    // stay non-throwing in production where the write has already committed.
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`[tenant-coherence] ${message}`);
    }
  }
}
