import { redirect } from "next/navigation";
import { ExternalLink, LayoutDashboard } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConvertHeroBanner } from "@/components/admin/site-control-center/convert-hero-banner";
import { PlanTierToggle } from "@/components/admin/site-control-center/plan-tier-toggle";
import { TierBand } from "@/components/admin/site-control-center/tier-band";
import {
  TIER_BANDS,
  nextHero,
  parsePlan,
} from "@/components/admin/site-control-center/capability-catalog";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { requireStaff } from "@/lib/server/action-guards";

export const dynamic = "force-dynamic";

/**
 * /admin/site — Site control center.
 *
 * The single index for everything that ships your storefront. Replaces the
 * old `/admin/site-settings` overview hub. Capabilities are organized by
 * plan tier (Free → Studio → Agency → Network); the active plan comes from
 * `?plan=` (`agency` default) and gates which cards render unlocked.
 *
 * The plan toggle is purely URL-driven, so the page stays a server
 * component and re-renders cheaply per pill click.
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
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/55 hover:bg-[var(--impronta-gold)]/[0.05]"
            >
              Open public site
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          }
        />

        {hero ? <ConvertHeroBanner hero={hero} /> : null}

        <div className="space-y-8">
          {TIER_BANDS.map((band) => (
            <TierBand key={band.tier} band={band} activePlan={activePlan} />
          ))}
        </div>
      </div>
    </div>
  );
}
