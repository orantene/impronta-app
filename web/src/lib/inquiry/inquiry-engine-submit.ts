import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { assignCoordinatorFromSettings } from "./coordinator-assignment";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
// Step 13 — post-submit notifications + auto-ack
import { logServerError } from "@/lib/server/safe-error";
import { sendInquirySubmittedNotifications } from "@/lib/email/inquiry-notifications";
import { insertSystemMessage } from "./inquiry-system-messages";

// SaaS P1.B STEP A: tenant-scoped by construction. All reads/writes against
// inquiries and inquiry_participants filter on tenant_id. Inserts include
// tenant_id so the Phase-1B triggers have no slack.

async function inquiryInTenant(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

export type InquiryInitiatorRole = "client" | "admin" | "talent" | "hub" | "free_agent";

export type SubmitInquiryInput = {
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  company?: string | null;
  event_date?: string | null;
  event_location?: string | null;
  quantity?: number | null;
  message?: string | null;
  event_type_id?: string | null;
  raw_ai_query?: string | null;
  interpreted_query?: Record<string, unknown> | null;
  source_page?: string | null;
  source_channel: string;
  client_user_id: string | null;
  talent_profile_ids: string[];
  /**
   * Submitter identity. String for authenticated users. NULL for
   * guests (unauthenticated public-storefront submissions). The engine
   * branches:
   *   • null  → permission check is skipped (public guest path);
   *             rate-limit keyed off `guest_session_id` instead of user
   *   • string → existing permission + per-user rate-limit flow
   */
  actorUserId: string | null;
  /**
   * Guest submissions only: the `guest_sessions.id` carrying the
   * x-impronta-guest cookie session. Used by the engine as the
   * rate-limit key when `actorUserId` is null. Ignored otherwise.
   */
  guest_session_id?: string | null;
  /**
   * Universal-connector P0 (2026-05-13). Direction of initiation,
   * independent of `client_user_id` (which identifies the client
   * party regardless of who initiated).
   *
   *   client     — client used a public storefront / dashboard / cart
   *   admin      — admin used the manual-inquiry sheet, OR a pitch sent
   *                by the agency was approved by the recipient
   *   talent     — talent offered themselves for a gig (engine ready;
   *                UI not yet built)
   *   hub        — hub matchmaker connected client + agency (UI not
   *                yet built; step 9)
   *   free_agent — workspace owner who is also talent doing cold
   *                outreach (UI not yet built)
   */
  initiator_role: InquiryInitiatorRole;
  /**
   * auth.users.id of the party who initiated. May differ from
   * `client_user_id`. Defaults to `actorUserId` when not explicitly
   * passed (most direct case).
   */
  initiator_user_id?: string | null;
  /**
   * F3 — origin_domain is the exact hostname where the inquiry form was
   * submitted (e.g. "improntamodels.com", "tulala.digital"). Read from the
   * x-impronta-host-name header via getPublicHostContext(). Nullable: callers
   * that cannot read headers (e.g. staff admin submissions) leave it null.
   */
  origin_domain?: string | null;
  /**
   * F3 — source_workspace_id is the agency tenant whose storefront originated
   * the inquiry. For agency-storefront submissions this equals tenant_id. For
   * hub-originated submissions it equals the hub tenant_id. Nullable for the
   * same reasons as origin_domain.
   */
  source_workspace_id?: string | null;
  /**
   * Tenant (agency) that owns this inquiry. SaaS P1.B: required.
   * For public storefront submissions, resolve via `getPublicTenantScope()`.
   * For staff-initiated submissions, resolve via `getTenantScope()`.
   * Hub / marketing / app hosts cannot submit — callers must fail-hard when
   * the tenant context is not resolvable.
   */
  tenant_id: string;
  /**
   * Phase 3.7 — snapshot the client's trust level at submission time so the
   * pipeline can carry trust signals even after the client's live level changes.
   * "basic" for unauthenticated guests. Nullable for staff-initiated submissions
   * where trust is irrelevant.
   */
  trust_level_at_submission?: string | null;
};

export async function submitInquiry(
  supabase: SupabaseClient,
  input: SubmitInquiryInput,
): Promise<EngineResult<{ inquiryId: string }>> {
  return runWithEngineLog("submitInquiry", undefined, input.actorUserId ?? "guest", async () => {
    if (!input.tenant_id) {
      return { success: false, error: "tenant_required" };
    }

    // Universal-connector P0 — rate-limit per actor identity.
    //   • authenticated user: 5/hour per user (existing)
    //   • guest:              3/hour per guest_session_id (tighter)
    // Plus per-tenant cap of 50/hour across all submitters to one
    // agency — prevents one bad actor across multiple guest sessions
    // from hammering a single tenant.
    const actorKey = input.actorUserId
      ? engineRateKey("submitInquiry", input.actorUserId)
      : `submitInquiry:guest:${input.guest_session_id ?? "anon"}`;
    const actorLimit = input.actorUserId ? 5 : 3;
    const rl = await rateLimiter.check(actorKey, actorLimit, 60 * 60_000);
    if (!rl.ok) {
      return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };
    }
    const tenantRl = await rateLimiter.check(`submitInquiry:tenant:${input.tenant_id}`, 50, 60 * 60_000);
    if (!tenantRl.ok) {
      return { success: false, rateLimited: true, retryAfterMs: tenantRl.retryAfterMs, reason: "rate_limited" };
    }

    // Permission gate. Guest path (null actorUserId) skips the user-
    // based permission check by design — the public storefront IS
    // by-design accessible to anyone. Spam protection lives in the
    // rate-limit + honeypot layer above, not here.
    if (input.actorUserId) {
      const perm = await validateActorPermission(supabase, "", input.actorUserId, "submit_inquiry");
      if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };
    }

    const assignment = await assignCoordinatorFromSettings(supabase, {
      source_type: "agency",
      tenant_id: input.tenant_id,
    });

    const status = "submitted" as const;
    const next = resolveNextActionBy(status);

    const { data: row, error } = await supabase
      .from("inquiries")
      .insert({
        tenant_id: input.tenant_id,
        client_user_id: input.client_user_id,
        // Guest path — `guest_sessions.id` carries the unauthenticated
        // visitor's identity across requests. Nullable for non-guest.
        guest_session_id: input.guest_session_id ?? null,
        contact_name: input.contact_name,
        contact_email: input.contact_email,
        contact_phone: input.contact_phone ?? null,
        company: input.company ?? null,
        event_date: input.event_date ?? null,
        event_location: input.event_location ?? null,
        quantity: input.quantity ?? null,
        message: input.message ?? null,
        event_type_id: input.event_type_id ?? null,
        raw_ai_query: input.raw_ai_query ?? null,
        interpreted_query: input.interpreted_query ?? null,
        source_page: input.source_page ?? null,
        source_channel: input.source_channel as never,
        // F3 — source attribution fields (nullable for older / staff submissions)
        origin_domain: input.origin_domain ?? null,
        source_workspace_id: input.source_workspace_id ?? null,
        // Phase 3.7 — trust snapshot at submission time
        trust_level_at_submission: input.trust_level_at_submission ?? null,
        // Universal-connector P0 (2026-05-13) — direction of initiation.
        // Independent of client_user_id (which identifies the client party
        // regardless of who initiated). Defaults initiator_user_id to
        // actorUserId for the simple direct case.
        initiator_role: input.initiator_role as never,
        initiator_user_id: input.initiator_user_id ?? input.actorUserId ?? null,
        status: status as never,
        uses_new_engine: true,
        source_type: "agency",
        coordinator_id: assignment.coordinator_id,
        coordinator_assigned_at: assignment.coordinator_id ? new Date().toISOString() : null,
        next_action_by: next,
        version: 1,
      })
      .select("id")
      .single();

    if (error || !row) {
      return { success: false, error: error?.message ?? "insert_failed" };
    }

    const inquiryId = row.id as string;

    // M5.6 requirement: every inquiry needs a default `inquiry_requirement_groups`
    // row before any participants with role='talent' can be inserted (the
    // trg_inquiry_participants_default_group trigger auto-fills
    // requirement_group_id from it). Create it now, before any participant inserts.
    const { data: defaultGroup } = await supabase
      .from("inquiry_requirement_groups")
      .insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        role_key: "talent",
        quantity_required: Math.max(input.talent_profile_ids.length, 1),
        sort_order: 0,
      })
      .select("id")
      .single();

    const defaultGroupId = defaultGroup?.id as string | undefined;

    if (input.client_user_id) {
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        user_id: input.client_user_id,
        role: "client",
        status: "active",
      });
    }

    if (assignment.coordinator_id) {
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        user_id: assignment.coordinator_id,
        role: "coordinator",
        status: "invited",
      });
    }

    let sort = 0;
    for (const tid of input.talent_profile_ids) {
      const { data: tp } = await supabase
        .from("talent_profiles")
        .select("user_id")
        .eq("id", tid)
        .maybeSingle();
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        user_id: tp?.user_id ?? null,
        talent_profile_id: tid,
        role: "talent",
        status: "invited",
        sort_order: sort++,
        added_by_user_id: input.actorUserId ?? null,
        requirement_group_id: defaultGroupId ?? null,
      });
    }

    await assertConsistencyAfterWrite(supabase, inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED,
      inquiryId,
      actorUserId: input.actorUserId ?? null,
      data: {
        coordinatorAssigned: Boolean(assignment.coordinator_id),
        talentCount: input.talent_profile_ids.length,
        sourceChannel: input.source_channel,
        initiatorRole: input.initiator_role,
        isGuest: !input.actorUserId,
      },
    });

    // Step 13 — post-submit side-effects: emails + workspace auto-ack.
    // Fired as a void async IIFE so it doesn't block the return value.
    // All wrapped in try/catch — failures must NEVER block the submission.
    void (async () => {
      try {
        // Look up agency display_name + auto-ack settings in one query.
        const { data: agencyRow } = await supabase
          .from("agencies")
          .select("display_name, auto_ack_enabled, auto_ack_message")
          .eq("id", input.tenant_id)
          .maybeSingle();

        const agencyName: string =
          typeof agencyRow?.display_name === "string" && agencyRow.display_name.trim()
            ? agencyRow.display_name
            : "The agency";

        // a/b/c — client confirmation + coordinator assignment + talent invites.
        await sendInquirySubmittedNotifications({
          supabase,
          inquiryId,
          contactEmail: input.contact_email || null,
          coordinatorId: assignment.coordinator_id ?? null,
          talentProfileIds: input.talent_profile_ids,
          agencyName,
        });

        // d — workspace auto-ack: system message into client (private) thread.
        // Only fires when: auto_ack_enabled=true (default) AND there is a
        // client identity (authenticated user_id or contact_email provided).
        const autoAckEnabled =
          agencyRow == null ? true : agencyRow.auto_ack_enabled !== false;
        const autoAckMessage: string =
          typeof agencyRow?.auto_ack_message === "string" && agencyRow.auto_ack_message.trim()
            ? agencyRow.auto_ack_message
            : "Thanks — we'll get back to you within 4 hours.";

        if (autoAckEnabled && (input.client_user_id || input.contact_email)) {
          await insertSystemMessage(supabase, {
            inquiryId,
            threadType: "private",
            eventType: "inquiry_created",
            body: autoAckMessage,
            metadata: { system_event_type: "workspace_auto_ack" },
          });
        }
      } catch (err) {
        logServerError(
          "submitInquiry/post-submit-notifications",
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    })();

    // Step 12: analytics — fires on EVERY successful submission regardless of
    // entry point because all routes converge through submitInquiry after step 0.
    void logAnalyticsEventServer({
      name: PRODUCT_ANALYTICS_EVENTS.inquiry_submitted,
      payload: {
        inquiry_id: inquiryId,
        mode: input.talent_profile_ids.length > 0 ? "pick" : "category",
        talent_count: input.talent_profile_ids.length,
        has_budget: false,
        source_channel: input.source_channel,
        initiator_role: input.initiator_role,
        is_guest: !input.actorUserId,
      },
      userId: input.actorUserId ?? null,
      path: input.source_page ?? null,
    });

    return { success: true, data: { inquiryId } };
  });
}

