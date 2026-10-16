/**
 * Branded 404 page for unregistered hosts.
 *
 * Rendered by the middleware when a request arrives from a hostname that is
 * not present in the `public.agency_domains` table. This page lives outside
 * every tenant-aware route group so it renders safely without a host context.
 *
 * The middleware rewrites to `/_host-unregistered` and sets the response
 * status to 404 — this page component renders the HTML body.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { hostUnregisteredCopy } from "@/lib/saas/host-unregistered-copy";

async function copyForRequest() {
  const h = await headers();
  return hostUnregisteredCopy(h.get("accept-language"), h.get("x-vercel-ip-country"));
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await copyForRequest()).tabTitle, robots: { index: false, follow: false } };
}

export default async function HostUnregisteredPage() {
  const copy = await copyForRequest();
  return (
    <div
      style={{
        minHeight: "100dvh",
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
            color: "rgba(11,11,13,0.6)",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Tulala
        </p>
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 26,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {copy.heading}
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
          {copy.bodyBefore}
          <a
            href={resolveMarketingOrigin()}
            style={{
              color: "#0F4F3E",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            tulala.digital
          </a>
          .
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 24,
          }}
        >
          <a
            href={resolveMarketingOrigin()}
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
            {copy.cta}
          </a>
        </div>
      </div>
    </div>
  );
}
