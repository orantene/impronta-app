import Link from "next/link";
import { ClientPageHeader } from "@/app/(dashboard)/client/client-page-header";
import { MergeGuestStatus } from "@/app/(dashboard)/client/merge-guest-status";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ClientDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { formatInquiryStatus } from "@/lib/inquiries";
import { loadClientBookings } from "@/lib/client-bookings-data";
import { loadClientDashboardData } from "@/lib/client-dashboard-data";
import { CLIENT_PAGE_STACK_WIDE } from "@/lib/dashboard-shell-classes";
import type { LucideIcon } from "lucide-react";
import { Bookmark, Building2, CalendarDays, FileText } from "lucide-react";

function CardTitleIcon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--impronta-gold-border)]/40 bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span>{label}</span>
    </span>
  );
}

export default async function ClientOverviewPage() {
  const result = await loadClientDashboardData();
  if (!result.ok) return <ClientDashboardLoadFallback reason={result.reason} />;

  const { data } = result;
  const { profile, clientProfile, userEmail, saves, inquiries } = data;
  const latestInquiry = inquiries[0] ?? null;
  const bookingsResult = await loadClientBookings();
  const bookingCount = bookingsResult.ok ? bookingsResult.bookings.length : 0;

  return (
    <div className={CLIENT_PAGE_STACK_WIDE}>
      <MergeGuestStatus />

      <ClientPageHeader
        title="Overview"
        subtitle="Jump into each area of your portal — the workspace bar above keeps directory and cart one tap away."
        help={{
          title: "Overview",
          items: [
            "Saved talent is your shortlist from the directory.",
            "Requests show inquiry status after you submit from the cart.",
            "Account details prefill future requests.",
          ],
        }}
      />

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardSectionCard
          title={<CardTitleIcon icon={Bookmark} label="Saved talent" />}
          description="Profiles you bookmarked while browsing."
          titleClassName="!text-base"
        >
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{saves.length}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" asChild>
              <Link href="/client/saved" scroll={false}>
                View saved
              </Link>
            </Button>
            {saves.length === 0 ? (
              <Button size="sm" variant="secondary" className="w-full justify-center sm:w-auto" asChild>
                <Link href="/directory" scroll={false}>
                  Browse directory
                </Link>
              </Button>
            ) : null}
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title={<CardTitleIcon icon={FileText} label="Requests" />}
          description="Inquiries tied to this login."
          titleClassName="!text-base"
        >
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
            {inquiries.length}
          </p>
          <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
            {latestInquiry ? (
              <>
                Latest: <span className="font-medium text-foreground">{formatInquiryStatus(latestInquiry.status)}</span>
              </>
            ) : (
              "No requests yet — add talent to your cart and submit a brief when you’re ready."
            )}
          </p>
          <div className="mt-4">
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link href="/client/requests" scroll={false}>
                View requests
              </Link>
            </Button>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title={<CardTitleIcon icon={CalendarDays} label="Bookings" />}
          description="Confirmed work shared by the agency."
          titleClassName="!text-base"
        >
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{bookingCount}</p>
          <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
            Jobs linked to your account after an inquiry moves forward.
          </p>
          <div className="mt-4">
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link href="/client/bookings" scroll={false}>
                View bookings
              </Link>
            </Button>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title={<CardTitleIcon icon={Building2} label="Account" />}
          description="Name and company on file."
          titleClassName="!text-base"
        >
          <p className="text-sm font-semibold text-foreground">
            {profile?.display_name ?? userEmail ?? "Client account"}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {clientProfile?.company_name?.trim()
              ? clientProfile.company_name
              : "Add your company in Account settings."}
          </p>
          <div className="mt-5">
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link href="/client/account" scroll={false}>
                Account settings
              </Link>
            </Button>
          </div>
        </DashboardSectionCard>
      </section>
    </div>
  );
}
