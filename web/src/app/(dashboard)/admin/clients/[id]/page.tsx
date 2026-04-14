import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Building2,
  ChevronRight,
  FileText,
  MessageSquare,
} from "lucide-react";
import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import { AdminClientProfileForm } from "@/app/(dashboard)/admin/clients/admin-client-profile-form";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminFutureWorkspaceSlot } from "@/components/admin/admin-entity-context";
import { loadAdminClientDetail } from "@/lib/dashboard/admin-dashboard-data";
import {
  ADMIN_LIST_TILE_HOVER,
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

function getInitials(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const INQUIRY_STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-500",
  reviewing: "bg-amber-500",
  waiting_for_client: "bg-orange-400",
  talent_suggested: "bg-purple-500",
  in_progress: "bg-emerald-500",
  closed: "bg-muted-foreground/50",
  archived: "bg-muted-foreground/30",
};

const BOOKING_STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted-foreground/40",
  confirmed: "bg-emerald-500",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-700",
  cancelled: "bg-destructive/60",
};

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadAdminClientDetail(id);
  if (!detail) notFound();

  const supabase = await getCachedServerSupabase();
  const [{ data: clientBookings }, { data: inqRowsForAccounts }] = supabase
    ? await Promise.all([
        supabase
          .from("agency_bookings")
          .select("id, title, status, total_client_revenue, currency_code, updated_at")
          .eq("client_user_id", id)
          .order("updated_at", { ascending: false })
          .limit(40),
        supabase
          .from("inquiries")
          .select("client_account_id, client_accounts ( id, name )")
          .eq("client_user_id", id)
          .not("client_account_id", "is", null),
      ])
    : [{ data: [] as never[] }, { data: [] as never[] }];

  type AccRow = {
    client_account_id: string;
    client_accounts: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const accountMap = new Map<string, string>();
  for (const row of (inqRowsForAccounts ?? []) as AccRow[]) {
    const ca = row.client_accounts;
    const one = Array.isArray(ca) ? ca[0] : ca;
    if (one?.id) accountMap.set(one.id, one.name);
  }
  const linkedAccounts = [...accountMap.entries()].map(([aid, name]) => ({ id: aid, name }));
  const nBookings = (clientBookings ?? []).length;

  return (
    <div className={ADMIN_PAGE_STACK}>
      {/* ── Breadcrumb ───────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/admin/clients"
          scroll={false}
          className="flex items-center gap-1 hover:text-[var(--impronta-gold)] hover:underline underline-offset-4"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Clients
        </Link>
        <ChevronRight className="size-3 opacity-40" aria-hidden />
        <span className="text-foreground/80 truncate max-w-[200px]">
          {detail.profile.display_name ?? "Client"}
        </span>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/45 bg-card/60 px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: avatar + identity */}
          <div className="flex items-center gap-4">
            <div
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/15 font-display text-xl font-semibold text-[var(--impronta-gold)] shadow-sm"
            >
              {getInitials(detail.profile.display_name)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
                {detail.profile.display_name ?? "Unnamed client"}
              </h1>
              {detail.clientProfile.company_name ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {detail.clientProfile.company_name}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <AdminCommercialStatusBadge
                  kind="client"
                  status={String(detail.profile.account_status ?? "registered")}
                />
                <Badge
                  variant="outline"
                  className="border-border/50 bg-muted/20 px-2 py-0.5 text-[11px] capitalize text-muted-foreground"
                >
                  {detail.profile.app_role ?? "client"}
                </Badge>
                {detail.clientProfile.created_at ? (
                  <span className="text-[11px] text-muted-foreground/70">
                    Joined {formatDate(detail.clientProfile.created_at)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <Button
              size="sm"
              variant="outline"
              className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
              asChild
            >
              <Link
                href={`/admin/inquiries?client_user_id=${encodeURIComponent(detail.profile.id)}`}
                scroll={false}
              >
                <MessageSquare className="size-3.5" aria-hidden />
                Inquiries
              </Link>
            </Button>
            <AdminUserEditButton
              userId={detail.profile.id}
              urlSync={{ pathname: `/admin/clients/${id}` }}
            />
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/35 pt-4 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Requests
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {detail.inquiries.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Bookings
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {nBookings}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Saved talent
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-[var(--impronta-gold)]">
              {detail.savedTalent.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Accounts
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {linkedAccounts.length}
            </span>
          </div>
        </div>
      </div>

      {/* ── Contact & company form ────────────────────────────────── */}
      <DashboardSectionCard
        title="Contact & company"
        description="Edit the details used to prefill requests. All workflow stays agency-managed."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AdminClientProfileForm
          userId={detail.profile.id}
          defaultValues={detail.clientProfile}
        />
      </DashboardSectionCard>

      {/* ── Inquiry history ──────────────────────────────────────── */}
      <DashboardSectionCard
        title={
          <span className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            Inquiry history
            {detail.inquiries.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[11px]">
                {detail.inquiries.length}
              </Badge>
            )}
          </span>
        }
        description="All requests submitted from this client. Staff owns status and follow-up."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {detail.inquiries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inquiries yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.inquiries.map((inquiry) => (
              <li key={inquiry.id}>
                <Link
                  href={`/admin/inquiries/${inquiry.id}`}
                  scroll={false}
                  className={cn(
                    ADMIN_LIST_TILE_HOVER,
                    "flex items-center justify-between gap-3 no-underline",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {/* Status dot */}
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        INQUIRY_STATUS_COLOR[inquiry.status] ?? "bg-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {inquiry.contact_name || "Unnamed contact"}
                        {inquiry.company ? (
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {inquiry.company}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          inquiry.event_location,
                          relativeTime(inquiry.created_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <AdminCommercialStatusBadge kind="inquiry" status={inquiry.status} />
                    <ChevronRight className="size-4 text-muted-foreground/50" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {detail.inquiries.length > 0 && (
          <div className="mt-3 border-t border-border/35 pt-3">
            <Button size="sm" variant="outline" className={cn("rounded-xl text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
              <Link href={`/admin/inquiries?client_user_id=${encodeURIComponent(id)}`} scroll={false}>
                View all in Inquiries →
              </Link>
            </Button>
          </div>
        )}
      </DashboardSectionCard>

      {/* ── Saved talent shortlist ───────────────────────────────── */}
      <div id="saved" className="scroll-mt-20">
        <DashboardSectionCard
          title={
            <span className="flex items-center gap-2">
              <Bookmark className="size-4 text-muted-foreground" aria-hidden />
              Saved talent
              {detail.savedTalent.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[11px]">
                  {detail.savedTalent.length}
                </Badge>
              )}
            </span>
          }
          description="Profiles this client shortlisted. Helps staff understand preferences."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          {detail.savedTalent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved talent yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detail.savedTalent.map((row) =>
                row.talent ? (
                  <Button
                    key={row.talent_profile_id}
                    size="sm"
                    variant="outline"
                    className={cn("h-8 rounded-xl px-3 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
                    asChild
                  >
                    <Link href={`/admin/talent/${row.talent.id}`} scroll={false}>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {row.talent.profile_code}
                      </span>
                      {row.talent.display_name ? (
                        <span className="ml-1.5">{row.talent.display_name}</span>
                      ) : null}
                    </Link>
                  </Button>
                ) : (
                  <Badge key={row.talent_profile_id} variant="outline" className="text-[11px] text-muted-foreground">
                    Deleted profile
                  </Badge>
                ),
              )}
            </div>
          )}
        </DashboardSectionCard>
      </div>

      {/* ── Linked accounts ─────────────────────────────────────── */}
      <div id="client-locations" className="scroll-mt-20">
        <DashboardSectionCard
          title={
            <span className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              Linked accounts
              {linkedAccounts.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[11px]">
                  {linkedAccounts.length}
                </Badge>
              )}
            </span>
          }
          description="Work Locations (villas, venues, brands) attached via this client's inquiries."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          {linkedAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts linked yet. They appear here once attached to an inquiry.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {linkedAccounts.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant="outline"
                  className={cn("h-8 rounded-xl px-3 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
                  asChild
                >
                  <Link href={`/admin/accounts/${a.id}`} scroll={false}>
                    {a.name}
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </DashboardSectionCard>
      </div>

      {/* ── Bookings ─────────────────────────────────────────────── */}
      {nBookings > 0 && (
        <div id="client-bookings" className="scroll-mt-20">
          <DashboardSectionCard
            title={
              <span className="flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" aria-hidden />
                Bookings
                <Badge variant="secondary" className="ml-1 text-[11px]">
                  {nBookings}
                </Badge>
              </span>
            }
            description="Confirmed and in-progress jobs where this user is the client."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <ul className="space-y-2">
              {(clientBookings ?? []).map((b) => (
                <li key={b.id as string}>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    scroll={false}
                    className={cn(
                      ADMIN_LIST_TILE_HOVER,
                      "flex items-center justify-between gap-3 no-underline",
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          BOOKING_STATUS_COLOR[b.status as string] ?? "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {b.title as string}
                        </p>
                        <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                          {(b.status as string).replace(/_/g, " ")}
                          {b.updated_at ? ` · ${relativeTime(b.updated_at as string)}` : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardSectionCard>
        </div>
      )}

      <AdminFutureWorkspaceSlot />
    </div>
  );
}
