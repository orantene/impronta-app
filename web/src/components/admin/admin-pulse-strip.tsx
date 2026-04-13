"use client";

import Link from "next/link";
import { Images, LayoutList, MessageSquare, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminPulseCounts = {
  totalTalent: number;
  pendingTalent: number;
  openInquiries: number;
  pendingMedia: number;
  totalClients: number;
};

const chipBase =
  "inline-flex min-h-8 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-[border-color,background-color,box-shadow,color] duration-200 sm:min-h-9 sm:px-3 sm:text-xs";

const calm =
  "border-border/50 bg-muted/20 text-muted-foreground hover:border-[var(--impronta-gold)]/30 hover:bg-muted/35 hover:text-foreground";

function urgentClasses(kind: "amber" | "sky" | "gold", active: boolean) {
  if (!active) return calm;
  switch (kind) {
    case "amber":
      return "border-amber-500/45 bg-amber-500/[0.12] text-amber-950 shadow-sm dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-50";
    case "sky":
      return "border-sky-500/45 bg-sky-500/[0.11] text-sky-950 shadow-sm dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-50";
    case "gold":
      return "border-[var(--impronta-gold-border)]/55 bg-[var(--impronta-gold)]/[0.12] text-foreground shadow-sm ring-1 ring-[var(--impronta-gold)]/10";
    default:
      return calm;
  }
}

export function AdminPulseStrip({ counts }: { counts: AdminPulseCounts | null }) {
  if (!counts) {
    return (
      <div
        className="flex min-w-0 items-center"
        role="status"
        aria-label="Agency metrics unavailable"
      >
        <span className={cn(chipBase, calm, "cursor-default opacity-80")}>Metrics unavailable</span>
      </div>
    );
  }

  const {
    totalTalent,
    pendingTalent,
    openInquiries,
    pendingMedia,
    totalClients,
  } = counts;

  const items = [
    {
      href: "/admin/talent",
      label: "Talent",
      value: totalTalent,
      icon: Users,
      urgent: false,
      kind: "amber" as const,
    },
    {
      href: "/admin/talent?status=under_review",
      label: "Review",
      value: pendingTalent,
      icon: LayoutList,
      urgent: pendingTalent > 0,
      kind: "amber" as const,
    },
    {
      href: "/admin/media",
      label: "Pending Media",
      value: pendingMedia,
      icon: Images,
      urgent: pendingMedia > 0,
      kind: "gold" as const,
    },
    {
      href: "/admin/clients",
      label: "Clients",
      value: totalClients,
      icon: UserRound,
      urgent: false,
      kind: "gold" as const,
    },
    {
      href: "/admin/inquiries",
      label: "Inquiries",
      value: openInquiries,
      icon: MessageSquare,
      urgent: openInquiries > 0,
      kind: "sky" as const,
    },
  ];

  return (
    <nav
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:justify-center xl:flex-nowrap xl:gap-2"
      aria-label="Agency workload snapshot"
    >
      {items.map(({ href, label, value, icon: Icon, urgent, kind }) => (
        <Link
          key={label}
          href={href}
          scroll={false}
          className={cn(
            chipBase,
            urgentClasses(kind, urgent),
            !urgent && "hover:shadow-sm",
          )}
        >
          <Icon className="size-3.5 shrink-0 opacity-85 sm:size-4" aria-hidden />
          <span className="whitespace-nowrap">
            <span className={urgent ? "opacity-95" : "text-muted-foreground"}>{label}</span>
            <span
              className={cn(
                "mx-0.5",
                urgent ? "opacity-50" : "text-muted-foreground/45",
              )}
            >
              ·
            </span>
            <span className="tabular-nums">{value}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
