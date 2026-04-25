"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ExternalLink,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plus,
  StickyNote,
  Users,
} from "lucide-react";

import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { cn } from "@/lib/utils";

/**
 * InquiryPeekDrawer — modern row-peek drawer for the inquiries queue.
 *
 * Design goals (read this before adding nested cards or extra colors):
 *
 *   1. Hierarchy through scale, not color. Title 17px → label 10.5px caps →
 *      body 13px → meta 11.5px. No more than four type sizes total.
 *
 *   2. Density through hairlines, not nested boxes. Sections are separated
 *      by border-b lines, never by white-on-white cards inside cards.
 *
 *   3. Status is the only accent. One pill, one dot. No gold trim, no rust.
 *
 *   4. Sticky footer hosts the verb. The primary action ("Send offer",
 *      "Convert to booking", whatever the status implies) is always visible
 *      without scrolling.
 *
 *   5. Spacing rhythm: 4 / 8 / 12 / 16 / 20 / 24. No magic numbers.
 *
 * The drawer is composed top-to-bottom of:
 *   header (DrawerShell)
 *     ├── statusRow         ← status pill + waiting-on chip + ⋯ menu
 *     ├── heroStrip         ← 4-cell metadata grid (date / location / talent / bookings)
 *     ├── quickActions      ← pill chips for one-click ops
 *     ├── activity section  ← last 5 events
 *     ├── talent section    ← avatar strip with approval state
 *     └── notes section     ← latest note + show-all link
 *   footer
 *     └── primary CTA + ghost "Open full page"
 */

export type InquiryPeekDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: PeekInquiry;
};

export type PeekInquiry = {
  id: string;
  inquiryNumber: string; // "#INQ-1284"
  status: PeekStatus;
  contactName: string;
  company: string | null;
  eventDate: string | null; // formatted "Apr 19, 2026"
  eventLocation: string | null;
  talentCount: number;
  bookingsCount: number;
  waitingOn: "client" | "coordinator" | "talent" | "admin" | null;
  updatedAtRelative: string; // "12m ago"
  assignedTo: string | null;
  unreadMessages: number;
  activity: PeekActivityItem[];
  talent: PeekTalentItem[];
  latestNote: PeekNote | null;
  totalNotes: number;
};

export type PeekStatus =
  | "draft"
  | "new"
  | "submitted"
  | "reviewing"
  | "coordination"
  | "offer_pending"
  | "approved"
  | "booked"
  | "rejected"
  | "expired";

export type PeekActivityItem = {
  id: string;
  at: string; // "12m ago"
  actor: string;
  verb: string; // "sent offer to", "approved", "added note"
  target?: string;
};

export type PeekTalentItem = {
  id: string;
  displayName: string;
  initials: string;
  approval: "pending" | "approved" | "declined" | "not_required";
};

