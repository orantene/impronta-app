"use client";

import Link from "next/link";
import { Eye, ExternalLink } from "lucide-react";
import { SaveStatePill } from "@/components/talent/save-state-pill";
import { cn } from "@/lib/utils";

export type TalentStatusBannerProps = {
  completionScore: number;
  workflowStatus: string;
  visibility: string;
  previewHref: string;
  livePageAvailable: boolean;
};

function CompletionRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color =
    value >= 80
      ? "text-emerald-400"
      : value >= 50
        ? "text-[var(--impronta-gold)]"
        : "text-amber-400";

  return (
    <div
      className="relative size-12 shrink-0 lg:size-14"
      aria-label={`${value}% complete`}
    >
      <svg className="h-full w-full -rotate-90" viewBox="0 0 48 48" aria-hidden>
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-white/8"
        />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(color, "transition-[stroke-dashoffset] duration-700 ease-out")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold tabular-nums text-foreground lg:text-sm">
        {value}
      </span>
    </div>
  );
}

function workflowBadge(status: string) {
  const label = status.replace(/_/g, " ");
  switch (status) {
    case "draft":
      return { label, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "hidden":
      return { label, className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
    case "submitted":
    case "under_review":
      return {
        label: status === "submitted" ? "Submitted" : "Under review",
        className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      };
    case "approved":
      return { label: "Approved", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    default:
      return { label, className: "bg-muted/30 text-muted-foreground border-border/40" };
  }
}

function visibilityBadge(vis: string) {
  switch (vis) {
    case "public":
      return { label: "Public", icon: Eye, className: "text-emerald-400" };
    case "private":
      return { label: "Private", icon: Eye, className: "text-amber-400" };
    default:
      return { label: "Hidden", icon: Eye, className: "text-zinc-500" };
  }
}

export function TalentStatusBanner({
  completionScore,
  workflowStatus,
  visibility,
  previewHref,
  livePageAvailable,
}: TalentStatusBannerProps) {
  const wf = workflowBadge(workflowStatus);
  const vis = visibilityBadge(visibility);

  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/50 bg-gradient-to-br from-card/90 via-card/70 to-card/40 px-4 py-3.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.2)] backdrop-blur-sm sm:rounded-2xl sm:py-3 lg:gap-4 lg:px-6 lg:py-4 xl:px-7">
      <CompletionRing value={completionScore} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:gap-2">
        {/* Top row: workflow + visibility */}
        <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize",
              wf.className,
            )}
          >
            {wf.label}
          </span>
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", vis.className)}>
            <vis.icon className="size-3" />
            {vis.label}
          </span>
        </div>
        {/* Bottom row: save state */}
        <SaveStatePill />
      </div>

      <Link
        href={previewHref}
        target="_blank"
        rel="noreferrer"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-background/50 text-muted-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/30 hover:bg-[var(--impronta-gold)]/10 hover:text-foreground lg:size-12 lg:rounded-2xl"
        title={livePageAvailable ? "View live profile" : "Preview profile"}
      >
        <ExternalLink className="size-4 lg:size-[1.125rem]" aria-hidden />
      </Link>
    </div>
  );
}
