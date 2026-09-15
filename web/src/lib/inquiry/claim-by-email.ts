/**
 * Later-claimed guest: after a person confirms the email they used as a
 * guest, write the rows submitInquiry would have written if they had been
 * signed in. Cookie merge only sets `inquiries.client_user_id`.
 */

import { logServerError } from "@/lib/server/safe-error";

type InquiryRow = {
  id: string;
  tenant_id: string;
  client_user_id: string | null;
  contact_email: string | null;
  origin_domain: string | null;
  source_workspace_id: string | null;
  current_offer_id: string | null;
};

export type ClaimByEmailAdmin = {
  // Tests inject a fake PostgREST builder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type ClaimByEmailResult = {
  claimed: number;
  linkedParticipants: number;
  linkedRelationships: number;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Exact ILIKE (no wildcard match). `%` / `_` in an address stay literal. */
function ilikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

export async function claimInquiriesByConfirmedEmail(input: {
  admin: ClaimByEmailAdmin;
  userId: string;
  verifiedEmail: string;
}): Promise<ClaimByEmailResult> {
  const empty: ClaimByEmailResult = { claimed: 0, linkedParticipants: 0, linkedRelationships: 0 };
  const email = normalizeEmail(input.verifiedEmail);
  if (!email || !input.userId) return empty;

  const { data: profile, error: profileError } = await input.admin
    .from("client_profiles")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (profileError) {
    logServerError("inquiry.claimByEmail.profile", profileError);
    return empty;
  }
  const clientProfileId = (profile?.id as string | undefined) ?? null;

  // Email predicate is on the query: PostgREST `max_rows` (1000) would
  // otherwise page away a matching guest row before JS could see it.
  const { data: inquiryRows, error: inquiryError } = await input.admin
    .from("inquiries")
    .select("id, tenant_id, client_user_id, contact_email, origin_domain, source_workspace_id, current_offer_id")
    .or(`client_user_id.is.null,client_user_id.eq.${input.userId}`)
    .ilike("contact_email", ilikeExact(email));
  if (inquiryError) {
    logServerError("inquiry.claimByEmail.inquiries", inquiryError);
    return empty;
  }

  const matches = ((inquiryRows ?? []) as InquiryRow[]).filter(
    (row) => normalizeEmail(row.contact_email ?? "") === email,
  );

  let claimed = 0;
  let linkedParticipants = 0;
  let linkedRelationships = 0;

  for (const row of matches) {
    const newlyClaimed = !row.client_user_id;
    if (newlyClaimed) {
      const { error: updateError } = await input.admin
        .from("inquiries")
        .update({ client_user_id: input.userId })
        .eq("id", row.id)
        .eq("tenant_id", row.tenant_id)
        .is("client_user_id", null);
      if (updateError) {
        logServerError("inquiry.claimByEmail.linkInquiry", updateError);
        continue;
      }
      claimed += 1;
    }

    const seated = await ensureClientParticipant(input.admin, {
      inquiryId: row.id,
      tenantId: row.tenant_id,
      userId: input.userId,
    });
    if (seated) linkedParticipants += 1;

    if (clientProfileId) {
      const related = await ensureClientRelationship(input.admin, {
        tenantId: row.tenant_id,
        clientProfileId,
        clientUserId: input.userId,
        inquiryId: row.id,
        originDomain: row.origin_domain,
        sourceWorkspaceId: row.source_workspace_id,
        touchActivity: newlyClaimed,
      });
      if (related) linkedRelationships += 1;
    }

    if (row.current_offer_id) {
      await ensurePendingClientApproval(input.admin, {
        inquiryId: row.id,
        tenantId: row.tenant_id,
        offerId: row.current_offer_id,
        userId: input.userId,
      });
    }
  }

  return { claimed, linkedParticipants, linkedRelationships };
}

async function ensureClientParticipant(
  admin: ClaimByEmailAdmin,
  args: { inquiryId: string; tenantId: string; userId: string },
): Promise<boolean> {
  const { data: existing, error: existingError } = await admin
    .from("inquiry_participants")
    .select("id, user_id")
    .eq("inquiry_id", args.inquiryId)
    .eq("tenant_id", args.tenantId)
    .eq("role", "client")
    .maybeSingle();
  if (existingError) {
    logServerError("inquiry.claimByEmail.participantFind", existingError);
    return false;
  }
  if (existing?.id) {
    const seatedUser = (existing.user_id as string | null) ?? null;
    if (seatedUser && seatedUser !== args.userId) return false;
    return true;
  }
  const { error: insertError } = await admin.from("inquiry_participants").insert({
    inquiry_id: args.inquiryId,
    tenant_id: args.tenantId,
    user_id: args.userId,
    role: "client",
    status: "active",
  });
  if (insertError) {
    logServerError("inquiry.claimByEmail.participantInsert", insertError);
    return false;
  }
  return true;
}

async function ensureClientRelationship(
  admin: ClaimByEmailAdmin,
  args: {
    tenantId: string;
    clientProfileId: string;
    clientUserId: string;
    inquiryId: string;
    originDomain: string | null;
    sourceWorkspaceId: string | null;
    /** False on a repair pass for an inquiry this user already owned. */
    touchActivity: boolean;
  },
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("agency_client_relationships")
    .select("id, first_inquiry_id")
    .eq("tenant_id", args.tenantId)
    .eq("client_profile_id", args.clientProfileId)
    .maybeSingle();
  if (existingError) {
    logServerError("inquiry.claimByEmail.relationshipFind", existingError);
    return false;
  }
  if (existing?.id) {
    if (!args.touchActivity) return true;
    const { error: updateError } = await admin
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
      logServerError("inquiry.claimByEmail.relationshipUpdate", updateError);
      return false;
    }
    return true;
  }
  const { error: insertError } = await admin.from("agency_client_relationships").insert({
    tenant_id: args.tenantId,
    client_profile_id: args.clientProfileId,
    source_type: "inquiry",
    status: "active",
    first_inquiry_id: args.inquiryId,
    added_by: args.clientUserId,
    last_interaction_at: now,
    source_workspace_id: args.sourceWorkspaceId ?? args.tenantId,
    origin_domain: args.originDomain,
  });
  if (insertError) {
    logServerError("inquiry.claimByEmail.relationshipInsert", insertError);
    return false;
  }
  return true;
}

async function ensurePendingClientApproval(
  admin: ClaimByEmailAdmin,
  args: { inquiryId: string; tenantId: string; offerId: string; userId: string },
): Promise<void> {
  const { data: part, error: partError } = await admin
    .from("inquiry_participants")
    .select("id")
    .eq("inquiry_id", args.inquiryId)
    .eq("tenant_id", args.tenantId)
    .eq("role", "client")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (partError) {
    logServerError("inquiry.claimByEmail.approvalParticipant", partError);
    return;
  }
  if (!part?.id) return;

  const { data: existing, error: existingError } = await admin
    .from("inquiry_approvals")
    .select("id")
    .eq("inquiry_id", args.inquiryId)
    .eq("tenant_id", args.tenantId)
    .eq("offer_id", args.offerId)
    .eq("participant_id", part.id)
    .maybeSingle();
  if (existingError) {
    logServerError("inquiry.claimByEmail.approvalFind", existingError);
    return;
  }
  if (existing?.id) return;

  const { error: insertError } = await admin.from("inquiry_approvals").insert({
    inquiry_id: args.inquiryId,
    tenant_id: args.tenantId,
    offer_id: args.offerId,
    participant_id: part.id,
    status: "pending",
  });
  if (insertError) {
    logServerError("inquiry.claimByEmail.approvalInsert", insertError);
  }
}
