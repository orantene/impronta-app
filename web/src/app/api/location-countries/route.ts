import { NextResponse } from "next/server";
import { searchCanonicalCountries } from "@/lib/location-autocomplete";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";

  try {
    const countries = await searchCanonicalCountries(query);
    return NextResponse.json({ countries });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[api/location-countries]", e);
    }
    return NextResponse.json({ countries: [] }, { status: 200 });
  }
}
