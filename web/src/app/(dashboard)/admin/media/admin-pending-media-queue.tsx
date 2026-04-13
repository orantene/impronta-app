"use client";

import Link from "next/link";
import { Images } from "lucide-react";
import { useState, useTransition } from "react";
import { staffSetMediaApprovalState } from "@/app/(dashboard)/admin/admin-media-actions";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import type { AdminPendingMediaRow } from "@/lib/dashboard/admin-dashboard-data";
import { cn } from "@/lib/utils";

type Feedback = { text: string; kind: "success" | "error" };

export function AdminPendingMediaQueue({
  initialRows,
}: {
  initialRows: AdminPendingMediaRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <DashboardEmptyState
        title="No pending uploads"
        description="New talent uploads will appear here as soon as they need staff review."
        icon={<Images className="size-6" aria-hidden />}
        className="border-border/50 bg-muted/[0.03]"
      />
    );
  }

  const talentCount = new Set(rows.map((row) => row.owner_talent_profile_id)).size;

  return (
    <div className="space-y-4">
      {feedback ? (
        <p
          role="status"
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            feedback.kind === "success" &&
              "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-950 dark:text-emerald-100",
            feedback.kind === "error" &&
              "border-destructive/30 bg-destructive/[0.06] text-destructive",
          )}
        >
          {feedback.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{rows.length}</span> pending asset
          {rows.length === 1 ? "" : "s"}
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground">{talentCount}</span> talent profile
          {talentCount === 1 ? "" : "s"} affected
        </span>
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "group rounded-2xl border border-border/60 bg-card/30 p-4 shadow-sm",
              "transition-all duration-200",
              "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-sm font-medium tracking-wide text-foreground">
                  {row.talent?.display_name ?? row.talent?.profile_code ?? "Talent"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.talent?.profile_code ?? "No code"} · {row.variant_kind}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 border border-border/50 bg-muted/30 font-medium"
              >
                {row.approval_state}
              </Badge>
            </div>

            <div
              className={cn(
                "mt-3 overflow-hidden rounded-xl border border-border/50 bg-muted/20",
                "ring-0 ring-transparent transition-[box-shadow,border-color] duration-200",
                "group-hover:border-[var(--impronta-gold-border)]/40 group-hover:ring-1 group-hover:ring-[var(--impronta-gold)]/15",
              )}
            >
              {row.publicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.publicUrl}
                  alt={row.talent?.display_name ?? "Pending media"}
                  className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  Preview unavailable
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Uploaded {new Date(row.created_at).toLocaleString()}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending}
                className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-xl border-0")}
                onClick={() => {
                  setFeedback(null);
                  setActiveId(row.id);
                  startTransition(async () => {
                    const result = await staffSetMediaApprovalState(
                      row.owner_talent_profile_id,
                      row.id,
                      "approved",
                    );
                    setActiveId(null);
                    if (result.error) {
                      setFeedback({ text: result.error, kind: "error" });
                      return;
                    }
                    setRows((current) => current.filter((item) => item.id !== row.id));
                    setFeedback({
                      text: "Media approved and removed from the pending queue.",
                      kind: "success",
                    });
                  });
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                className="rounded-xl border-border/70"
                onClick={() => {
                  setFeedback(null);
                  setActiveId(row.id);
                  startTransition(async () => {
                    const result = await staffSetMediaApprovalState(
                      row.owner_talent_profile_id,
                      row.id,
                      "rejected",
                    );
                    setActiveId(null);
                    if (result.error) {
                      setFeedback({ text: result.error, kind: "error" });
                      return;
                    }
                    setRows((current) => current.filter((item) => item.id !== row.id));
                    setFeedback({
                      text: "Media rejected and removed from the pending queue.",
                      kind: "success",
                    });
                  });
                }}
              >
                Reject
              </Button>
              <Button size="sm" variant="secondary" className="rounded-xl" asChild>
                <Link href={`/admin/talent/${row.owner_talent_profile_id}/media`} scroll={false}>
                  Open talent media
                </Link>
              </Button>
            </div>
            {activeId === row.id ? (
              <p className="mt-3 text-xs font-medium text-[var(--impronta-gold)]">
                Saving moderation decision…
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Talent: {row.talent?.display_name ?? row.talent?.profile_code ?? "Unknown"} · Review
                affects the agency-approved portfolio only.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
