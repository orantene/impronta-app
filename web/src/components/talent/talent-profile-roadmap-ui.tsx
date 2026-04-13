"use client";

import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  FileText,
  Globe2,
  Images,
  MapPin,
  Phone,
  Tags,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icons for checklist / “next steps” rows — keep keys aligned with `buildTalentChecklist`. */
export function checklistItemIconForKey(key: string): LucideIcon {
  switch (key) {
    case "display_name":
    case "first_name":
    case "last_name":
      return UserCircle;
    case "phone":
      return Phone;
    case "gender":
      return Users;
    case "date_of_birth":
      return Calendar;
    case "origin":
      return Globe2;
    case "location":
      return MapPin;
    case "short_bio":
      return FileText;
    case "taxonomy":
      return Tags;
    case "media":
      return Images;
    case "fields_required":
    case "fields_recommended":
      return ClipboardList;
    default:
      return CircleDot;
  }
}

/** Same interaction pattern as talent “Edit sections” rows. */
export function TalentRoadmapSectionButton({
  title,
  subtitle,
  complete,
  fieldCount,
  onClick,
}: {
  title: string;
  subtitle?: string;
  complete?: boolean;
  fieldCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200",
        "border-border/40 bg-card/80 shadow-sm",
        "lg:px-5 lg:py-[1.125rem]",
        "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
        "active:scale-[0.99] motion-reduce:active:scale-100",
      )}
    >
      {complete !== undefined ? (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
            complete
              ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400",
          )}
        >
          {complete ? (
            <CheckCircle2 className="size-5" aria-hidden />
          ) : (
            <AlertCircle className="size-5" aria-hidden />
          )}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-tight text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {fieldCount !== undefined ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {fieldCount} field{fieldCount === 1 ? "" : "s"}
        </span>
      ) : null}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80"
        aria-hidden
      />
    </button>
  );
}

export function TalentRoadmapMediaCard({
  href,
  icon: Icon,
  title,
  subtitle,
  complete,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  complete?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-4 py-4 transition-all duration-200",
        "border-border/40 bg-card/80 shadow-sm",
        "lg:px-5 lg:py-[1.125rem]",
        "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
        "active:scale-[0.99] motion-reduce:active:scale-100",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground/90 ring-1 ring-border/40 dark:bg-muted/25">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {complete !== undefined ? (
        complete ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />
        ) : (
          <AlertCircle className="size-4 shrink-0 text-amber-500" aria-hidden />
        )
      ) : null}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--impronta-gold)]/80"
        aria-hidden
      />
    </Link>
  );
}
