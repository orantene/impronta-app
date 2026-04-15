import Link from "next/link";
import { ClientPageHeader } from "@/app/(dashboard)/client/client-page-header";
import { DashboardPersonInline } from "@/components/dashboard/dashboard-person-inline";
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
import { Bookmark, Building2, CalendarDays, FileText, Sparkles } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";

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

  // Find an inquiry that may need the client's attention
  const actionableInquiry = inquiries.find(
    (i) => i.status === "offer_pending" || i.status === "approved" || i.status === "submitted",
  ) ?? null;

  const displayName = profile?.display_name ?? userEmail ?? "there";
  const firstName = displayName.split(/[\s@]/)[0] ?? displayName;

  const tx = (key: string) => t(`dashboard.clientOverview.${key}`);

  return (
    <div className={CLIENT_PAGE_STACK_WIDE}>
      <MergeGuestStatus />

      {/* Welcome banner */}
      <div className="flex items-center gap-4 rounded-3xl border border-[var(--impronta-gold-border)]/30 bg-gradient-to-br from-[var(--impronta-gold)]/8 via-card/60 to-card/30 px-5 py-4 shadow-sm backdrop-blur-sm sm:px-6 sm:py-5">
        <UserAvatar
          src={profile?.avatar_url ?? null}
          name={displayName}
          size="lg"
          rounded="xl"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Welcome back, {firstName}
            <Sparkles className="size-4 shrink-0 text-[var(--impronta-gold)]" aria-hidden />
          </p>
          {clientProfile?.company_name?.trim() ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{clientProfile.company_name}</p>
          ) : null}
          {actionableInquiry ? (
            <div className="mt-2">
              <Link
                href={`/client/inquiries/${actionableInquiry.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--impronta-gold)]/30 bg-[var(--impronta-gold)]/10 px-3 py-1 text-xs font-medium text-[var(--impronta-gold)] hover:bg-[var(--impronta-gold)]/20"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--impronta-gold)]" />
                {actionableInquiry.status === "offer_pending"
                  ? "You have an offer waiting for review"
                  : actionableInquiry.status === "approved"
                    ? "Inquiry approved — awaiting booking"
                    : "Your request is being reviewed"}
              </Link>
            </div>
          ) : null}
        </div>
      </div>

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
              <Link href="/client/inquiries" scroll={false}>
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
          <DashboardPersonInline
            avatarUrl={profile?.avatar_url ?? null}
            name={profile?.display_name ?? userEmail ?? tx("accountFallback")}
            avatarSize="md"
            align="center"
          >
            <p className="text-sm font-semibold text-foreground">
              {profile?.display_name ?? userEmail ?? tx("accountFallback")}
            </p>
          </DashboardPersonInline>
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
