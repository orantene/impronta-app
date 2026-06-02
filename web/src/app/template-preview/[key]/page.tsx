import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { TalentSiteRenderer } from "@/components/talent/site/TalentSiteRenderer";
import { ChefTemplate } from "@/components/talent/site/bespoke/ChefTemplate";
import { SingerTemplate } from "@/components/talent/site/bespoke/SingerTemplate";
import { PhotographerTemplate } from "@/components/talent/site/bespoke/PhotographerTemplate";
import {
  HybridTemplate,
  HYBRID_CHEF_MASSAGE,
  HYBRID_SINGER_MASSAGE,
} from "@/components/talent/site/bespoke/HybridTemplate";
import { hasBespokeTemplate } from "@/components/talent/site/bespoke";
import { resolveDemoContext } from "@/lib/talent-site/templates/demo-assets";
import {
  buildTemplateSnapshot,
  getTemplateDef,
  type TalentSiteTemplateKey,
} from "@/lib/talent-site/templates/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const def = getTemplateDef(key);
  return {
    title: def ? `${def.label} — template preview` : "Template preview",
    robots: { index: false, follow: false },
  };
}

/**
 * Public, no-auth full-page preview of a talent site template rendered with a
 * demo persona + curated imagery. Opened from the template gallery's eye icon.
 * Renders the exact section components the live site uses, so what a talent
 * sees is what they get.
 */
export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  // Bespoke, hand-built premium templates render full-bleed (no section renderer).
  if (hasBespokeTemplate(key)) {
    if (key === "chef") return <ChefTemplate />;
    if (key === "singer") return <SingerTemplate />;
    if (key === "photographer") return <PhotographerTemplate />;
    if (key === "hybrid-singer-massage") return <HybridTemplate content={HYBRID_SINGER_MASSAGE} />;
    if (key === "hybrid-chef-massage") return <HybridTemplate content={HYBRID_CHEF_MASSAGE} />;
  }

  const def = getTemplateDef(key);
  if (!def) notFound();

  const h = await headers();
  const host = h.get("host") ?? "tulala.digital";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const ctx = resolveDemoContext(key, origin);
  const snapshot = buildTemplateSnapshot(key as TalentSiteTemplateKey, ctx, {
    pageVersion: 1,
  });

  return (
    <div data-talent-template-preview="">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "7px 16px",
          background: "#111612",
          color: "rgba(241,237,227,0.82)",
          fontSize: 11.5,
          letterSpacing: 0.4,
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
          {def.label}
        </span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>Template preview — sample content, your real profile fills in when you apply it</span>
      </div>
      <main>
        <TalentSiteRenderer snapshot={snapshot} locale="en" />
      </main>
    </div>
  );
}
