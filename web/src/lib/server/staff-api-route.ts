import { NextResponse } from "next/server";
import { isStaffRole } from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type StaffApiOk = { supabase: SupabaseClient; user: User };

export async function requireStaffApi(): Promise<
  StaffApiOk | { error: NextResponse }
> {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Unavailable" }, { status: 503 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const profile = await loadAccessProfile(supabase, user.id);
  if (!isStaffRole(profile?.app_role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user };
}
