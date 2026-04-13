import { NextResponse } from "next/server";
import { fetchGooglePlaceDetailsForCity, isGooglePlacesConfigured } from "@/lib/google-places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId") ?? "";
  const countryIso2 = searchParams.get("countryIso2") ?? "";

  if (!placeId.trim() || countryIso2.trim().length !== 2) {
    return NextResponse.json({ ok: false as const, error: "bad_request" }, { status: 400 });
  }

  if (!isGooglePlacesConfigured()) {
    return NextResponse.json({ ok: false as const, error: "not_configured" }, { status: 503 });
  }

  const details = await fetchGooglePlaceDetailsForCity(placeId.trim(), {
    expectedCountryIso2: countryIso2.trim().toUpperCase(),
  });

  if (!details) {
    return NextResponse.json(
      { ok: false as const, error: "not_found_or_mismatch" },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true as const,
    city_name_en: details.cityNameEn,
    city_slug: details.citySlug,
    city_name_es: details.cityNameEs,
    lat: details.lat,
    lng: details.lng,
    country_iso2: details.countryIso2,
    country_name_en: details.countryNameEn,
    country_name_es: details.countryNameEs,
  });
}
