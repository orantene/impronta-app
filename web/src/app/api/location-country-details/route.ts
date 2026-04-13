import { NextResponse } from "next/server";
import {
  fetchGooglePlaceDetailsForCountry,
  isGooglePlacesConfigured,
} from "@/lib/google-places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId") ?? "";

  if (!placeId.trim()) {
    return NextResponse.json({ ok: false as const, error: "bad_request" }, { status: 400 });
  }

  if (!isGooglePlacesConfigured()) {
    return NextResponse.json({ ok: false as const, error: "not_configured" }, { status: 503 });
  }

  const details = await fetchGooglePlaceDetailsForCountry(placeId.trim());

  if (!details) {
    return NextResponse.json(
      { ok: false as const, error: "not_found_or_invalid" },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true as const,
    iso2: details.countryIso2,
    name_en: details.countryNameEn,
    name_es: details.countryNameEs,
  });
}
