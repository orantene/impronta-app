import { ImageResponse } from "next/og";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

// D.2 — Agency-aware Open Graph image for the platform / agency homepage.
//
// When the request is on an agency host (impronta.tulala.digital,
// improntamodels.com, etc.), this renders a branded card with the
// agency name, primary brand color, and a "Discover N models" line.
// On the platform host (tulala.digital) it renders a Tulala-branded
// generic card. Falls back to a calm Tulala card if anything fails.

export const alt = "Tulala";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type AgencyOgData = {
  name: string;
  talentCount: number;
  accentColor: string;
  tagline: string | null;
};

async function loadAgencyOgData(): Promise<AgencyOgData | null> {
  try {
    const ctx = await getPublicHostContext();
    if (!ctx || ctx.kind !== "agency" || !ctx.tenantId) return null;

    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;

    const [identityRes, rosterRes] = await Promise.all([
      supabase
        .from("agency_business_identity")
        .select("public_name, tagline")
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle(),
      supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "active")
        .in("agency_visibility", ["site_visible", "featured"]),
    ]);

    const identity = identityRes.data as { public_name?: string | null; tagline?: string | null } | null;
    const talentCount = rosterRes.count ?? 0;
    const name = identity?.public_name?.trim() || "Tulala";

    return {
      name,
      talentCount,
      accentColor: "#0F4F3E",
      tagline: identity?.tagline?.trim() ?? null,
    };
  } catch {
    return null;
  }
}

export default async function Image() {
  const data = await loadAgencyOgData();
  const isAgency = data !== null;

  const surface = "#FAFAF7";
  const ink = "#0B0B0D";
  const muted = "rgba(11,11,13,0.55)";
  const accent = data?.accentColor ?? "#0F4F3E";
  const title = data?.name ?? "Tulala";
  const subtitle = isAgency && data
    ? data.talentCount > 0
      ? `Discover ${data.talentCount} ${data.talentCount === 1 ? "talent" : "talent"} on ${data.name}`
      : `Send an inquiry to ${data.name}`
    : "The booking platform for premium talent agencies";
  const kicker = isAgency ? "AGENCY" : "TULALA";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: surface,
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* Accent stripe */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 8,
            height: "100%",
            background: accent,
          }}
        />

        {/* Kicker */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.32em",
            color: accent,
            textTransform: "uppercase",
            marginBottom: 32,
            display: "flex",
          }}
        >
          {kicker}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: ink,
            lineHeight: 1.05,
            marginBottom: 28,
            display: "flex",
            maxWidth: 1040,
          }}
        >
          {title}
        </div>

        {/* Subtitle / tagline */}
        <div
          style={{
            fontSize: 32,
            color: muted,
            lineHeight: 1.4,
            display: "flex",
            maxWidth: 980,
          }}
        >
          {data?.tagline ?? subtitle}
        </div>

        {/* Footer rail */}
        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            color: muted,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <span>Powered by Tulala</span>
          <span>tulala.digital</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
