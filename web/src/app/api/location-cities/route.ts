import { NextResponse } from "next/server";
import {
  searchCanonicalCities,
  searchCuratedCitiesGlobal,
} from "@/lib/location-autocomplete";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const countryIso2 = searchParams.get("countryIso2") ?? "";
  const countryNameEn = searchParams.get("countryNameEn") ?? "";
  const countryNameEs = searchParams.get("countryNameEs") ?? "";

  // No country → single-input global curated search (the Location editor's
  // "type a city" autocomplete). Country-scoped path kept for callers that
  // still pass countryIso2 (e.g. CanonicalLocationFieldset).
  if (countryIso2.trim().length !== 2) {
    try {
      const cities = await searchCuratedCitiesGlobal(query);
      return NextResponse.json({ cities });
    } catch {
      return NextResponse.json({ cities: [] }, { status: 200 });
    }
  }

  try {
    const cities = await searchCanonicalCities({
      query,
      countryIso2,
      countryNameEn: countryNameEn.trim() || undefined,
      countryNameEs: countryNameEs.trim() || null,
    });
    return NextResponse.json({ cities });
  } catch {
    return NextResponse.json({ cities: [] }, { status: 200 });
  }
}
