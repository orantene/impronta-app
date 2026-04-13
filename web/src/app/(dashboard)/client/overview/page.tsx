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
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const result = await loadClientDashboardData();
  if (!result.ok) return <ClientDashboardLoadFallback reason={result.reason} />;

  const { data } = result;
  const { profile, clientProfile, userEmail, saves, inquiries } = data;
  const latestInquiry = inquiries[0] ?? null;
  const bookingsResult = await loadClientBookings();
  const bookingCount = bookingsResult.ok ? bookingsResult.bookings.length : 0;

  const tx = (key: string) => t(`dashboard.clientOverview.${key}`);

  return (
    <div className={CLIENT_PAGE_STACK_WIDE}>
      <MergeGuestStatus />

      <ClientPageHeader
        title={tx("title")}
        subtitle={tx("subtitle")}
        help={{
          title: tx("helpTitle"),
          items: [tx("helpItem1"), tx("helpItem2"), tx("helpItem3")],
        }}
      />

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardSectionCard
          title={<CardTitleIcon icon={Bookmark} label={tx("savedTalent")} />}
          description={tx("savedTalentDesc")}
          titleClassName="!text-base"
        >
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{saves.length}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" asChild>
              <Link href="/client/saved" scroll={false}>
                {tx("viewSaved")}
              </Link>
            </Button>
            {saves.length === 0 ? (
              <Button size="sm" variant="secondary" className="w-full justify-center sm:w-auto" asChild>
                <Link href="/directory" scroll={false}>
                  {tx("browseDirectory")}
                </Link>
              </Button>
            ) : null}
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title={<CardTitleIcon icon={FileText} label={tx("requests")} />}
          description={tx("requestsDesc")}
          titleClassName="!text-base"
        >
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
            {inquiries.length}
          </p>
          <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
            {latestInquiry ? (
              <>
                {tx("latestPrefix")}{" "}
                <span className="font-medium text-foreground">
                  {formatInquiryStatus(latestInquiry.status)}
                </span>
              </>
            ) : (
              tx("noRequestsYet")
            )}
          </p>
          <div className="mt-4">
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link href="/client/requests" scroll={false}>
                {tx("viewRequests")}
              </Link>
            </Button>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title={<CardTitleIcon icon={CalendarDays} label={tx("bookings")} />}
          description={tx("bookingsDesc")}
          titleClassName="!text-base"
        >
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{bookingCount}</p>
          <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
            {tx("bookingsFootnote")}
          </p>
          <div className="mt-4">
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link href="/client/bookings" scroll={false}>
                {tx("viewBookings")}
              </Link>
            </Button>
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title={<CardTitleIcon icon={Building2} label={tx("account")} />}
          description={tx("accountDesc")}
          titleClassName="!text-base"
        >
          <p className="text-sm font-semibold text-foreground">
            {profile?.display_name ?? userEmail ?? tx("accountFallback")}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {clientProfile?.company_name?.trim()
              ? clientProfile.company_name
              : tx("addCompanyHint")}
          </p>
          <div className="mt-5">
            <Button className="w-full" variant="outline" size="sm" asChild>
              <Link href="/client/account" scroll={false}>
                {tx("accountSettings")}
              </Link>
            </Button>
          </div>
        </DashboardSectionCard>
      </section>
    </div>
  );
}
