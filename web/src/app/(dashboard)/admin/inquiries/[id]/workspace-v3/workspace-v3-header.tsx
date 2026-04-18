import Link from "next/link";
import { ArrowLeft, CalendarRange, MessageSquare, Users } from "lucide-react";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { Button } from "@/components/ui/button";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import type { PrimaryAction } from "@/lib/inquiry/inquiry-workspace-types";

/**
 * Admin Workspace V3 — sticky header (§5.4).
 *
 * Server component: pure presentation over already-resolved engine fields.
 * The primary-action button is a *form-less* visual here — real submission
 * flows come from M4 rail panels (Convert modal, etc). When there is no
 * href (e.g. "Convert to booking" handled in the Booking panel), we render
 * a disabled chip with a hint to open the panel. This keeps M3 strictly a
 * shell — we do not bundle M4.5's convert modal into M3.
 */
export function WorkspaceV3Header({
  inquiryId,
  title,
  rawStatus,
  primaryAction,
  chips,
}: {
  inquiryId: string;
  title: string;
  rawStatus: string;
  primaryAction: PrimaryAction;
  chips: {
    primaryCoordinatorName: string | null;
    unreadCount: number;
    participantCount: number;
    bookingLinked: boolean;
  };
}) {
  return (
    <header
      data-testid="workspace-v3-header"
      className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border/30 bg-background/90 px-4 py-3 backdrop-blur"
    >
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/admin/inquiries"
          scroll={false}
          className="flex items-center gap-1 hover:text-[var(--impronta-gold)] hover:underline underline-offset-4"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Inquiries
        </Link>
        <span aria-hidden className="opacity-40">·</span>
        <span className="truncate font-mono opacity-60">{inquiryId.slice(0, 8)}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium text-foreground">
          {title}
        </h1>
        <AdminCommercialStatusBadge kind="inquiry" status={rawStatus} />
        <PrimaryActionButton action={primaryAction} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Chip>
          <Users className="size-3" aria-hidden />
          {chips.primaryCoordinatorName
            ? `Lead: ${chips.primaryCoordinatorName}`
            : "No lead coordinator"}
        </Chip>
        <Chip>
          <MessageSquare className="size-3" aria-hidden />
          {chips.unreadCount > 0 ? `${chips.unreadCount} unread` : "No unread"}
        </Chip>
        <Chip>
          <Users className="size-3" aria-hidden />
          {chips.participantCount === 1
            ? "1 participant"
            : `${chips.participantCount} participants`}
        </Chip>
        {chips.bookingLinked ? (
          <Chip>
            <CalendarRange className="size-3" aria-hidden />
            Booking linked
          </Chip>
        ) : null}
      </div>
    </header>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-foreground/5 px-2 py-0.5">
      {children}
    </span>
  );
}

function PrimaryActionButton({ action }: { action: PrimaryAction }) {
  // Visual-only rendering. M3 deliberately does not wire convert/override/etc.
  // from the header — those submission flows land in M4 rail panels. If a
  // primary action has an `href` (e.g. "View booking", "Review offer"), we
  // link; otherwise render a disabled hint button so the status is visible
  // without duplicating engine work.
  const isGold = action.variant === "gold";
  const className = cn(
    isGold ? LUXURY_GOLD_BUTTON_CLASS : "",
    "whitespace-nowrap",
  );
  if (action.href && !action.disabled) {
    return (
      <Button asChild size="sm" variant={isGold ? "default" : "outline"} className={className}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant={isGold ? "default" : "outline"}
      className={className}
      disabled
      title={action.disabledReason ?? "Available from the rail panels."}
    >
      {action.label}
    </Button>
  );
}
