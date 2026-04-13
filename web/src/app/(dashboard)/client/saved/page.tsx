import Link from "next/link";
import { ClientPageHeader } from "@/app/(dashboard)/client/client-page-header";
import { Button } from "@/components/ui/button";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ClientDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import type { ClientSaveRow } from "@/lib/client-dashboard-data";
import { loadClientDashboardData } from "@/lib/client-dashboard-data";
import { ClientSavedList } from "@/app/(dashboard)/client/saved/saved-list";
import { CLIENT_PAGE_STACK_WIDE, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default async function ClientSavedPage() {
  const result = await loadClientDashboardData();
  if (!result.ok) return <ClientDashboardLoadFallback reason={result.reason} />;

  const { saves } = result.data;
  const rows = saves as ClientSaveRow[];

  return (
    <div className={CLIENT_PAGE_STACK_WIDE}>
      <ClientPageHeader
        title="Saved talent"
        subtitle="Your shortlist from the directory — add to cart from the workspace bar when you’re ready to brief us."
        help={{
          title: "Saved talent",
          items: [
            "Save profiles while browsing to build a shortlist you can revisit anytime.",
            "Open cart from the workspace bar to attach talent to a new inquiry.",
          ],
        }}
      />

      <DashboardSectionCard title="Shortlist" description="Cards link to live directory profiles.">
        {rows.length === 0 ? (
          <DashboardEmptyState
            accent
            title="Nothing saved yet"
            description="Browse the directory and tap save on profiles you want to compare or book later."
            actions={
              <Button asChild className={cn(LUXURY_GOLD_BUTTON_CLASS)}>
                <Link href="/directory" scroll={false}>
                  Browse directory
                </Link>
              </Button>
            }
          />
        ) : (
          <ClientSavedList initialRows={rows} />
        )}
      </DashboardSectionCard>
    </div>
  );
}