export async function moveToCoordination(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("moveToCoordination", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "move_to_coordination");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("status, version, is_frozen, uses_new_engine")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const t = canTransition(inq.status as string, "coordination", { isFrozen: !!inq.is_frozen });
    if (!t.ok) return { success: false, reason: t.reason };

    const next = resolveNextActionBy("coordination");

    const writeMove = await inquiryWriteClient(supabase);
    const { data: updated, error } = await writeMove
      .from("inquiries")
      .update({
        status: "coordination" as never,
        next_action_by: next,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_MOVED_TO_COORDINATION,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {},
    });

    return { success: true };
  });
}

export async function setPriority(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    priority: "low" | "normal" | "high" | "urgent";
  },
): Promise<EngineResult> {
  return runWithEngineLog("setPriority", ctx.inquiryId, ctx.actorUserId, async () => {
    if (!(await inquiryInTenant(supabase, ctx.inquiryId, ctx.tenantId))) {
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "set_priority");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version, uses_new_engine, is_frozen")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq?.uses_new_engine) return { success: false, error: "legacy_inquiry" };
    if (inq.is_frozen) return { success: false, reason: "inquiry_frozen" };

    const writePriority = await inquiryWriteClient(supabase);
    const { data: updated, error } = await writePriority
      .from("inquiries")
      .update({
        priority: ctx.priority,
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion)
      .select("id")
      .maybeSingle();

    if (error || !updated) return { success: false, conflict: true, reason: "version_conflict" };

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_PRIORITY_SET,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { priority: ctx.priority },
    });

    return { success: true };
  });
}
