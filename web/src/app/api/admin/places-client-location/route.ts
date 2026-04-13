import { NextResponse } from "next/server";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import {
  fetchGoogleClientLocationPredictions,
  isGooglePlacesConfigured,
} from "@/lib/google-places";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ predictions: [], configured: isGooglePlacesConfigured() });
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
    return NextResponse.json({ predictions: [], configured: false });
  }

  try {
    const predictions = await fetchGoogleClientLocationPredictions(q);
    return NextResponse.json({ predictions, configured: true });
  } catch {
    return NextResponse.json({ predictions: [], configured: true });
  }
}
