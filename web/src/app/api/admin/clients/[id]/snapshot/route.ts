import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
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

  const [profileRes, clientProfileRes] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", id).maybeSingle(),
    supabase.from("client_profiles").select("company_name, phone").eq("user_id", id).maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) {
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
