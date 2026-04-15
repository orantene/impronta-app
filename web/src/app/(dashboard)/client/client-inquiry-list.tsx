import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import {
  formatInquiryStatus,
} from "@/lib/inquiries";
import type { ClientInquiryRow, InquiryTalentRow } from "@/lib/client-dashboard-data";
import { getProgressStep } from "@/lib/inquiry/inquiry-progress";
import { normalizeWorkspaceStatus } from "@/lib/inquiry/inquiry-workspace-status";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { CheckCircle2, FileText } from "lucide-react";

const TOTAL_STEPS = 5;

function ProgressDots({ step, isTerminal, terminalLabel }: { step: number; isTerminal: boolean; terminalLabel?: string }) {
  if (isTerminal) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
        {terminalLabel ?? "Closed"}
      </span>
    );
  }
  if (step === TOTAL_STEPS) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--impronta-gold)]/30 bg-[var(--impronta-gold)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--impronta-gold)]">
        <CheckCircle2 className="size-3" aria-hidden />
        Booked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex items-center gap-[3px]">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "inline-block size-[5px] rounded-full",
              i < step ? "bg-foreground/60" : "bg-border",
            )}
          />
        ))}
      </span>
      <span className="text-[11px] text-muted-foreground">
        Step {step} of {TOTAL_STEPS}
      </span>
    </span>
  );
}

function NextActionPill({ status }: { status: string }) {
  const ws = normalizeWorkspaceStatus(status);
  if (ws === "offer_pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--impronta-gold)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--impronta-gold)]" />
        Your review needed
      </span>
    );
  }
  if (ws === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        Confirming with all parties
      </span>
    );
  }
  if (ws === "submitted") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        Agency reviewing your request
      </span>
    );
  }
  if (ws === "reviewing" || ws === "coordination") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        Agency preparing offer
      </span>
    );
  }
  return null;
}

export function ClientInquiryList({
  inquiries,
  eventTypeMap,
}: {
  inquiries: ClientInquiryRow[];
  eventTypeMap: Map<string, string>;
  agencyWhatsAppNumber?: string | undefined;
}) {
  if (inquiries.length === 0) {
    return (
      <DashboardEmptyState
        accent
        icon={<FileText className="size-6" aria-hidden />}
        title="No requests yet"
        description="Add talent to your cart from the directory and submit a brief when you’re ready — it will show up here with status updates."
        actions={
          <Button asChild className={cn(LUXURY_GOLD_BUTTON_CLASS)}>
            <Link href="/directory" scroll={false}>
              Browse directory
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="relative space-y-0 border-l border-border/40 pl-5">
      {inquiries.map((inquiry) => {
        const selectedTalent = (
          (inquiry.inquiry_talent ?? []) as InquiryTalentRow[]
        )
          .map((row) => row.talent_profiles)
          .filter(Boolean) as {
          profile_code: string;
          display_name: string | null;
        }[];

        const ws = normalizeWorkspaceStatus(inquiry.status);
        const progress = getProgressStep(ws);

        const eventSummary = [
          inquiry.event_type_id ? eventTypeMap.get(inquiry.event_type_id) ?? null : null,
          inquiry.event_date,
          inquiry.event_location,
          inquiry.quantity ? `${inquiry.quantity} requested` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={inquiry.id} className="relative pb-8 last:pb-0">
            <span
              className={cn(
                "absolute -left-[21px] top-3 size-2.5 rounded-full border-2 border-background",
                ws === "offer_pending"
                  ? "bg-[var(--impronta-gold)] ring-2 ring-[var(--impronta-gold)]/30"
                  : ws === "booked"
                    ? "bg-[var(--impronta-gold)]"
                    : progress.isTerminal
                      ? "bg-muted-foreground/40"
                      : "bg-[var(--impronta-gold)]",
              )}
              aria-hidden
            />
            <div className={cn(
              "rounded-2xl border bg-card/45 px-4 py-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.5)]",
              ws === "offer_pending"
                ? "border-[var(--impronta-gold)]/35 hover:border-[var(--impronta-gold)]/55"
                : "border-border/55 hover:border-[var(--impronta-gold-border)]/40",
            )}>
              {/* Card header: progress + status + open CTA */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProgressDots step={progress.step} isTerminal={progress.isTerminal} terminalLabel={progress.terminalLabel} />
                    <NextActionPill status={inquiry.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Submitted {new Date(inquiry.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}updated {new Date(inquiry.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={ws === "offer_pending" ? "default" : "outline"}
                  className={cn(ws === "offer_pending" && LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
                  asChild
                >
                  <Link href={`/client/inquiries/${inquiry.id}`} scroll={false}>
                    {ws === "offer_pending" ? "Review offer" : "Open"}
                  </Link>
                </Button>
              </div>

              {/* Progress message */}
              <p className="mt-3 text-sm font-medium text-foreground">{progress.message}</p>

              {/* Event + request summary */}
              {(eventSummary || inquiry.raw_ai_query) ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {eventSummary || inquiry.raw_ai_query}
                </p>
              ) : null}

              {/* Talent chips */}
              {selectedTalent.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {selectedTalent.map((talent) => (
                    <li key={`${inquiry.id}-${talent.profile_code}`}>
                      <Badge variant="outline" className="text-[11px]">
                        {talent.profile_code}
                        {talent.display_name ? ` · ${talent.display_name}` : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
