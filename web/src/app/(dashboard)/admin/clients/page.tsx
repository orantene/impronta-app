import Link from "next/link";
import { Info, UserRound } from "lucide-react";
import { AdminNewClientSheet } from "@/app/(dashboard)/admin/clients/admin-new-client-sheet";
import { AdminClientQueue } from "@/app/(dashboard)/admin/clients/admin-client-queue";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { AdminListPage } from "@/components/admin/admin-list-page";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { loadAdminClientsData } from "@/lib/dashboard/admin-dashboard-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_FORM_CONTROL,
  ADMIN_POPOVER_CONTENT_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const { q = "", status = "all", sort = "latest_activity" } = await searchParams;
  const rows = await loadAdminClientsData();
  const query = q.trim().toLowerCase();

  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      status === "all" ? true : (row.account_status ?? "registered") === status;
    if (!matchesStatus) return false;
    if (!query) return true;
    const haystack = [
      row.display_name,
      row.company_name,
      row.phone,
      row.whatsapp_phone,
      row.website_url,
      row.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    switch (sort) {
      case "requests":
        return b.inquiriesCount - a.inquiriesCount;
      case "saved":
        return b.savedCount - a.savedCount;
      case "name":
        return (a.display_name ?? "").localeCompare(b.display_name ?? "", undefined, {
          sensitivity: "base",
        });
      case "created_oldest":
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      case "created_newest":
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      case "latest_activity":
      default:
        return (
          new Date(b.latestInquiryAt ?? 0).getTime() -
          new Date(a.latestInquiryAt ?? 0).getTime()
        );
    }
  });

  const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.account_status ?? "registered";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const statuses = ["all", "registered", "onboarding", "active", "suspended"];

  const hasActiveFilters = q || status !== "all" || sort !== "latest_activity";
  const filterActiveCount =
    (q.trim() ? 1 : 0) + (status !== "all" ? 1 : 0) + (sort !== "latest_activity" ? 1 : 0);

  return (
    <AdminListPage
      eyebrow="Portal users"
      title="Clients"
      description="Portal login users — not the billing entity. For villas, brands, and who you invoice, use Accounts."
      right={
        <div className="flex flex-wrap items-center gap-2">
          <AdminNewClientSheet />
          <Popover>
            <PopoverTrigger
              type="button"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                ADMIN_HELP_TRIGGER_BUTTON,
              )}
            >
              <Info className="size-4 text-[var(--impronta-gold)]" aria-hidden />
              How it works
            </PopoverTrigger>
            <PopoverContent align="end" className={ADMIN_POPOVER_CONTENT_CLASS}>
              <div className="space-y-2">
                <p className="font-display text-sm font-medium text-foreground">
                  Clients vs Accounts
                </p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Clients</span> (this page)
                    are platform login users — people with a client portal account.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Accounts</span> under Admin
                    → Accounts are commercial / billing entities (villa, venue, brand). Link
                    those on inquiries and bookings.
                  </li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
      tabs={
        <AdminPageTabs
          ariaLabel="Client status"
          items={statuses.map((s) => {
            const sp = new URLSearchParams();
            if (s !== "all") sp.set("status", s);
            if (q) sp.set("q", q);
            if (sort !== "latest_activity") sp.set("sort", sort);
            const qs = sp.toString();
            return {
              href: qs ? `/admin/clients?${qs}` : "/admin/clients",
              label:
                s === "all"
                  ? `All (${rows.length})`
                  : `${s[0]!.toUpperCase()}${s.slice(1)} (${statusCounts[s] ?? 0})`,
              active: status === s || (!status && s === "all"),
            };
          })}
        />
      }
      filters={
        <AdminFilterBar title="Search & sort" activeCount={filterActiveCount}>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="q" className="text-sm font-medium text-foreground">
                Search
              </label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Name, company, phone, notes…"
                className={ADMIN_FORM_CONTROL}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sort" className="text-sm font-medium text-foreground">
                Sort by
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className={ADMIN_FORM_CONTROL}
              >
                <option value="latest_activity">Latest activity</option>
                <option value="requests">Most requests</option>
                <option value="saved">Most saved talent</option>
                <option value="name">Name A–Z</option>
                <option value="created_newest">Newest signups</option>
                <option value="created_oldest">Oldest signups</option>
              </select>
            </div>
            <input type="hidden" name="status" value={status} />
            <div className="flex gap-2">
              <Button type="submit">Apply</Button>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" asChild>
                  <Link href="/admin/clients" scroll={false}>
                    Clear
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>
        </AdminFilterBar>
      }
    >
      <DashboardSectionCard
        title={
          sortedRows.length === rows.length
            ? `${rows.length} client${rows.length === 1 ? "" : "s"}`
            : `${sortedRows.length} of ${rows.length} client${rows.length === 1 ? "" : "s"}`
        }
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No client portal logins yet"
            description="When someone signs up on the public client side — browsing, inquiring, or saving talent — their account appears here."
            hint="Need to invoice a villa, brand, or venue? Those are Accounts, not Clients."
          >
            <Link
              href="/admin/accounts"
              className="inline-flex items-center rounded-xl border border-border/60 bg-background/70 px-4 py-2 text-sm text-muted-foreground transition hover:border-[var(--impronta-gold)]/40 hover:text-foreground"
            >
              Manage accounts →
            </Link>
          </EmptyState>
        ) : (
          <AdminClientQueue rows={sortedRows} />
        )}
      </DashboardSectionCard>
    </AdminListPage>
  );
}
