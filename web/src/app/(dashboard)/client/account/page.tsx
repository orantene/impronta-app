import { ClientPageHeader } from "@/app/(dashboard)/client/client-page-header";
import { ClientProfileForm } from "@/app/(dashboard)/client/client-profile-form";
import { ClientAccountPasswordForm } from "@/app/(dashboard)/client/client-account-forms";
import { ClientDeleteAccountForm } from "@/app/(dashboard)/client/client-delete-account-form";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ClientDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { CLIENT_PAGE_STACK_MEDIUM } from "@/lib/dashboard-shell-classes";
import { loadClientDashboardData } from "@/lib/client-dashboard-data";

export default async function ClientAccountPage() {
  const result = await loadClientDashboardData();
  if (!result.ok) return <ClientDashboardLoadFallback reason={result.reason} />;

  const { profile, clientProfile, userEmail, accountHasEmailPassword } = result.data;

  return (
    <div className={CLIENT_PAGE_STACK_MEDIUM}>
      <ClientPageHeader
        title="Account"
        subtitle="Business details prefill new inquiries. Add a password only if you want email sign-in alongside Google."
        help={{
          title: "Account",
          items: [
            "What you save here is reused as defaults on the cart and inquiry forms.",
            "Deleting your account removes your login and client profile from the portal.",
          ],
        }}
      />

      <DashboardSectionCard
        title="Business & contact"
        description="Company name, phones, site, and internal notes for recurring preferences."
      >
        <ClientProfileForm
          email={userEmail ?? ""}
          defaultValues={{
            company_name: clientProfile?.company_name,
            display_name: profile?.display_name,
            notes: clientProfile?.notes,
            phone: clientProfile?.phone,
            whatsapp_phone: clientProfile?.whatsapp_phone,
            website_url: clientProfile?.website_url,
          }}
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Password"
        description={
          accountHasEmailPassword
            ? "Change the password you use with your email on the log-in screen."
            : "Optional: add a password to sign in with email as well as Google."
        }
      >
        <ClientAccountPasswordForm hasEmailPassword={accountHasEmailPassword} />
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Delete account"
        description="Remove your login, profile, saved talent, and request history linked to this account."
        className="border-destructive/25 bg-destructive/[0.02] hover:border-destructive/35"
        titleClassName="text-destructive"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            If you delete your account, you will lose access to this workspace. The agency may retain
            copies of past inquiries and bookings for their records, but your portal login and
            client profile data tied to this user will be removed.
          </p>
          <ClientDeleteAccountForm />
        </div>
      </DashboardSectionCard>
    </div>
  );
}
