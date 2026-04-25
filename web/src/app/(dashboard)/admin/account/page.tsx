import { StaffAccountPasswordForm } from "@/app/(dashboard)/admin/account/staff-account-password-form";
import { AccountShell } from "@/components/admin/account/account-shell";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
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
  const userEmail = user.email ?? user.id;

  const securitySlot = (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Your session
        </h3>
        <p className="text-[12.5px] text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{userEmail}</span>.
          Sign out from the avatar menu (top-right) or sidebar.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Password
        </h3>
        <p className="text-[12.5px] text-muted-foreground">
          {hasEmailPassword ? (
            <>
              Change the password you use with your email on the log-in screen.
              Forgot your password? Use{" "}
              <Link
                href="/forgot-password"
                className="text-primary underline-offset-4 hover:underline"
              >
                Forgot password
              </Link>{" "}
              while signed out.
            </>
          ) : (
            "Optional: add a password to sign in with email as well as Google."
          )}
        </p>
        <StaffAccountPasswordForm hasEmailPassword={hasEmailPassword} />
      </section>
    </div>
  );

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        eyebrow="Account"
        title="Account & billing"
        description="Plan, organization, payment, invoices, and your staff sign-in — open any tile to edit."
      />

      <AccountShell userEmail={userEmail} securitySlot={securitySlot} />
    </div>
  );
}
