import type * as React from "react";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

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

          <SiteShell activePlan={activePlan} />
        </div>
    </div>
  );
}
