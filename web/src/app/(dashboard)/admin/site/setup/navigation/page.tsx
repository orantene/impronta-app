import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Menu, PanelTop, PanelBottom } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import { loadMenuForStaff } from "@/lib/site-admin/server/navigation-reads";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const dynamic = "force-dynamic";

/**
 * /admin/site/setup/navigation — header + footer summary surface.
 *
 * The actual nav editor is canvas-based (drag-and-drop directly on the live
 * site). This setup page is a routing layer: it resolves whether the header
 * and footer menus are published, then sends the operator into the legacy
 * editor or onto the live canvas in edit mode.
 */
export default async function SiteSetupNavigationPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin?err=no_tenant");

  const tenantId = scope.tenantId;

  const [header, footer] = await Promise.all([
    loadMenuForStaff(auth.supabase, tenantId, "header", "en"),
    loadMenuForStaff(auth.supabase, tenantId, "footer", "en"),
  ]);

  return (
    <SetupPage
      eyebrow="SETUP · STEP 4"
      title="Navigation & Footer"
      icon={Menu}
      description={
        <>
          Two zones, one editor. Header sits at the top of every public page;
          footer columns sit at the bottom. Edit either by drag-and-drop
          directly on the live canvas, or open the legacy menu editor below.
        </>
      }
      backHref="/admin/site/setup"
      backLabel="Back to Setup"
    >
      <SetupSection label="Zones">
        <div className="grid gap-3 sm:grid-cols-2">
          <ZoneCard
            icon={PanelTop}
            title="Header"
            published={header?.published_at != null}
            publishedAt={header?.published_at ?? null}
            href="/admin/site-settings/content/navigation?zone=header"
          />
          <ZoneCard
            icon={PanelBottom}
            title="Footer"
            published={footer?.published_at != null}
            publishedAt={footer?.published_at ?? null}
            href="/admin/site-settings/content/navigation?zone=footer"
          />
        </div>
      </SetupSection>

      <SetupSection
        label="Edit on the canvas"
        helper="Drag, drop, reorder — all directly on the live site"
      >
        <Link
          href="/admin/site-settings/structure"
          target="_blank"
          rel="noreferrer noopener"
          className="group flex items-start justify-between gap-4 rounded-[14px] border border-[rgba(20,20,24,0.10)] bg-white px-5 py-4 transition-colors hover:border-[rgba(201,162,39,0.55)] hover:bg-[rgba(255,253,246,1)]"
        >
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground">
              Open live canvas
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
              In-place editing means you see the finished result immediately
              — no rebuild step, no preview environment.
            </p>
          </div>
          <ArrowUpRight
            className="mt-1 size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        </Link>
      </SetupSection>
    </SetupPage>
  );
}

function ZoneCard({
  icon: Icon,
  title,
  published,
  publishedAt,
  href,
}: {
  icon: LucideIcon;
  title: string;
  published: boolean;
  publishedAt: string | null;
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
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-foreground">{title}</p>
          <span
            className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em]"
            style={
              published
                ? {
                    backgroundColor: "rgba(20,107,58,0.10)",
                    color: "#0e4a26",
                  }
                : {
                    backgroundColor: "rgba(20,20,24,0.06)",
                    color: "#3d3d44",
                  }
            }
          >
            {published ? "Live" : "Pending"}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {published && publishedAt
            ? `Last published ${new Date(publishedAt).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" },
              )}`
            : "No published version yet — open the editor to add links."}
        </p>
      </div>
      <ArrowUpRight
        className="mt-1 size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </Link>
  );
}
