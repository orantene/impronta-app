"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { resolveExclusivityForRosterAdd } from "@/lib/agency/exclusivity-resolver";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";

// Non-exported on purpose — a "use server" file may only *export* async
// functions. The drawer consumes this shape via return-type inference.
type InviteRosterTalentResult =
  | { ok: true; talentProfileId: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite a talent onto a workspace's roster by email.
 *
 * Creates a real `invited`-state roster profile (mirrors the proven
 * `createRosterTalent` insert path), server-side seat-limit enforced, and
 * fires a graceful invite email. The invitee later claims the profile via
 * the existing signup flow that matches `talent_profiles.invitation_email`.
 *
 * `tenantSlug` is passed explicitly (not resolved from cookie scope) so the
 * invite always lands on the workspace whose roster page the admin is on —
 * the same discipline every loader in the admin layout follows.
 *
 * Tenant-scoped table access goes through `tenantScopedQuery`. The
 * `talent_profiles` (global identity table) and `agencies` (the tenant
 * table itself) reads/writes have no `tenant_id` column, so the helper
 * cannot apply — those raw `.from()` calls are justified inline.
 */
export async function inviteRosterTalent(
  tenantSlug: string,
  rawName: string,
  rawEmail: string,
): Promise<InviteRosterTalentResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Not authenticated." };

    const scope = await getTenantScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Workspace not found." };

    const canEdit = await userHasCapability(
      "agency.roster.edit",
      scope.tenantId,
    );
    if (!canEdit) {
      return { ok: false, error: "You don't have permission to invite talent." };
    }

    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    const name = rawName.trim();
    const displayName = name || email.split("@")[0] || "Invited talent";

    const admin = createServiceRoleClient();
    if (!admin) {
      return {
        ok: false,
        error: "Server configuration error (service role key missing).",
      };
    }

    // ── Seat-limit check — server-side enforcement (not just the UI) ────────
    const seats = await checkRosterSeatAvailability(admin, scope.tenantId, 1);
    if (!seats.ok) return { ok: false, error: seats.message };

    // ── Dedup — already on THIS tenant's roster with that email? ───────────
    // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is a global identity table with no tenant_id column
    const { data: matchedProfiles } = await admin
      .from("talent_profiles")
      .select("id")
      .ilike("invitation_email", email);
    const matchedIds = (matchedProfiles ?? []).map(
      (r) => (r as { id: string }).id,
    );
    if (matchedIds.length > 0) {
      const { data: existing } = await tenantScopedQuery(
        admin,
        "agency_talent_roster",
        scope.tenantId,
      )
        .select("id")
        .neq("status", "removed")
        .in("talent_profile_id", matchedIds)
        .limit(1);
      if (existing && existing.length > 0) {
        return {
          ok: false,
          error: "Someone with that email is already on your roster.",
        };
      }
    }

    // ── Allocate profile code ──────────────────────────────────────────────
    const { data: codeRow, error: codeErr } = await admin.rpc(
      "generate_profile_code",
    );
    if (codeErr || !codeRow) {
      logServerError("roster-invite/code", codeErr);
      return { ok: false, error: "Could not allocate a profile code. Try again." };
    }

    // ── Insert talent_profiles (invited) ───────────────────────────────────
    // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is a global identity table with no tenant_id column
    const { data: inserted, error: insertErr } = await admin
      .from("talent_profiles")
      .insert({
        profile_code: String(codeRow),
        display_name: displayName,
        invitation_email: email,
        workflow_status: "invited",
        visibility: "hidden",
        membership_tier: "free",
        membership_status: "active",
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      logServerError("roster-invite/insert", insertErr);
      return { ok: false, error: "Could not create the invite. Try again." };
    }
    const talentProfileId = (inserted as { id: string }).id;
    const originDomain = (await headers()).get("host")?.toLowerCase() ?? null;

    // ── Insert agency_talent_roster — tenant-scoped (helper forces tenant_id) ─
    // Exclusivity from the resolver, never the column defaults — see the note
    // in admin/roster/new/actions.ts.
    const exclusivity = await resolveExclusivityForRosterAdd(
      admin,
      scope.tenantId,
      talentProfileId,
    );

    const { error: rosterErr } = await tenantScopedQuery(
      admin,
      "agency_talent_roster",
      scope.tenantId,
    ).insert({
      source_workspace_id: scope.tenantId,
      origin_domain: originDomain,
      talent_profile_id: talentProfileId,
      source_type: "agency_created",
      status: "active",
      agency_visibility: "roster_only",
      added_by: session.user.id,
      is_primary: exclusivity.shouldBeExclusive,
      exclusivity_status: exclusivity.exclusivityStatus,
      exclusivity_auto_assigned_at: exclusivity.autoAssignedAt,
    });
    if (rosterErr) {
      logServerError("roster-invite/roster", rosterErr);
      // Roll back the orphaned profile so a retry is clean.
      // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles has no tenant_id; rollback delete by primary key
      await admin.from("talent_profiles").delete().eq("id", talentProfileId);
      return {
        ok: false,
        error: "Could not add the invite to your roster. Try again.",
      };
    }

    // ── Claim invite — routed through the notification dispatcher.
    // Fire-and-forget; the dispatcher renders the branded ClaimInvite email
    // to an email-only (guest) recipient and no-ops without RESEND_API_KEY.
    // `tenantId` carries the workspace brand so the email + link render on
    // the agency's host. This roster-add path has no claim token, so the
    // talent redeems by signing up at /get-started with this email.
    void (async () => {
      try {
        const { dispatchEventNotifications } = await import(
          "@/lib/notifications/dispatcher"
        );
        // agencies is the tenant table itself (PK = id, no tenant_id column).
        // eslint-disable-next-line ratchet/no-untenanted-from -- agencies is the tenant table; looked up by its primary key
        const { data: agencyRow } = await admin
          .from("agencies")
          .select("display_name")
          .eq("id", scope.tenantId)
          .maybeSingle();
        const workspaceName =
          (agencyRow as { display_name?: string | null } | null)?.display_name?.trim() ||
          "a workspace";
        await dispatchEventNotifications({
          type: "roster.claim_invite_requested",
          tenantId: scope.tenantId,
          eventId: `roster-claim:${talentProfileId}`,
          payload: {
            inviteeEmail: email,
            inviteeName: displayName,
            workspaceName,
            redeemPath: "/get-started",
          },
        });
      } catch (err) {
        logServerError("roster-invite/email", err);
      }
    })();

    scheduleWorkspaceAudit({
      tenantId: scope.tenantId,
      category: "roster",
      action: "roster.talent.invited",
      summary: `Invited ${email} to the roster`,
      targetType: "talent_profile",
      targetId: talentProfileId,
      targetLabel: displayName,
    });

    // The workspace roster is loaded in the admin *layout* (a single
    // Promise.all prefetch), so a page-scoped revalidate would not refresh
    // it. Revalidate at layout scope so the new Invited talent appears on
    // the roster without a manual reload — the scope inviteTeamMember uses.
    revalidatePath("/", "layout");
    return { ok: true, talentProfileId };
  } catch (err) {
    logServerError("roster-invite/unexpected", err);
    return { ok: false, error: "Unexpected error. Try again." };
  }
}
