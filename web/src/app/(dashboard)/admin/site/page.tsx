import { redirect } from "next/navigation";
import { ExternalLink, LayoutDashboard } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConvertHeroBanner } from "@/components/admin/site-control-center/convert-hero-banner";
import { PlanTierToggle } from "@/components/admin/site-control-center/plan-tier-toggle";
import { SiteShell } from "@/components/admin/site-control-center/site-shell";
import {
  nextHero,
  parsePlan,
} from "@/components/admin/site-control-center/capability-catalog";
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
  const hero = nextHero(activePlan);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <PlanTierToggle activePlan={activePlan} />

      <div className="space-y-6">
        <AdminPageHeader
          icon={LayoutDashboard}
          eyebrow="Site & AI"
          title="Site"
          description="Your roster, site, and embeds — everything that shapes the public face of your agency. Open a tile to configure it."
          right={
            <a
              href="/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-foreground/40 hover:bg-muted/30"
            >
              Open public site
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          }
        />

        {hero ? <ConvertHeroBanner hero={hero} /> : null}

        <SiteShell activePlan={activePlan} />
      </div>
    </div>
  );
}
