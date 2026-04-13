import { NextResponse } from "next/server";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import {
  fetchGooglePlaceDetailsForClientLocation,
  isGooglePlacesConfigured,
} from "@/lib/google-places";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";
  if (!placeId) {
    return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
  }

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

  const profile = await loadAccessProfile(supabase, user.id);
  if (!isStaffRole(profile?.app_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isGooglePlacesConfigured()) {
    return NextResponse.json({ details: null, configured: false });
  }

  try {
    const details = await fetchGooglePlaceDetailsForClientLocation(placeId);
    return NextResponse.json({ details, configured: true });
  } catch {
    return NextResponse.json({ details: null, configured: true });
  }
}
