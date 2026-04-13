import Link from "next/link";
import { Compass } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { TalentDashboardPage } from "@/components/talent/talent-dashboard-primitives";
import { Button } from "@/components/ui/button";

export default function TalentNotFound() {
  return (
    <TalentDashboardPage className="py-4">
      <DashboardEmptyState
        icon={<Compass className="size-7 text-[var(--impronta-gold)]" aria-hidden />}
        title="This talent page doesn’t exist"
        description="The link may be outdated or the page was moved. Head back to your profile or use the bottom navigation."
        actions={
          <>
            <Button asChild className="rounded-xl">
              <Link href="/talent/my-profile">My profile</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/talent/status">Status</Link>
            </Button>
          </>
        }
      />
    </TalentDashboardPage>
  );
}
