import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { getTenantScope } from "@/lib/saas/scope";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await loadAccessProfile(supabase, user.id);
  if (!isStaffRole(access?.app_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Tenant-scope the lookup. profiles/client_profiles have no tenant_id column and
  // their RLS permits any agency_staff globally (the is_agency_staff() footgun), so
  // without this a staffer of one tenant could read ANY user's name/email/phone/
  // company by id. Require the client to be related to THIS caller's tenant.
  const scope = await getTenantScope();
  if (!scope) {
    return NextResponse.json({ error: "No tenant scope" }, { status: 403 });
  }

  const [profileRes, clientProfileRes] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", id).maybeSingle(),
    supabase.from("client_profiles").select("id, company_name, phone").eq("user_id", id).maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cross-tenant guard: the client must have a relationship row with this tenant.
  // agency_client_relationships.client_profile_id → client_profiles.id; its RLS is
  // is_staff_of_tenant-scoped and the explicit tenant_id filter double-guards it.
  const clientProfileId = (clientProfileRes.data as { id?: string } | null)?.id ?? null;
  let relatedToTenant = false;
  if (clientProfileId) {
    const relRes = await supabase
      .from("agency_client_relationships")
      .select("id")
      .eq("tenant_id", scope.tenantId)
      .eq("client_profile_id", clientProfileId)
      .maybeSingle();
    relatedToTenant = !!relRes.data;
  }
  if (!relatedToTenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  let email: string | null = null;
  if (admin) {
    const authRes = await admin.auth.admin.getUserById(id);
    email = authRes.data.user?.email?.trim().toLowerCase() ?? null;
  }

  return NextResponse.json({
    id,
    displayName: profileRes.data.display_name ?? null,
    email,
    phone: clientProfileRes.data?.phone ?? null,
    company: clientProfileRes.data?.company_name ?? null,
  });
}
