import { redirect } from "next/navigation";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SiteShell } from "@/components/admin/site-control-center/site-shell";
import { parsePlan } from "@/components/admin/site-control-center/capability-catalog";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { requireStaff } from "@/lib/server/action-guards";

export const dynamic = "force-dynamic";

/**
 * /admin/site — Site control center.
 *
 * Plan-tiered card grid. Every card opens a right-side drawer (drawer
 * pattern from `docs/mockups/site-control-center.html`). Locked cards show
 * an upgrade pitch in the drawer instead of navigating away.
 *
 * The plan toggle is purely URL-driven (`?plan=`), so the page stays a
 * server component and re-renders cheaply per pill click. Drawer state
 * lives in the SiteShell client component.
 */
export default async function AdminSiteControlCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const params = await searchParams;
  const activePlan = parsePlan(params.plan);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className="space-y-6">
          <AdminPageHeader
            icon={LayoutDashboard}
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
