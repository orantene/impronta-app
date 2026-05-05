"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug, getPublicHostContext } from "@/lib/saas/scope";
import { assertAllTalentOnTenantRoster } from "@/lib/saas/talent-roster";
import { submitInquiry } from "@/lib/inquiry/inquiry-engine";
import { loadClientTrustState } from "@/lib/client-trust/evaluator";
import { logServerError } from "@/lib/server/safe-error";
import { loadClientSelfProfile } from "../../../_data-bridge";

function returnToNewInquiry(
  tenantSlug: string,
  params: URLSearchParams,
): never {
  redirect(`/${tenantSlug}/client/inquiries/new?${params.toString()}`);
}

export async function createClientWorkspaceInquiryAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const talentProfileId = String(formData.get("talentProfileId") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  const eventLocation = String(formData.get("eventLocation") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!tenantSlug) redirect("/login");
  if (!contactName || !message) {
    returnToNewInquiry(
      tenantSlug,
      new URLSearchParams({
        err: "Contact name and message are required.",
        ...(talentProfileId ? { talent: talentProfileId } : {}),
      }),
    );
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    returnToNewInquiry(tenantSlug, new URLSearchParams({ err: "Workspace not found." }));
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    returnToNewInquiry(tenantSlug, new URLSearchParams({ err: "Database unavailable." }));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/${tenantSlug}/client/inquiries/new`);
  }

  const client = await loadClientSelfProfile(user.id, scope.tenantId);
  if (!client) {
    returnToNewInquiry(
      tenantSlug,
      new URLSearchParams({ err: "Client profile not found in this workspace." }),
    );
  }
  if (!user.email) {
    returnToNewInquiry(
      tenantSlug,
      new URLSearchParams({ err: "Your account needs an email before sending an inquiry." }),
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    returnToNewInquiry(tenantSlug, new URLSearchParams({ err: "Database unavailable." }));
  }

  const talentIds = talentProfileId ? [talentProfileId] : [];
  const rosterCheck = await assertAllTalentOnTenantRoster(admin, scope.tenantId, talentIds);
  if (!rosterCheck.ok) {
    returnToNewInquiry(
      tenantSlug,
      new URLSearchParams({ err: "Selected talent is not available in this workspace." }),
    );
  }

  const quantityValue = Number.parseInt(quantityRaw, 10);
  const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : null;
  const [hostCtx, trustState] = await Promise.all([
    getPublicHostContext(),
    loadClientTrustState(user.id, scope.tenantId),
  ]);
  const originDomain = hostCtx.hostname ?? null;

  const result = await submitInquiry(admin, {
    tenant_id: scope.tenantId,
    contact_name: contactName,
    contact_email: user.email,
    contact_phone: null,
    company: company || client.company || null,
    event_date: eventDate || null,
    event_location: eventLocation || null,
    quantity,
    message,
    event_type_id: null,
    raw_ai_query: message,
    interpreted_query: talentProfileId ? { selectedTalentId: talentProfileId } : null,
    source_page: `/${tenantSlug}/client/inquiries/new`,
    source_channel: "directory_client",
    origin_domain: originDomain,
    source_workspace_id: scope.tenantId,
    trust_level_at_submission: trustState?.trustLevel ?? "basic",
    client_user_id: user.id,
    talent_profile_ids: talentIds,
    actorUserId: user.id,
  });

  if (!result.success || !result.data?.inquiryId) {
    logServerError("client.inquiries.create", new Error(JSON.stringify(result)));
    returnToNewInquiry(
      tenantSlug,
      new URLSearchParams({
        err: "Could not create inquiry.",
        ...(talentProfileId ? { talent: talentProfileId } : {}),
      }),
    );
  }
  const inquiryId = result.data.inquiryId;

  const now = new Date().toISOString();
  const { error: relationshipErr } = await admin
    .from("agency_client_relationships")
    .upsert(
      {
        tenant_id: scope.tenantId,
        client_profile_id: client.id,
        source_type: "inquiry",
        status: "active",
        first_inquiry_id: inquiryId,
        last_interaction_at: now,
        source_workspace_id: scope.tenantId,
        origin_domain: originDomain,
      },
      { onConflict: "tenant_id,client_profile_id" },
    );
  if (relationshipErr) {
    logServerError("client.inquiries.relationshipUpsert", relationshipErr);
  }

  revalidatePath(`/${tenantSlug}/client/inquiries`);
  revalidatePath(`/${tenantSlug}/client/today`);
  redirect(`/${tenantSlug}/client/inquiries/${inquiryId}`);
}
