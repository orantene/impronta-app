import Link from "next/link";
import { Settings, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import {
  TalentAccountDisplayNameForm,
  TalentAccountEmailForm,
  TalentAccountPasswordForm,
} from "@/app/(dashboard)/talent/talent-account-forms";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  TalentDashboardPage,
  TalentPageHeader,
  TalentSectionLabel,
} from "@/components/talent/talent-dashboard-primitives";
import { TalentDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";
import { cn } from "@/lib/utils";

const sectionCardTalent =
  "border-border/40 bg-card/80 hover:border-[var(--impronta-gold)]/45 hover:shadow-md";

const titleTalent = "text-[15px] font-semibold tracking-tight";

export default async function TalentAccountPage() {
  const result = await loadTalentDashboardData();
  if (!result.ok) return <TalentDashboardLoadFallback reason={result.reason} />;

  const { accountProfile, userEmail, accountHasEmailPassword } = result.data;
  const displayName = accountProfile?.display_name ?? userEmail ?? "";

  return (
    <TalentDashboardPage>
      <section className="space-y-4 lg:space-y-5">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card",
            "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.5)]",
            "sm:rounded-2xl lg:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.28)]",
          )}
        >
          <div className="p-4 sm:p-5 lg:p-8">
            <TalentPageHeader
              icon={UserRound}
              title="Account settings"
              description="Google or email sign-in, optional password for email login, and how your name appears in this workspace."
              right={
                <Button
                  variant="outline"
                  asChild
                  className="h-11 w-full gap-2 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm sm:w-auto lg:h-12"
                >
                  <Link href="/talent/my-profile">Back to profile</Link>
                </Button>
              }
            />
          </div>
        </div>
      </section>

      <div className="space-y-5 lg:space-y-6">
        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel icon={Settings}>Account</TalentSectionLabel>
          <div className="flex flex-col gap-4 lg:gap-5">
            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Your account"
              description="Linked login and account status visible to the agency."
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <p className="text-[15px] font-semibold tracking-tight text-foreground">
                    {accountProfile?.display_name ?? userEmail ?? "Talent account"}
                  </p>
                  <p className="leading-relaxed">{userEmail ?? "No email available"}</p>
                  <p className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1 text-xs font-medium text-foreground/90">
                    Status:{" "}
                    <span className="capitalize">{accountProfile?.account_status ?? "unknown"}</span>
                  </p>
                </div>
                <form action={signOut}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-11 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm"
                  >
                    Sign out
                  </Button>
                </form>
              </div>
            </DashboardSectionCard>

            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Profile label"
              description="How your name appears in the dashboard sidebar and to the agency team."
            >
              <TalentAccountDisplayNameForm defaultDisplayName={displayName} />
            </DashboardSectionCard>

            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Email address"
              description="Used to sign in. Changing it may require confirming from both your current and new inbox."
            >
              <TalentAccountEmailForm currentEmail={userEmail ?? ""} />
            </DashboardSectionCard>

            <DashboardSectionCard
              className={sectionCardTalent}
              titleClassName={titleTalent}
              title="Password"
              description={
                accountHasEmailPassword
                  ? "Change the password you use with your email on the log-in screen."
                  : "Optional: add a password if you want to sign in with email as well as Google."
              }
            >
              <TalentAccountPasswordForm hasEmailPassword={accountHasEmailPassword} />
            </DashboardSectionCard>
          </div>
        </div>
      </div>
    </TalentDashboardPage>
  );
}
