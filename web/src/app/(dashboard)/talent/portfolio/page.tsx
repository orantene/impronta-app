import Link from "next/link";
import { Suspense } from "react";
import { Camera } from "lucide-react";
import { TalentMediaManager } from "@/app/(dashboard)/talent/talent-media-manager";
import { Button } from "@/components/ui/button";
import {
  TalentDashboardPage,
  TalentInlineProgress,
  TalentPageHeader,
} from "@/components/talent/talent-dashboard-primitives";
import { TalentDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";
import { cn } from "@/lib/utils";

export default async function TalentPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const result = await loadTalentDashboardData();
  if (!result.ok) return <TalentDashboardLoadFallback reason={result.reason} />;

  const { profile, media, completionScore } = result.data;

  return (
    <TalentDashboardPage>
      {/* Same hero shell as My Profile action hub */}
      <section className="space-y-4 lg:space-y-5">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card",
            "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.5)]",
            "sm:rounded-2xl lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.28)]",
          )}
        >
          <div className="space-y-5 p-4 sm:p-5 lg:p-8">
            <TalentPageHeader
              icon={Camera}
              title="Media & portfolio"
              description="Headshot, banner, and directory gallery. Use the tabs to focus one area — uploads save right away."
              right={
                <Button
                  variant="outline"
                  asChild
                  className="h-11 w-full gap-2 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm sm:w-auto lg:h-12"
                >
                  <Link href="/talent/my-profile">Profile checklist</Link>
                </Button>
              }
            />
            <div className="border-t border-border/40 pt-5">
              <TalentInlineProgress
                label="Profile completion (matches My Profile)"
                value={completionScore}
                className="border-border/40 bg-background/55 shadow-none backdrop-blur-sm"
              />
            </div>
          </div>
        </div>
      </section>

      <Suspense
        fallback={
          <div className="rounded-2xl border border-border/40 bg-card/80 px-4 py-14 text-center text-sm text-muted-foreground shadow-sm">
            Loading media…
          </div>
        }
      >
        <TalentMediaManager
          talentProfileId={profile.id}
          profileCode={profile.profile_code}
          media={media}
          initialTab={tab ?? null}
        />
      </Suspense>
    </TalentDashboardPage>
  );
}
