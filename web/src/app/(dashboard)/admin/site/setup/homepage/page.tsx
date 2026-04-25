import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ExternalLink, Star } from "lucide-react";

import {
  SetupPage,
  SetupSection,
} from "@/components/admin/setup/setup-page";
import { hasPhase5Capability } from "@/lib/site-admin";
import { loadHomepageForStaff } from "@/lib/site-admin/server/homepage";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const dynamic = "force-dynamic";

/**
 * /admin/site/setup/homepage — premium chrome over the homepage entry point.
 *
 * The actual homepage composer is a heavy editor that lives at
 * `/admin/site-settings/structure`. This page is a focused launchpad: it
 * shows the live publish state, surfaces the section count (so the operator
 * sees "yes, this has been built out"), and routes them either to the
 * composer or straight to the live homepage in edit mode.
 */
export default async function SiteSetupHomepagePage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin?err=no_tenant");

  const tenantId = scope.tenantId;

  const [canCompose, homepage] = await Promise.all([
    hasPhase5Capability("agency.site_admin.homepage.compose", tenantId),
    loadHomepageForStaff(auth.supabase, tenantId, "en"),
  ]);

  const status = homepage?.page?.status ?? "missing";
  const sectionCount = homepage?.draftSlots?.length ?? 0;
  const liveSectionCount = homepage?.liveSlots?.length ?? 0;
  const publishedAt = homepage?.page?.published_at ?? null;

  return (
    <SetupPage
      eyebrow="SETUP · STEP 1"
      title="Homepage"
      icon={Star}
      description={
        <>
          The first thing every visitor sees. Compose hero, about, talent
          shelves, and any other sections directly on the live canvas — no
          re-rendering, no stale previews.
        </>
      }
      backHref="/admin/site/setup"
      backLabel="Back to Setup"
      headerExtras={
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.18em]"
          style={
            status === "published"
              ? {
                  backgroundColor: "rgba(20,107,58,0.10)",
                  color: "#0e4a26",
                }
              : status === "draft"
                ? {
                    backgroundColor: "rgba(201,162,39,0.14)",
                    color: "#7a5d12",
                  }
                : {
                    backgroundColor: "rgba(20,20,24,0.06)",
                    color: "#3d3d44",
                  }
          }
        >
          {status === "published"
            ? "Live"
            : status === "draft"
              ? "Draft"
              : "Not started"}
        </span>
      }
    >
      <SetupSection label="Status" helper="Latest read of the live homepage row">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Sections in draft"
            value={String(sectionCount)}
            tone={sectionCount > 0 ? "active" : "muted"}
          />
          <StatTile
            label="Sections live"
            value={String(liveSectionCount)}
            tone={liveSectionCount > 0 ? "active" : "muted"}
          />
          <StatTile
            label="Last publish"
            value={
              publishedAt
                ? new Date(publishedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"
            }
            tone={publishedAt ? "active" : "muted"}
          />
        </div>
      </SetupSection>

      <SetupSection label="Open in editor" helper="The composer is one click away">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/site-settings/structure"
            className="group flex items-start gap-4 rounded-[14px] border border-[rgba(20,20,24,0.10)] bg-white px-5 py-4 transition-colors hover:border-[rgba(201,162,39,0.55)] hover:bg-[rgba(255,253,246,1)]"
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
              <Star className="size-[16px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                Composer
              </p>
              <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
                Section-by-section editor with publish + revision history.
              </p>
            </div>
            <ArrowUpRight
              className="mt-1 size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            />
          </Link>
          <Link
            href="/?edit=1"
            target="_blank"
            rel="noreferrer noopener"
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
              <ExternalLink className="size-[16px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                Live canvas
              </p>
              <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
                Open the public homepage with the in-page edit chrome.
              </p>
            </div>
            <ArrowUpRight
              className="mt-1 size-4 shrink-0 text-muted-foreground/70 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            />
          </Link>
        </div>

        {!canCompose ? (
          <p className="rounded-lg border border-[rgba(20,20,24,0.10)] bg-white px-3 py-2 text-[12.5px] text-muted-foreground">
            Read-only view: composing the homepage requires the editor role
            or higher.
          </p>
        ) : null}
      </SetupSection>
    </SetupPage>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "active" | "muted";
}) {
  return (
    <div
      className="rounded-[12px] border border-[rgba(20,20,24,0.10)] bg-white px-4 py-3"
      style={
        tone === "active"
          ? { boxShadow: "inset 0 0 0 1px rgba(201,162,39,0.18)" }
          : undefined
      }
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.005em] text-foreground">
        {value}
      </p>
    </div>
  );
}
