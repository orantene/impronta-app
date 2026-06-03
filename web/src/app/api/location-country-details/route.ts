import { NextResponse } from "next/server";
import { fetchGooglePlaceDetailsForCountry } from "@/lib/google-places";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { resolveGoogleMapsKey } from "@/lib/integrations/resolve";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId") ?? "";

  if (!placeId.trim()) {
    return NextResponse.json({ ok: false as const, error: "bad_request" }, { status: 400 });
  }

  // Tenant-aware Places key: tenant's own Google Maps key (when set) else the
  // platform env key. On platform root the scope is null → platform key.
  const scope = await getPublicTenantScope();
  const apiKey = await resolveGoogleMapsKey(scope?.tenantId ?? null);

  if (!apiKey) {
    return NextResponse.json({ ok: false as const, error: "not_configured" }, { status: 503 });
  }

  const details = await fetchGooglePlaceDetailsForCountry(placeId.trim(), {
    apiKeyOverride: apiKey,
  });

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
