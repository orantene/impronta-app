import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { assignCoordinatorFromSettings, seedOwningAgencyCoordinators } from "./coordinator-assignment";
import { resolveOwningPartiesForTalents, isHubSourcedChannel } from "./owning-party-resolver";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
// Step 13 — post-submit notifications + auto-ack
import { logServerError } from "@/lib/server/safe-error";
import { insertSystemMessage } from "./inquiry-system-messages";
import { buildInquiryBells } from "./inquiry-notifications";

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

async function ensureClientRelationshipForInquiry(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    clientUserId: string;
    inquiryId: string;
    originDomain: string | null;
    sourceWorkspaceId: string | null;
  },
): Promise<void> {
  try {
    const writeClient = await inquiryWriteClient(supabase);
    const { data: clientProfile, error: clientProfileError } = await writeClient
      .from("client_profiles")
      .select("id")
      .eq("user_id", args.clientUserId)
      .maybeSingle();

    if (clientProfileError || !clientProfile?.id) {
      if (clientProfileError) {
        logServerError("inquiry-engine-submit.clientRelationship.profile", clientProfileError);
      }
      return;
    }

    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await writeClient
      .from("agency_client_relationships")
      .select("id, first_inquiry_id")
      .eq("tenant_id", args.tenantId)
      .eq("client_profile_id", clientProfile.id)
      .maybeSingle();

    if (existingError) {
      logServerError("inquiry-engine-submit.clientRelationship.find", existingError);
      return;
    }

    if (existing?.id) {
      const { error: updateError } = await writeClient
        .from("agency_client_relationships")
        .update({
          status: "active",
          last_interaction_at: now,
          updated_at: now,
          source_workspace_id: args.sourceWorkspaceId ?? args.tenantId,
          origin_domain: args.originDomain,
          ...(existing.first_inquiry_id ? {} : { first_inquiry_id: args.inquiryId }),
        })
        .eq("id", existing.id);

      if (updateError) {
        logServerError("inquiry-engine-submit.clientRelationship.update", updateError);
      }
      return;
    }

    const { error: insertError } = await writeClient
      .from("agency_client_relationships")
      .insert({
        tenant_id: args.tenantId,
        client_profile_id: clientProfile.id,
        source_type: "inquiry",
        status: "active",
        first_inquiry_id: args.inquiryId,
        added_by: args.clientUserId,
        last_interaction_at: now,
        source_workspace_id: args.sourceWorkspaceId ?? args.tenantId,
        origin_domain: args.originDomain,
      });

    if (insertError) {
      logServerError("inquiry-engine-submit.clientRelationship.insert", insertError);
    }
  } catch (err) {
    logServerError(
      "inquiry-engine-submit.clientRelationship",
      err instanceof Error ? err : new Error(String(err)),
    );
  }
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
  /**
   * Phase B-1 (inquiry engine, 2026-05-14). Provenance metadata that
   * doesn't fit a flat column. Paired with `source_channel` (the coarse
   * enum). See web/docs/inquiry-engine-spec-2026-05-14.md §11.
   *
   * Examples:
   *   • { shortlist_id: "...", talent_ids: [...] }
   *   • { pitch_token: "...", pitch_id: "..." }
   *   • { rebook_of_inquiry_id: "...", original_booking_id: "..." }
   *   • { referrer_page: "/discover", discovery_search: { q: "...", ... } }
   *   • { public_profile_code: "TAL-92001" }
   */
  source_context?: Record<string, unknown> | null;
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

    // Talent contact-policy gate. Each talent_profiles.contact_policy is a
    // JSONB { basic, verified, silver, gold } of booleans. The talent sets
    // these from talent-drawers ContactPolicy sheet; default is all-open.
    // We only enforce this for client-initiated submissions — admin / talent
    // / hub / free_agent paths bypass (admin can always create on behalf of
    // a client; talent offering self is symmetrical; hub matchmaker is staff).
    //
    // The client's effective tier is taken from trust_level_at_submission
    // (the caller already snapshots this from client_trust_state). Guests
    // default to "basic". If a talent has gated their tier off, we reject
    // with `contact_policy_blocked` and the gated talent id list so the form
    // can render a clear "this talent isn't accepting inquiries from your
    // tier" message instead of a generic failure.
    if (input.initiator_role === "client" && input.talent_profile_ids.length > 0) {
      const clientTier = (input.trust_level_at_submission ?? "basic") as
        | "basic" | "verified" | "silver" | "gold";
      const { data: policies } = await supabase
        .from("talent_profiles")
        .select("id, contact_policy")
        .in("id", input.talent_profile_ids);
      const blocked: string[] = [];
      for (const p of (policies ?? []) as Array<{
        id: string;
        contact_policy: Record<string, boolean> | null;
      }>) {
        // Missing column or row → default to all-open (legacy talents).
        const policy = p.contact_policy ?? {
          basic: true, verified: true, silver: true, gold: true,
        };
        if (policy[clientTier] === false) blocked.push(p.id);
      }
      if (blocked.length > 0) {
        return {
          success: false,
          forbidden: true,
          reason: "contact_policy_blocked",
          error: `One or more talents do not accept inquiries from ${clientTier} clients`,
        };
      }
    }

    // ── Coordinator-of-record + oversight resolution (2026-06-15) ─────────────
    // Resolve owning parties + talent accounts UP FRONT so the inquiry is seated
    // with the correct coordinator-of-record at insert time:
    //   • Talent-direct (open-hub) inquiries — any talent whose owning party is
    //     THEMSELVES — are coordinated BY that talent (true talent-direct). The
    //     platform oversight officer (platform_coordinator_user_id → hub owner)
    //     also joins as a SECONDARY coordinator: an "officer / consultant" in the
    //     private thread for scam & dispute protection and instant support
    //     (this is how open / free hubs stay protected).
    //   • Agency-owned inquiries (an agency storefront, or an exclusive talent
    //     inquired through the open directory) are coordinated by the agency
    //     (default coordinator → workspace owner → global default) and are NEVER
    //     left unmanaged. The platform officer stays out of agency threads.
    const hubSourced = isHubSourcedChannel(input.source_channel);
    const owningParties = await resolveOwningPartiesForTalents(
      supabase,
      input.talent_profile_ids,
      input.tenant_id,
      hubSourced,
    );

    // Batch-resolve talent → claimed user account once; reused for the
    // coordinator-of-record, the lineup rows, and self-coordination seeding.
    const talentUserIdByProfile = new Map<string, string | null>();
    if (input.talent_profile_ids.length > 0) {
      const { data: tpRows } = await supabase
        .from("talent_profiles")
        .select("id, user_id")
        .in("id", input.talent_profile_ids);
      for (const r of (tpRows ?? []) as Array<{ id: string; user_id: string | null }>) {
        talentUserIdByProfile.set(r.id, r.user_id ?? null);
      }
    }

    // First self-coordinating talent (owning party = themselves) with a claimed
    // account → coordinator-of-record (talent-direct).
    let selfCoordPrimaryUserId: string | null = null;
    for (const tid of input.talent_profile_ids) {
      if (owningParties.get(tid)?.type !== "talent") continue;
      const uid = talentUserIdByProfile.get(tid) ?? null;
      if (uid) {
        selfCoordPrimaryUserId = uid;
        break;
      }
    }

    // Resolve the coordinator-of-record + (talent-direct only) the secondary
    // platform oversight officer.
    let coordinatorOfRecordId: string | null;
    let oversightOfficerId: string | null = null;
    if (selfCoordPrimaryUserId) {
      coordinatorOfRecordId = selfCoordPrimaryUserId;
      const officer = await assignCoordinatorFromSettings(supabase, {
        source_type: "hub",
        tenant_id: input.tenant_id,
      });
      oversightOfficerId =
        officer.coordinator_id && officer.coordinator_id !== selfCoordPrimaryUserId
          ? officer.coordinator_id
          : null;
    } else {
      const agencyAssignment = await assignCoordinatorFromSettings(supabase, {
        source_type: "agency",
        tenant_id: input.tenant_id,
      });
      coordinatorOfRecordId = agencyAssignment.coordinator_id;
    }

    // Stored source_type reflects the coordination model: 'hub' for talent-direct
    // (so a later auto-reassign / timeout resolves the platform officer), else
    // 'agency'.
    const inquirySourceType: "agency" | "hub" = selfCoordPrimaryUserId ? "hub" : "agency";

    // Dedup set shared across every coordinator-participant insert below.
    const coordSeen = new Set<string>();

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
        // Phase B-1 (2026-05-14) — rich provenance context paired with
        // source_channel. Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11
        source_context: input.source_context ?? {},
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
        source_type: inquirySourceType,
        coordinator_id: coordinatorOfRecordId,
        coordinator_assigned_at: coordinatorOfRecordId ? new Date().toISOString() : null,
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

      await ensureClientRelationshipForInquiry(supabase, {
        tenantId: input.tenant_id,
        clientUserId: input.client_user_id,
        inquiryId,
        originDomain: input.origin_domain ?? null,
        sourceWorkspaceId: input.source_workspace_id ?? null,
      });
    }

    // Seat the coordinator-of-record. A self-coordinating talent is immediately
    // active (they run their own booking); an agency coordinator is invited
    // (they accept). Tracked in coordSeen so later coordinator inserts dedupe.
    if (coordinatorOfRecordId) {
      coordSeen.add(coordinatorOfRecordId);
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        user_id: coordinatorOfRecordId,
        role: "coordinator",
        status: selfCoordPrimaryUserId ? "active" : "invited",
      });
    }

    // Seat the platform oversight officer (talent-direct inquiries only) as a
    // SECONDARY coordinator — the "officer / consultant" in the private thread.
    if (oversightOfficerId && !coordSeen.has(oversightOfficerId)) {
      coordSeen.add(oversightOfficerId);
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        user_id: oversightOfficerId,
        role: "coordinator",
        status: "invited",
      });
    }

    // Phase 5 — multi-coordinator fan-out. Every roster talent the
    // workspace designated a default inquiry coordinator
    // (agency_inquiry_coordinators) also joins the thread as a
    // `coordinator` participant, so they can manage the inquiry → booking
    // flow alongside the primary coordinator resolved above. Deduped
    // against the primary; talent without a claimed account (no user_id)
    // are skipped — a participant needs a user. Best-effort: the inquiry
    // is already persisted, so a failure here must never block submission.
    if (input.tenant_id) {
      try {
        const { data: coordRows } = await supabase
          .from("agency_inquiry_coordinators")
          .select("talent_profile_id")
          .eq("tenant_id", input.tenant_id);
        const coordTalentIds = (
          (coordRows ?? []) as Array<{ talent_profile_id: string }>
        ).map((r) => r.talent_profile_id);
        if (coordTalentIds.length > 0) {
          const { data: coordTalent } = await supabase
            .from("talent_profiles")
            .select("user_id")
            .in("id", coordTalentIds);
          for (const t of (coordTalent ?? []) as Array<{ user_id: string | null }>) {
            const uid = t.user_id;
            if (!uid || coordSeen.has(uid)) continue;
            coordSeen.add(uid);
            await supabase.from("inquiry_participants").insert({
              inquiry_id: inquiryId,
              tenant_id: input.tenant_id,
              user_id: uid,
              role: "coordinator",
              status: "invited",
            });
          }
        }
      } catch (fanoutErr) {
        logServerError("inquiry-engine-submit.coordinatorFanout", fanoutErr);
      }
    }

    // D0 (Discover funnel convergence): freeze each talent's owning party (resolved
    // up front) onto `inquiry_participants.owning_party_type/_id` so commission
    // resolution + thread fan-out stay coherent even if the talent's exclusivity
    // later changes. For the dominant single-tenant case the resolver returns
    // `{ type: 'workspace', id: tenant_id }` (matches the trigger default); for
    // Discover/hub-originated inquiries exclusive-agency talents route to the
    // agency and independent talents to their own inbox.
    let sort = 0;
    for (const tid of input.talent_profile_ids) {
      // Resolver guarantees a value for every id; fall back to workspace
      // + this inquiry's tenant_id (matches trigger default) on miss.
      const owning = owningParties.get(tid) ?? {
        type: "workspace" as const,
        id: input.tenant_id,
      };
      await supabase.from("inquiry_participants").insert({
        inquiry_id: inquiryId,
        tenant_id: input.tenant_id,
        user_id: talentUserIdByProfile.get(tid) ?? null,
        talent_profile_id: tid,
        role: "talent",
        status: "invited",
        sort_order: sort++,
        added_by_user_id: input.actorUserId ?? null,
        requirement_group_id: defaultGroupId ?? null,
        // D0 — explicit override of the trigger default. For
        // single-tenant inquiries this still ends up as
        // ('workspace', tenant_id), matching the trigger. For Discover
        // cross-tenant routing this carries the resolved party through.
        owning_party_type: owning.type,
        owning_party_id: owning.id,
      });
    }

    // Hub self-coordination (2026-06-02; talent-primary 2026-06-15). Every talent
    // whose resolved owning party is THEMSELVES (independent / open-hub) runs their
    // own booking and joins the thread as a `coordinator` (in addition to their
    // `talent` lineup row) so they can broker the client on the private thread —
    // the access the private-thread RLS grants to `role IN ('client','coordinator')`.
    // The FIRST such talent is already the coordinator-of-record (seated above);
    // this seeds any ADDITIONAL self-coordinating talents (multi-talent shortlist),
    // deduped via coordSeen. Keyed on user_id only (no talent_profile_id, so the
    // talent/coordinator rows never collide on the active_talent unique index) and
    // skipped for talents without a claimed account. No agency sits in the money
    // path; the platform's flat take still applies (sellerOfRecord='talent').
    try {
      for (const tid of input.talent_profile_ids) {
        if (owningParties.get(tid)?.type !== "talent") continue;
        const uid = talentUserIdByProfile.get(tid) ?? null;
        if (!uid || coordSeen.has(uid)) continue;
        coordSeen.add(uid);
        await supabase.from("inquiry_participants").insert({
          inquiry_id: inquiryId,
          tenant_id: input.tenant_id,
          user_id: uid,
          role: "coordinator",
          status: "active",
        });
      }
    } catch (selfCoordErr) {
      // Best-effort: the inquiry is already persisted; a failure to add the
      // self-coordinator must never block submission.
      logServerError("inquiry-engine-submit.talentSelfCoordinator", selfCoordErr);
    }

    // Cross-tenant coordinator: when an EXCLUSIVE talent is owned by an agency
    // different from the inquiry's tenant (e.g. inquired via the open hub, filed
    // under the hub tenant), seed that owning agency's coordinator so the inquiry
    // isn't left unmanaged. No-op for the common same-tenant case. Returns the
    // (possibly newly-promoted) coordinator of record for the engine event below.
    coordinatorOfRecordId = await seedOwningAgencyCoordinators(supabase, {
      inquiryId,
      inquiryTenantId: input.tenant_id,
      talentProfileIds: input.talent_profile_ids,
      owningParties,
      existingCoordinatorId: coordinatorOfRecordId,
    });

    await assertConsistencyAfterWrite(supabase, inquiryId);

    // In-app bells: workspace admins ("new inquiry") + invited talent ("you're
    // invited"), with audience-appropriate copy. Deliberately NO coordinator —
    // when one is auto-assigned the COORDINATOR_ASSIGNED event bells them, so
    // adding them here would double-notify. Talent get no ROSTER_TALENT_INVITED
    // event on the submit path, so this is their only invite bell.
    const submitBells = [
      ...(await buildInquiryBells({
        inquiryId,
        tenantId: input.tenant_id,
        audiences: ["workspaceAdmins"],
        title: "New inquiry received",
        body: "A new inquiry just came in and needs coordination.",
        excludeUserId: input.actorUserId ?? null,
      })),
      ...(await buildInquiryBells({
        inquiryId,
        tenantId: input.tenant_id,
        audiences: ["talent"],
        title: "You've been invited to an inquiry",
        body: "A client requested you for a new inquiry. Review the details to respond.",
        excludeUserId: input.actorUserId ?? null,
      })),
    ];

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.INQUIRY_SUBMITTED,
      inquiryId,
      actorUserId: input.actorUserId ?? null,
      data: {
        coordinatorAssigned: Boolean(coordinatorOfRecordId),
        talentCount: input.talent_profile_ids.length,
        sourceChannel: input.source_channel,
        initiatorRole: input.initiator_role,
        isGuest: !input.actorUserId,
      },
      notifications: submitBells,
    });

    // Step 13 — post-submit side-effects: emails + workspace auto-ack.
    // Fired as a void async IIFE so it doesn't block the return value.
    // All wrapped in try/catch — failures must NEVER block the submission.
    void (async () => {
      try {
        // Look up agency auto-ack settings.
        const { data: agencyRow } = await supabase
          .from("agencies")
          .select("auto_ack_enabled, auto_ack_message")
          .eq("id", input.tenant_id)
          .maybeSingle();

        // a/b/c — client confirmation + coordinator notice + talent invites now
        // fan out through the notification engine, driven by the
        // INQUIRY_SUBMITTED engine event emitted above (the dispatcher listener
        // in inquiry-events.ts → catalog entries in lib/notifications/catalog.ts).
        // Nothing to do here — kept as a marker for where the legacy
        // sendInquirySubmittedNotifications() call used to live.

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
