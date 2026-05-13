import Link from "next/link";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

// E.2 — Branded 404 page (server component).
//
// When the request is on an agency host we render the agency's brand
// instead of generic Tulala chrome. Otherwise we render the canonical
// Tulala fallback. Both surfaces stay calm — no scary stack chrome.

export const dynamic = "force-dynamic";

type AgencyBrand = {
  name: string;
  homeHref: string;
};

async function loadAgencyBrand(): Promise<AgencyBrand | null> {
  try {
    const ctx = await getPublicHostContext();
    if (!ctx || ctx.kind !== "agency" || !ctx.tenantId) return null;

    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from("agency_business_identity")
      .select("public_name")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    const name = (data as { public_name?: string | null } | null)?.public_name?.trim();
    return {
      name: name && name.length > 0 ? name : "Studio",
      homeHref: "/",
    };
  } catch {
    return null;
  }
}

export default async function NotFound() {
  const brand = await loadAgencyBrand();
  const isAgency = brand !== null;
  const eyebrow = isAgency && brand ? brand.name.toUpperCase() : "TULALA";
  const heading = isAgency && brand
    ? "This page is no longer here"
    : "Page not found";
  const body = isAgency && brand
    ? `We couldn't find that page on ${brand.name}. The roster, news, or campaign you were looking for may have moved.`
    : "We couldn't find the page you're looking for.";
  const primaryCta = isAgency
    ? { label: "Back to homepage", href: "/" }
    : { label: "Go home", href: "/" };
  const secondaryCta = isAgency
    ? { label: "Send an inquiry", href: "/client/inquiries/new" }
    : { label: "Sign in", href: "/login" };

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#FAFAF7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          border: "1px solid rgba(24,24,27,0.10)",
          borderRadius: 16,
          padding: "32px 32px",
        }}
      >
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(11,11,13,0.38)",
            letterSpacing: 0.8,
            textTransform: "uppercase" as const,
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.60)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {body}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 10,
            marginTop: 24,
          }}
        >
          <Link
            href={primaryCta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#0F4F3E",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {primaryCta.label}
          </Link>
          <Link
            href={secondaryCta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              border: "1px solid rgba(24,24,27,0.12)",
              background: "transparent",
              color: "#0B0B0D",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            {secondaryCta.label}
          </Link>
        </div>

        {isAgency ? (
          <p
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 11.5,
              color: "rgba(11,11,13,0.42)",
              marginTop: 24,
              marginBottom: 0,
            }}
          >
            Powered by Tulala
          </p>
        ) : null}
      </div>
    </div>
  );
}
