import Link from "next/link";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

import { NavigationManager, type NavRow } from "./navigation-manager";

export const dynamic = "force-dynamic";

export default async function CmsNavigationPage() {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const { data, error } = await supabase
    .from("cms_navigation_items")
    .select("id,locale,zone,label,href,sort_order,visible")
    .order("locale")
    .order("zone")
    .order("sort_order");

  if (error) {
    logServerError("admin/cms-navigation/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const rows = (data ?? []) as NavRow[];

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Navigation</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Header and footer links per locale. Public site consumption can read visible rows via
          Supabase anon client (RLS); wiring into layout components is a follow-up integration step.
        </p>
      </div>

      <DashboardSectionCard
        title="Links"
        description="Lower sort_order values appear first. Changes are audited in activity_log."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <NavigationManager initialRows={rows} />
      </DashboardSectionCard>

      <p className="text-sm text-muted-foreground">
        <Link href="/admin/site-settings/content" className="text-primary underline-offset-4 hover:underline">
          ← Content hub
        </Link>
      </p>
    </div>
  );
}
