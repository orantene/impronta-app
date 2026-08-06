import { NextResponse } from "next/server";

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * F.1 — Team-invite redemption route.
 *
 * Flow:
 *   1. Look up the team_invite_tokens row by id. Must be non-revoked,
 *      non-redeemed, non-expired.
 *   2. Resolve the agency slug so we can land the invitee on the right
 *      workspace route.
 *   3. If no session → redirect to /register?next=/team-invite/[id]&email=<>
 *      Pre-fills the email field with the invited address. After signup
 *      the user bounces back here and step 1 fires again.
 *   4. If signed in but the email doesn't match → show a polite error.
 *      We don't want one user redeeming another user's invite.
 *   5. If signed in + email matches → create agency_memberships row with
 *      the target role + status=active, mark token redeemed, redirect to
 *      the workspace admin home.
 */

type InviteRow = {
  id: string;
  tenant_id: string;
  invited_email: string;
  target_role: string;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { origin } = new URL(request.url);

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.redirect(`${origin}/?team_invite=config`);

  const { data: invite, error: inviteErr } = await admin
    .from("team_invite_tokens")
    .select("id, tenant_id, invited_email, target_role, expires_at, redeemed_at, revoked_at")
    .eq("id", id)
    .maybeSingle();

  if (inviteErr || !invite) {
    return NextResponse.redirect(`${origin}/?team_invite=invalid`);
  }

  const row = invite as InviteRow;
  if (row.redeemed_at) return NextResponse.redirect(`${origin}/?team_invite=already_redeemed`);
  if (row.revoked_at) return NextResponse.redirect(`${origin}/?team_invite=revoked`);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${origin}/?team_invite=expired`);
  }

  // Look up the agency slug for the redirect target.
  const { data: agencyRow } = await admin
    .from("agencies")
    .select("slug")
    .eq("id", row.tenant_id)
    .maybeSingle();
  const slug = (agencyRow as { slug?: string | null } | null)?.slug ?? "";

  const session = await getCachedActorSession();
  const sessionEmail = session.user?.email?.toLowerCase() ?? null;

  // Not signed in — bounce through register pre-filling the email.
  if (!session.user) {
    const nextPath = encodeURIComponent(`/team-invite/${id}`);
    const emailParam = encodeURIComponent(row.invited_email);
    return NextResponse.redirect(`${origin}/register?next=${nextPath}&email=${emailParam}`);
  }

  // Email mismatch — block redemption (this protects against link sharing).
  if (sessionEmail !== row.invited_email.toLowerCase()) {
    return NextResponse.redirect(`${origin}/?team_invite=email_mismatch`);
  }

  // Create the membership row + mark token redeemed in a single transaction-ish flow.
  try {
    // Avoid duplicate membership rows: check for existing.
    const { data: existing } = await admin
      .from("agency_memberships")
      .select("id, status")
      .eq("tenant_id", row.tenant_id)
      .eq("profile_id", session.user.id)
      .in("status", ["active", "invited", "pending_acceptance", "suspended"])
      .maybeSingle();

    if (existing) {
      // Promote to the target role if downgraded; otherwise leave as-is.
      await admin
        .from("agency_memberships")
        .update({ role: row.target_role, status: "active", accepted_at: new Date().toISOString() })
        .eq("id", (existing as { id: string }).id);
    } else {
      await admin.from("agency_memberships").insert({
        tenant_id: row.tenant_id,
        profile_id: session.user.id,
        role: row.target_role,
        status: "active",
        accepted_at: new Date().toISOString(),
      });
    }

    await admin
      .from("team_invite_tokens")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: session.user.id,
      })
      .eq("id", row.id);

    scheduleWorkspaceAudit({
      tenantId: row.tenant_id,
      category: "team",
      action: "team.invite.accepted",
      summary: `${row.invited_email} accepted a team invite as ${row.target_role}`,
      targetType: "invite",
      targetId: row.id,
      targetLabel: row.invited_email,
      metadata: { role: row.target_role },
    });

    const landing = slug ? `/${slug}/admin` : "/";
    return NextResponse.redirect(`${origin}${landing}?team_invite=redeemed`);
  } catch (err) {
    logServerError("team-invite.redeem", err);
    return NextResponse.redirect(`${origin}/?team_invite=error`);
  }
}
