import type * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SiteShell } from "@/components/admin/site-control-center/site-shell";
import { loadAdminWorkspaceSummary } from "@/lib/dashboard/admin-workspace-summary";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { requireStaff } from "@/lib/server/action-guards";

/**
 * Window-grid glyph from the mockup — rect 3,4,18,14 rounded 2 + three
 * dividers (top, vertical 8, vertical 16). Drop-in for AdminPageHeader's
 * Lucide-typed `icon` slot (we use a Lucide-compatible signature).
 */
const SiteWindowIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M3 8h18M8 4v14M16 4v14" />
  </svg>
);

export const dynamic = "force-dynamic";

/**
 * /admin/site — Site control center.
 *
 * Plan-tiered card grid. Every card opens a right-side drawer (drawer
 * pattern from `docs/mockups/site-control-center.html`). Locked cards show
 * an upgrade pitch in the drawer instead of navigating away.
 *
 * The active plan is read from the workspace's `agencies.plan_tier` row
 * (via {@link loadAdminWorkspaceSummary}) so the gates here match the
 * tier-chip in the top bar. Drawer state lives in the SiteShell client
 * component.
 */
export default async function AdminSiteControlCenterPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const workspace = await loadAdminWorkspaceSummary();
  const activePlan = workspace?.plan ?? "free";

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className="space-y-6">
          <AdminPageHeader
            icon={SiteWindowIcon as never}
            title="Site"
            description="Your roster, site, and embeds — in one place."
            right={
              <a
                href="/"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(24,24,27,0.18)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground shadow-sm transition-colors hover:border-[rgba(201,162,39,0.4)] hover:bg-[rgba(201,162,39,0.06)]"
              >
                Open subdomain
                <ArrowUpRight className="size-3" aria-hidden />
              </a>
            }
          />

          {activePlan === "agency" || activePlan === "network" ? (
            <Link
              href="/admin/site/setup"
              className="group relative flex flex-wrap items-center gap-4 overflow-hidden rounded-[14px] border border-[rgba(201,162,39,0.55)] bg-[linear-gradient(135deg,#fffdf6_0%,#faf3df_55%,#f4ead0_100%)] px-5 py-4 shadow-[0_8px_24px_-18px_rgba(201,162,39,0.45)] transition-[border-color,box-shadow] hover:border-[rgba(201,162,39,0.85)] hover:shadow-[0_12px_30px_-16px_rgba(201,162,39,0.55)]"
            >
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-[12px]"
                style={{
                  background: "linear-gradient(180deg, #fffdf6, #f0ecdf)",
                  color: "#7a5d12",
                  boxShadow: "inset 0 0 0 1px rgba(201,162,39,0.35)",
                }}
                aria-hidden
              >
                <Sparkles className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#7a5d12]">
                  Site Setup · the unified walkthrough
                </p>
                <p
                  className="mt-1 text-[20px] font-semibold leading-[1.1] tracking-[-0.005em] text-foreground"
                  style={{
                    fontFamily:
                      '"Cormorant Garamond", "EB Garamond", "Georgia", serif',
                  }}
                >
                  Get your site live in six steps
                </p>
                <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
                  Homepage, pages, posts, navigation, theme, SEO — every
                  Agency card, walked through with real status and one click
                  to apply.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background transition-transform group-hover:translate-x-0.5">
                Open setup
                <ArrowRight className="size-3" aria-hidden />
              </span>
            </Link>
          ) : null}

          <SiteShell activePlan={activePlan} />
        </div>
    </div>
  );
}
