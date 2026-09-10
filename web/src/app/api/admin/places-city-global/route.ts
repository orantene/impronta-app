import { NextResponse } from "next/server";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import { fetchGoogleGlobalCityPredictions, isGooglePlacesConfigured } from "@/lib/google-places";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { tryConsumeRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ predictions: [], configured: isGooglePlacesConfigured() });
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Staff AND talent: this is the city picker behind "Current location" in
  // the profile drawer, and a talent editing their own profile hit 403 here,
  // which the input swallows, so "Tel Aviv" showed no suggestions at all
  // (owner QA 2026-09-10, first real signup). Clients have no city field.
  const profile = await loadAccessProfile(supabase, user.id);
  const role = profile?.app_role;
  if (!isStaffRole(role) && role !== "talent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Each call is a paid Places request; keep one person from hammering it.
  if (!tryConsumeRateLimit(`places-city-global:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!isGooglePlacesConfigured()) {
    return NextResponse.json({ predictions: [], configured: false });
  }

  try {
    const predictions = await fetchGoogleGlobalCityPredictions(q);
    return NextResponse.json({ predictions, configured: true });
  } catch (err) {
    logServerError("api.places-city-global.GET", err);
    return NextResponse.json({ predictions: [], configured: true });
  }
}
