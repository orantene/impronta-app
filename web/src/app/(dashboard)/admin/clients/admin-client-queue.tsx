"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminClientInquiriesPanelTrigger } from "@/components/admin/admin-client-inquiries-panel";
import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import type { AdminClientListRow } from "@/lib/dashboard/admin-dashboard-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "muted" | "success" | "outline" }
> = {
  active: { label: "Active", variant: "success" },
  suspended: { label: "Suspended", variant: "outline" },
  registered: { label: "Registered", variant: "muted" },
  onboarding: { label: "Onboarding", variant: "secondary" },
};

function getInitials(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeTime(iso: string | null): string {
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

export function AdminClientQueue({ rows }: { rows: AdminClientListRow[] }) {
  const router = useRouter();

  const go = (userId: string) => router.push(`/admin/clients/${userId}`);
  const prefetch = (userId: string) => router.prefetch(`/admin/clients/${userId}`);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] px-4 py-8 text-center text-sm text-muted-foreground">
        No clients match this view.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gradient-to-b from-muted/35 to-muted/10">
          <tr className="border-b border-border/45 text-left">
            <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Client
            </th>
            <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">
              Status
            </th>
            <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">
              Company
            </th>
            <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Requests
            </th>
            <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Saved
            </th>
            <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:table-cell">
              Last activity
            </th>
            <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/25">
          {rows.map((row) => {
            const statusKey = (row.account_status ?? "registered").toLowerCase();
            const badge = STATUS_BADGE[statusKey] ?? { label: statusKey, variant: "outline" as const };
            const phone = row.whatsapp_phone ?? row.phone;
            const isCompany = Boolean(row.company_name?.trim());

            return (
              <tr
                key={row.user_id}
                className={cn(
                  "cursor-pointer transition-[background-color,box-shadow] duration-150",
                  "hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-[inset_3px_0_0_0_var(--impronta-gold)]",
                )}
                onMouseEnter={() => prefetch(row.user_id)}
                onFocus={() => prefetch(row.user_id)}
                onClick={() => go(row.user_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go(row.user_id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open client workspace for ${row.display_name?.trim() || "Unnamed client"}`}
              >
                {/* Client name + phone + avatar */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--impronta-gold)]/12 font-display text-[13px] font-semibold text-[var(--impronta-gold)]"
                    >
                      {getInitials(row.display_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-medium tracking-tight text-foreground">
                        {row.display_name ?? (
                          <span className="italic text-muted-foreground">Unnamed</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {phone ?? "No phone"}
                      </p>
                      {/* Status pill on mobile */}
                      <div className="mt-1.5 sm:hidden">
                        <Badge variant={badge.variant} className="border-border/45 capitalize text-[10px]">
                          {badge.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td className="hidden px-4 py-3.5 sm:table-cell">
                  <Badge variant={badge.variant} className="border-border/45 capitalize">
                    {badge.label}
                  </Badge>
                  {isCompany && (
                    <p className="mt-1 text-[10px] text-muted-foreground">Business</p>
                  )}
                </td>

                {/* Company */}
                <td className="hidden max-w-[160px] px-4 py-3.5 md:table-cell">
                  <span className="truncate text-sm text-muted-foreground">
                    {row.company_name?.trim() || "—"}
                  </span>
                </td>

                {/* Requests */}
                <td className="hidden px-4 py-3.5 lg:table-cell">
                  {row.inquiriesCount > 0 ? (
                    <span className="inline-flex items-center gap-1 tabular-nums text-sm font-medium text-foreground">
                      {row.inquiriesCount}
                      <span className="text-xs text-muted-foreground">
                        {row.inquiriesCount === 1 ? "req" : "reqs"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </td>

                {/* Saved */}
                <td className="hidden px-4 py-3.5 lg:table-cell">
                  {row.savedCount > 0 ? (
                    <span className="tabular-nums text-sm font-medium text-foreground">
                      {row.savedCount}
                      <span className="ml-1 text-xs text-muted-foreground">saved</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </td>

                {/* Last activity */}
                <td className="hidden px-4 py-3.5 xl:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(row.latestInquiryAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 min-w-[3.25rem] shrink-0 px-2.5 text-xs font-medium",
                        ADMIN_OUTLINE_CONTROL_CLASS,
                      )}
                      asChild
                    >
                      <Link
                        href={`/admin/clients/${row.user_id}`}
                        scroll={false}
                        title="Go to the full client page: saved talent, assignments, bookings, and profile."
                        aria-label={`Open workspace for ${row.display_name?.trim() || "this client"}`}
                      >
                        Hub
                      </Link>
                    </Button>
                    <div onClick={(e) => e.stopPropagation()}>
                      <AdminUserEditButton
                        userId={row.user_id}
                        label="Edit"
                        className={cn(
                          "h-9 min-w-[3.25rem] shrink-0 px-2.5 text-xs font-medium",
                          ADMIN_OUTLINE_CONTROL_CLASS,
                        )}
                        title="Side panel: login & password, role, account status, company and contact fields."
                      />
                    </div>
                    <AdminClientInquiriesPanelTrigger
                      userId={row.user_id}
                      displayName={row.display_name}
                      trigger="text"
                      textLabel="Requests"
                      textButtonClassName={cn(
                        "h-9 min-w-[3.25rem] shrink-0 px-2.5 text-xs font-medium",
                        ADMIN_OUTLINE_CONTROL_CLASS,
                      )}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
