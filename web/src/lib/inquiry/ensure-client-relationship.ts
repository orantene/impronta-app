import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { inquiryWriteClient } from "./inquiry-engine.helpers";
import { logServerError } from "@/lib/server/safe-error";

export async function ensureClientRelationshipForInquiry(
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
