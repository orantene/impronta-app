import { StaffAccountPasswordForm } from "@/app/(dashboard)/admin/account/staff-account-password-form";
import { signOut } from "@/app/auth/actions";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import {
  isStaffRole,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { getCachedActorSession } from "@/lib/server/request-cache";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminAccountPage() {
  const session = await getCachedActorSession();
  if (!session.supabase) {
    redirect("/login?error=config");
  }
  if (!session.user) {
    redirect("/login");
  }

  const { user, profile } = session;
  if (!isStaffRole(profile?.app_role)) {
    redirect(resolveAuthenticatedDestination(profile));
  }

  const hasEmailPassword = userHasEmailPasswordIdentity(user);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <DashboardPageHeader
        eyebrow="Admin"
        title="Account"
        description={
          <>
            Staff sign-in security. If you use Google, adding a password is optional and lets you use
            email login too. Forgot your password? Use{" "}
            <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
              Forgot password
            </Link>{" "}
            while signed out.
          </>
        }
      />

      <DashboardSectionCard
        title="Your session"
        description="Signed in as staff. Sign out on shared devices."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{user.email ?? user.id}</p>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Password"
        description={
          hasEmailPassword
            ? "Change the password you use with your email on the log-in screen."
            : "Optional: add a password to sign in with email as well as Google."
        }
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <StaffAccountPasswordForm hasEmailPassword={hasEmailPassword} />
      </DashboardSectionCard>
    </div>
  );
}
