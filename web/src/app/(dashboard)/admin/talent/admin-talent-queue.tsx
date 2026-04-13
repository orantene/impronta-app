"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import { AdminTalentBulkBar } from "@/app/(dashboard)/admin/talent/admin-talent-bulk-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const WORKFLOW_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "muted" | "success" | "outline" }
> = {
  draft: { label: "Draft", variant: "muted" },
  submitted: { label: "Submitted", variant: "secondary" },
  under_review: { label: "Under review", variant: "secondary" },
  approved: { label: "Approved", variant: "success" },
  hidden: { label: "Hidden", variant: "muted" },
  archived: { label: "Archived", variant: "muted" },
};

const VISIBILITY_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "muted" | "success" | "outline" }
> = {
  public: { label: "Public", variant: "success" },
  hidden: { label: "Hidden", variant: "muted" },
  private: { label: "Private", variant: "secondary" },
};

const ACCOUNT_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "muted" | "success" | "outline" }
> = {
  active: { label: "Active", variant: "success" },
  suspended: { label: "Suspended", variant: "outline" },
  registered: { label: "Registered", variant: "muted" },
  onboarding: { label: "Onboarding", variant: "secondary" },
};

export type AdminTalentQueueRow = {
  id: string;
  user_id: string | null;
  profile_code: string;
  display_name: string | null;
  workflow_status: string;
  visibility: string;
  membership_tier: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at?: string | null;
  deleted_at: string | null;
  phone: string | null;
  profile_completeness_score: number;
  pending_media_count: number;
  primary_talent_type: string | null;
  residence_city_label: string | null;
  residence_country_label: string | null;
  profiles?: {
    display_name: string | null;
    app_role: string | null;
    account_status: string | null;
  } | null;
};

export function AdminTalentQueue({
  rows,
  page,
  pageSize,
  totalCount,
  totalPages,
  baseHref,
  emptyHint,
}: {
  rows: AdminTalentQueueRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  baseHref: string;
  emptyHint?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean, visibleIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const visibleIds = useMemo(
    () => rows.filter((r) => !r.deleted_at).map((r) => r.id),
    [rows],
  );

  const allVisibleChecked =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const goHub = (id: string) => {
    router.push(`/admin/talent/${id}`);
  };

  const prefetchHub = (id: string) => {
    router.prefetch(`/admin/talent/${id}`);
  };

  const completenessPct = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-4">
      <AdminTalentBulkBar
        selectedIds={[...selected]}
        onClear={() => setSelected(new Set())}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium tabular-nums text-muted-foreground">
          Showing {pageStart}-{pageEnd} of {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? <Link href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}page=${page - 1}`} scroll={false}>Previous</Link> : <span>Previous</span>}
          </Button>
          <p className="text-xs font-medium text-muted-foreground">
            Page {page} / {totalPages}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("rounded-xl", ADMIN_OUTLINE_CONTROL_CLASS)}
            disabled={page >= totalPages}
            asChild={page < totalPages}
          >
            {page < totalPages ? <Link href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}page=${page + 1}`} scroll={false}>Next</Link> : <span>Next</span>}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] px-4 py-8 text-center text-sm text-muted-foreground">
          <p>No profiles match this view.</p>
          {emptyHint}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gradient-to-b from-muted/35 to-muted/10">
              <tr className="border-b border-border/45 text-left">
                <th className="w-10 px-2 py-3.5">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={(e) => toggleAllVisible(e.target.checked, visibleIds)}
                    className="size-4 rounded border-border accent-[var(--impronta-gold)]"
                    aria-label="Select all visible"
                  />
                </th>
                <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Code
                </th>
                <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Name
                </th>
                <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:table-cell">
                  Type
                </th>
                <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
                  Location
                </th>
                <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Workflow
                </th>
                <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">
                  Media
                </th>
                <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">
                  Complete
                </th>
                <th className="hidden px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
                  Account
                </th>
                <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/25">
              {rows.map((row) => {
                const wf = WORKFLOW_BADGE[row.workflow_status] ?? {
                  label: row.workflow_status,
                  variant: "outline" as const,
                };
                const accRaw = row.profiles?.account_status ?? "";
                const acc =
                  ACCOUNT_BADGE[accRaw] ?? {
                    label: accRaw || "—",
                    variant: "outline" as const,
                  };
                const pct = completenessPct(row.profile_completeness_score);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer transition-[background-color,box-shadow] duration-150",
                      "hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-[inset_3px_0_0_0_var(--impronta-gold)]",
                    )}
                    onMouseEnter={() => prefetchHub(row.id)}
                    onFocus={() => prefetchHub(row.id)}
                    onClick={() => goHub(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goHub(row.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open talent hub for ${row.display_name?.trim() || row.profile_code}`}
                  >
                    <td className="px-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {!row.deleted_at ? (
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggle(row.id, e.target.checked)}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="size-4 rounded border-border accent-[var(--impronta-gold)]"
                          aria-label={`Select ${row.display_name ?? row.profile_code}`}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[12px] text-muted-foreground">
                        {row.profile_code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="max-w-[260px] truncate font-display text-[15px] font-medium tracking-tight text-foreground">
                        {row.display_name ?? (
                          <span className="text-muted-foreground italic">Unnamed</span>
                        )}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.is_featured ? (
                          <Badge
                            variant="outline"
                            className="gap-0.5 border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/10 text-[10px] text-[var(--impronta-gold)]"
                          >
                            <Star className="size-3 fill-[var(--impronta-gold)]/25" aria-hidden />
                            Featured
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="border-border/45 text-[10px] text-muted-foreground">
                          {VISIBILITY_BADGE[row.visibility]?.label ?? row.visibility}
                        </Badge>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 text-muted-foreground xl:table-cell">
                      {row.primary_talent_type ?? "—"}
                    </td>
                    <td className="hidden max-w-[160px] px-4 py-3.5 text-xs text-muted-foreground lg:table-cell">
                      {[row.residence_city_label, row.residence_country_label].filter(Boolean).join(", ") ||
                        "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={wf.variant}>{wf.label}</Badge>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      {row.pending_media_count > 0 ? (
                        <Badge variant="secondary" className="border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100">
                          {row.pending_media_count} pending
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Clear</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-[72px] overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pct >= 65 ? "bg-emerald-500/80" : "bg-muted-foreground/35",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 lg:table-cell">
                      {row.user_id ? <Badge variant={acc.variant}>{acc.label}</Badge> : <span className="text-xs text-muted-foreground">No login</span>}
                    </td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">
                        <TooltipProvider>
                          <Tooltip delayDuration={250}>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                className={cn(
                                  "h-9 w-9 rounded-xl border-[var(--impronta-gold)]/35 bg-background/90 text-[var(--impronta-gold)] shadow-sm",
                                  "hover:bg-[var(--impronta-gold)]/10 hover:text-[var(--impronta-gold)]",
                                )}
                                asChild
                              >
                                <Link href={`/admin/talent/${row.id}`} scroll={false} aria-label="Open talent hub">
                                  <ChevronRight className="size-4" aria-hidden />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Open hub</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {row.user_id ? (
                          <TooltipProvider>
                            <Tooltip delayDuration={250}>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={cn("h-9 px-3 text-xs font-medium", ADMIN_OUTLINE_CONTROL_CLASS)}
                                  asChild
                                >
                                  <Link href={`/admin/talent/${row.id}/account`} scroll={false}>
                                    Account
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Account &amp; login</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
