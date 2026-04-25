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
  "border-border/50 bg-muted/20 text-muted-foreground hover:border-foreground/30 hover:bg-muted/35 hover:text-foreground";

// Phase 16 monochrome scrub. The pulse strip used to colour-code chips by
// "kind" (amber / sky / gold) — we kept the parameter so callers don't
// thrash, but every active chip now uses the same foreground emphasis.
// Urgency is conveyed by fill density + a leading dot on the consumer
// side, not by hue.
function urgentClasses(_kind: "amber" | "sky" | "gold", active: boolean) {
  if (!active) return calm;
  return "border-foreground/45 bg-foreground/[0.08] text-foreground shadow-sm ring-1 ring-foreground/10";
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
