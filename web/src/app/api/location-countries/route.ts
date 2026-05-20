import { improntaLog } from "@/lib/server/structured-log";
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
      void improntaLog("location_countries.warn", {
        message: "[api/location-countries]",
        error: String(e),
      });
    }
    return NextResponse.json({ countries: [] }, { status: 200 });
  }
}
