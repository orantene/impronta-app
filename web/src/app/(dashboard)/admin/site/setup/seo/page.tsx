import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import { requireStaff } from "@/lib/server/action-guards";

export const dynamic = "force-dynamic";

/**
 * /admin/site/setup/seo — SEO defaults setup surface.
 *
 * Per-page SEO overrides + a dedicated default form are still being built.
 * For now this page reroutes the operator to the surfaces that already
 * carry the relevant fields: Identity (default meta + social card) and
 * each page's own Edit form (per-page overrides).
 *
 * Once a real `seo_defaults` table lands, this page swaps the link cards
 * for an inline form without changing the chrome.
 */
export default async function SiteSetupSeoPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  return (
    <SetupPage
      eyebrow="SETUP · STEP 6"
      title="SEO & defaults"
      icon={Search}
      description={
        <>
          Default search-engine title, description, and social-card meta
          power every page that hasn&rsquo;t set its own override. Per-page
          overrides happen on each page&rsquo;s own edit form. A unified
          defaults form is on the roadmap.
        </>
      }
      backHref="/admin/site/setup"
      backLabel="Back to Setup"
    >
      <SetupSection
        label="Where these settings live today"
        helper="Until the unified defaults form lands"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <RouteCard
            icon={Search}
            title="Identity"
            description="Default meta title, description, and social-card image. Applies platform-wide."
            href="/admin/site-settings/identity"
          />
          <RouteCard
            icon={Search}
            title="Per-page overrides"
            description="Each CMS page has its own SEO meta fields on the page editor."
            href="/admin/site/setup/pages"
          />
        </div>
      </SetupSection>

      <SetupSection label="Coming soon">
        <div className="rounded-2xl border border-dashed border-[rgba(20,20,24,0.16)] bg-white px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-foreground">
            A unified SEO defaults form
          </p>
          <p className="mt-2 max-w-[480px] mx-auto text-[12.5px] leading-[1.5] text-muted-foreground">
            Default meta template, sitemap rules, robots overrides, and a
            redirects table — all on this page. Until then, Identity covers
            the defaults and each page covers its own overrides.
          </p>
        </div>
      </SetupSection>
    </SetupPage>
  );
}

function RouteCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-[14px] border border-[rgba(20,20,24,0.10)] bg-white px-5 py-4 transition-colors hover:border-[rgba(20,20,24,0.30)] hover:bg-[rgba(255,255,255,0.96)]"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: "linear-gradient(180deg, #fffdf6, #f0ecdf)",
          color: "#0b0b0d",
          boxShadow: "inset 0 0 0 1px rgba(20,20,24,0.08)",
        }}
        aria-hidden
      >
        <Icon className="size-[16px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
          {description}
        </p>
      </div>
      <ArrowUpRight
        className="mt-1 size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </Link>
  );
}