export type PeekNote = {
  id: string;
  author: string;
  at: string;
  body: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Status registry — single source of truth. One label, one swatch (foreground
// + dot + soft tint), one suggested primary CTA per state.
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_REGISTRY: Record<
  PeekStatus,
  {
    label: string;
    dot: string; // raw color
    pillFg: string; // tw class
    pillBg: string; // tw class
    primaryCta: string;
  }
> = {
  draft: {
    label: "Draft",
    dot: "#9ca3af",
    pillFg: "text-zinc-700",
    pillBg: "bg-zinc-100",
    primaryCta: "Send to client",
  },
  new: {
    label: "New",
    dot: "#3b82f6",
    pillFg: "text-blue-700",
    pillBg: "bg-blue-50",
    primaryCta: "Start review",
  },
  submitted: {
    label: "Submitted",
    dot: "#3b82f6",
    pillFg: "text-blue-700",
    pillBg: "bg-blue-50",
    primaryCta: "Start review",
  },
  reviewing: {
    label: "Reviewing",
    dot: "#8b5cf6",
    pillFg: "text-violet-700",
    pillBg: "bg-violet-50",
    primaryCta: "Move to coordination",
  },
  coordination: {
    label: "Coordination",
    dot: "#8b5cf6",
    pillFg: "text-violet-700",
    pillBg: "bg-violet-50",
    primaryCta: "Send offer",
  },
  offer_pending: {
    label: "Offer pending",
    dot: "#f59e0b",
    pillFg: "text-amber-700",
    pillBg: "bg-amber-50",
    primaryCta: "Send offer",
  },
  approved: {
    label: "Approved",
    dot: "#10b981",
    pillFg: "text-emerald-700",
    pillBg: "bg-emerald-50",
    primaryCta: "Convert to booking",
  },
  booked: {
    label: "Booked",
    dot: "#10b981",
    pillFg: "text-emerald-700",
    pillBg: "bg-emerald-50",
    primaryCta: "Open booking",
  },
  rejected: {
    label: "Rejected",
    dot: "#ef4444",
    pillFg: "text-red-700",
    pillBg: "bg-red-50",
    primaryCta: "Reopen",
  },
  expired: {
    label: "Expired",
    dot: "#71717a",
    pillFg: "text-zinc-700",
    pillBg: "bg-zinc-100",
    primaryCta: "Reopen",
  },
};

const APPROVAL_DOT: Record<PeekTalentItem["approval"], string> = {
  pending: "bg-amber-400",
  approved: "bg-emerald-500",
  declined: "bg-red-500",
  not_required: "bg-zinc-300",
};

// ─────────────────────────────────────────────────────────────────────────────

export function InquiryPeekDrawer({
  open,
  onOpenChange,
  inquiry,
}: InquiryPeekDrawerProps) {
  const status = STATUS_REGISTRY[inquiry.status];

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={inquiry.contactName}
      subtitle={`${inquiry.company ?? "—"} · ${inquiry.inquiryNumber} · updated ${inquiry.updatedAtRelative}`}
      icon={MessageCircle}
      size="md"
      footer={
        <PeekFooter
          inquiry={inquiry}
          primaryLabel={status.primaryCta}
          onClose={() => onOpenChange(false)}
        />
      }
    >
      <StatusRow inquiry={inquiry} />
      <HeroStrip inquiry={inquiry} />
      <QuickActions inquiry={inquiry} />
      <ActivitySection items={inquiry.activity} inquiryId={inquiry.id} />
      <TalentSection talent={inquiry.talent} inquiryId={inquiry.id} />
      <NotesSection
        latest={inquiry.latestNote}
        total={inquiry.totalNotes}
        inquiryId={inquiry.id}
      />
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function StatusRow({ inquiry }: { inquiry: PeekInquiry }) {
  const status = STATUS_REGISTRY[inquiry.status];
  return (
    <div className="-mx-5 mb-4 flex items-center gap-2 border-b border-border/40 px-5 pb-4 lg:-mx-6 lg:px-6">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
          status.pillFg,
          status.pillBg,
        )}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: status.dot }}
          aria-hidden
        />
        {status.label}
      </span>
      {inquiry.waitingOn ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Waiting on
          <span className="text-foreground">
            {inquiry.waitingOn.charAt(0).toUpperCase() + inquiry.waitingOn.slice(1)}
          </span>
        </span>
      ) : null}
      {inquiry.unreadMessages > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
          {inquiry.unreadMessages} unread
        </span>
      ) : null}
      <div className="ml-auto">
        <button
          type="button"
          aria-label="More actions"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}

function HeroStrip({ inquiry }: { inquiry: PeekInquiry }) {
  return (
    <div className="-mx-5 mb-4 grid grid-cols-2 border-b border-border/40 px-5 pb-4 lg:-mx-6 lg:grid-cols-4 lg:px-6">
      <HeroCell
        icon={CalendarDays}
        label="Event"
        value={inquiry.eventDate ?? "—"}
      />
      <HeroCell
        icon={MapPin}
        label="Location"
        value={inquiry.eventLocation ?? "—"}
      />
      <HeroCell icon={Users} label="Talent" value={`${inquiry.talentCount}`} />
      <HeroCell
        icon={ExternalLink}
        label="Bookings"
        value={`${inquiry.bookingsCount}`}
      />
    </div>
  );
}

function HeroCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: true }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1 pr-3">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="size-3" aria-hidden />
        {label}
      </div>
      <p className="truncate text-[13px] font-semibold text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

function QuickActions({ inquiry }: { inquiry: PeekInquiry }) {
  const isAssignedToMe = !!inquiry.assignedTo; // simplified for preview
  const actions = [
    {
      label: isAssignedToMe ? "Reassign" : "Assign to me",
      icon: Users,
    },
    { label: "Change status", icon: Check },
    { label: "Add note", icon: StickyNote },
    { label: "Duplicate", icon: Plus },
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/35 hover:bg-muted/40"
        >
          <a.icon className="size-3.5 text-muted-foreground" aria-hidden />
          {a.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  href,
}: {
  title: string;
  count?: number;
  href?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
        {typeof count === "number" ? (
          <span className="ml-1.5 font-mono text-[10.5px] font-semibold text-foreground/70 tabular-nums">
            {count}
          </span>
        ) : null}
      </h3>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function ActivitySection({
  items,
  inquiryId,
}: {
  items: PeekActivityItem[];
  inquiryId: string;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-5">
      <SectionHeader
        title="Activity"
        href={`/admin/inquiries/${inquiryId}?tab=history`}
      />
      <ul className="divide-y divide-border/40 rounded-lg border border-border/40">
        {items.slice(0, 5).map((item) => (
          <li
            key={item.id}
            className="flex items-baseline gap-3 px-3 py-2.5 text-[12.5px] leading-snug"
          >
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {item.at}
            </span>
            <p className="min-w-0 flex-1 text-foreground">
              <span className="font-semibold">{item.actor}</span>{" "}
              <span className="text-muted-foreground">{item.verb}</span>
              {item.target ? (
                <>
                  {" "}
                  <span className="text-foreground">{item.target}</span>
                </>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TalentSection({
  talent,
  inquiryId,
}: {
  talent: PeekTalentItem[];
  inquiryId: string;
}) {
  if (!talent.length) return null;
  return (
    <section className="mb-5">
      <SectionHeader
        title="Talent"
        count={talent.length}
        href={`/admin/inquiries/${inquiryId}?tab=approvals`}
      />
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {talent.map((t) => (
          <div
            key={t.id}
            className="flex w-[88px] shrink-0 flex-col items-center gap-1.5 rounded-lg border border-border/40 bg-background/40 px-2 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="relative">
              <span className="flex size-9 items-center justify-center rounded-full bg-foreground/[0.06] text-[12px] font-semibold text-foreground">
                {t.initials}
              </span>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
                  APPROVAL_DOT[t.approval],
                )}
                aria-label={`Approval: ${t.approval}`}
              />
            </div>
            <p className="w-full truncate text-center text-[11.5px] font-medium text-foreground">
              {t.displayName}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotesSection({
  latest,
  total,
  inquiryId,
}: {
  latest: PeekNote | null;
  total: number;
  inquiryId: string;
}) {
  return (
    <section className="mb-2">
      <SectionHeader
        title="Notes"
        count={total}
        href={`/admin/inquiries/${inquiryId}?tab=details#notes`}
      />
      {latest ? (
        <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{latest.author}</span>
            <span className="font-mono tabular-nums">{latest.at}</span>
          </div>
          <p className="line-clamp-3 text-[12.5px] leading-relaxed text-foreground/90">
            {latest.body}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border/40 px-3 py-3 text-[12px] text-muted-foreground">
          No notes yet.
        </p>
      )}
    </section>
  );
}

function PeekFooter({
  inquiry,
  primaryLabel,
  onClose,
}: {
  inquiry: PeekInquiry;
  primaryLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`/admin/inquiries/${inquiry.id}`}
        onClick={onClose}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        Open full page
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
      >
        {primaryLabel}
      </button>
    </div>
  );
}
