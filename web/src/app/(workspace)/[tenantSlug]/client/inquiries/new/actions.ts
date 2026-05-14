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

export type ClientWorkspaceInquiryFormValues = {
  contactName: string;
  company: string;
  talentProfileId: string;
  eventDate: string;
  quantity: string;
  eventLocation: string;
  message: string;
};

// TODO A.4: convert to `ServerActionResult<T>`. `useFormState` shape for the
// "new client inquiry" form — carries `values` for re-rendering the form
// alongside `error`. Conversion requires moving `values` into a `data` /
// `restore` payload and updating the form binding. Out of scope for the
// initial sweep.
export type ClientWorkspaceInquiryActionState = {
  error?: string;
  values: ClientWorkspaceInquiryFormValues;
};

function valuesFromFormData(formData: FormData): ClientWorkspaceInquiryFormValues {
  // Accept both camelCase (legacy direct form) and snake_case (shared
  // InquiryCartFormFields component) field names.  The helper prefers the
  // camelCase key and falls back to the snake_case variant so both surfaces
  // route through this action without separate adapters.
  function get(camel: string, snake: string): string {
    const v = formData.get(camel) ?? formData.get(snake);
    return String(v ?? "").trim();
  }
  // talent: legacy sends talentProfileId; shared fields send talent_ids (CSV)
  const talentProfileIdLegacy = get("talentProfileId", "talentProfileId");
  const talentProfileId =
    talentProfileIdLegacy ||
    (String(formData.get("talent_ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] ??
      "");
  return {
    contactName: get("contactName", "contact_name"),
    company: get("company", "company"),
    talentProfileId,
    eventDate: get("eventDate", "event_date"),
    quantity: get("quantity", "quantity"),
    eventLocation: get("eventLocation", "event_location"),
    message: get("message", "message"),
  };
}

function errorState(
  error: string,
  values: ClientWorkspaceInquiryFormValues,
): ClientWorkspaceInquiryActionState {
  return { error, values };
}

function clientInquiryPath(tenantSlug: string, talentProfileId: string): string {
  const params = new URLSearchParams();
  if (talentProfileId) params.set("talent", talentProfileId);
  const query = params.toString();
  return `/${tenantSlug}/client/inquiries/new${query ? `?${query}` : ""}`;
}

export async function createClientWorkspaceInquiryAction(
  _prevState: ClientWorkspaceInquiryActionState,
  formData: FormData,
): Promise<ClientWorkspaceInquiryActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const values = valuesFromFormData(formData);
  const {
    talentProfileId,
    contactName,
    company,
    eventDate,
    eventLocation,
    quantity: quantityRaw,
    message,
  } = values;

  if (!tenantSlug) redirect("/login");
  if (!contactName || !message) {
    return errorState("Contact name and message are required.", values);
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return errorState("Workspace not found.", values);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return errorState("Database unavailable.", values);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(clientInquiryPath(tenantSlug, talentProfileId))}`);
  }

  const client = await loadClientSelfProfile(user.id, scope.tenantId);
  if (!client) {
    return errorState("Client profile not found in this workspace.", values);
  }
  if (!user.email) {
    return errorState("Your account needs an email before sending an inquiry.", values);
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return errorState("Database unavailable.", values);
  }

  const talentIds = talentProfileId ? [talentProfileId] : [];
  const rosterCheck = await assertAllTalentOnTenantRoster(admin, scope.tenantId, talentIds);
  if (!rosterCheck.ok) {
    return errorState("Selected talent is not available in this workspace.", values);
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
    // Universal-connector P0 — direction of initiation (client on a
    // workspace dashboard form).
    initiator_role: "client",
    initiator_user_id: user.id,
  });

  if (!result.success || !result.data?.inquiryId) {
    logServerError("client.inquiries.create", new Error(JSON.stringify(result)));
    return errorState("Could not create inquiry.", values);
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
