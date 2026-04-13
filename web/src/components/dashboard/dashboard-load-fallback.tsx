import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { TalentDashboardPage } from "@/components/talent/talent-dashboard-primitives";
import { Button } from "@/components/ui/button";

export function TalentDashboardLoadFallback({
  reason,
}: {
  reason: "no_supabase" | "no_user" | "no_profile";
}) {
  const message =
    reason === "no_supabase"
      ? "Dashboard data can’t load — Supabase isn’t configured for this environment."
      : reason === "no_user"
        ? "Your session isn’t available. Sign in again to continue."
        : "No talent profile is linked to this account yet.";

  return (
    <TalentDashboardPage className="py-2">
      <DashboardEmptyState
        icon={<LayoutDashboard className="size-7 text-[var(--impronta-gold)]" aria-hidden />}
        title={message}
        description="If this keeps happening, sign out and sign in again."
        actions={
          <>
            <Button asChild variant="secondary" className="rounded-xl">
              <Link href="/login" scroll={false}>
                Sign in
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/" scroll={false}>
                Back to site
              </Link>
            </Button>
          </>
        }
      />
    </TalentDashboardPage>
  );
}

export function ClientDashboardLoadFallback({
  reason,
}: {
  reason: "no_supabase" | "no_user";
}) {
  const message =
    reason === "no_supabase"
      ? "Client dashboard can’t load — Supabase isn’t configured."
      : "Your session isn’t available. Sign in again to continue.";

  return (
    <DashboardEmptyState
      title={message}
      description="If this keeps happening, sign out and sign in again."
      actions={
        <>
          <Button asChild variant="secondary">
            <Link href="/login" scroll={false}>
              Sign in
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/" scroll={false}>
              Back to site
            </Link>
          </Button>
        </>
      }
    />
  );
}
