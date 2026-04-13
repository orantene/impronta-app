import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import {
  buildInquiryWhatsAppMessage,
  buildWhatsAppHref,
  formatInquiryStatus,
} from "@/lib/inquiries";
import type { ClientInquiryRow, InquiryTalentRow } from "@/lib/client-dashboard-data";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

export function ClientInquiryList({
  inquiries,
  eventTypeMap,
  agencyWhatsAppNumber,
}: {
  inquiries: ClientInquiryRow[];
  eventTypeMap: Map<string, string>;
  agencyWhatsAppNumber: string | undefined;
}) {
  const whatsappEnabled = Boolean(agencyWhatsAppNumber && agencyWhatsAppNumber.trim().length > 0);
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

        const whatsappHref = buildWhatsAppHref(
          buildInquiryWhatsAppMessage({
            company: inquiry.company,
            contactEmail: inquiry.contact_email,
            contactName: inquiry.contact_name,
            contactPhone: inquiry.contact_phone,
            eventDate: inquiry.event_date,
            eventLocation: inquiry.event_location,
            eventTypeName: inquiry.event_type_id
              ? eventTypeMap.get(inquiry.event_type_id) ?? null
              : null,
            message: inquiry.message,
            quantity: inquiry.quantity,
            rawQuery: inquiry.raw_ai_query,
            talents: selectedTalent.map((talent, index) => ({
              id: `${inquiry.id}-${index}`,
              profileCode: talent.profile_code,
              displayName: talent.display_name,
            })),
          }),
          agencyWhatsAppNumber,
        );

        return (
          <li key={inquiry.id} className="relative pb-8 last:pb-0">
            <span
              className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-[var(--impronta-gold)]"
              aria-hidden
            />
            <div className="rounded-2xl border border-border/55 bg-card/45 px-4 py-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-[var(--impronta-gold-border)]/40 hover:shadow-[0_14px_36px_-24px_rgba(0,0,0,0.5)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    Submitted {new Date(inquiry.created_at).toLocaleString()}
                  </p>
                  {inquiry.guest_session_id ? (
                    <Badge variant="outline">Started as guest</Badge>
                  ) : (
                    <Badge variant="outline">Account inquiry</Badge>
                  )}
                  {inquiry.source_page ? (
                    <Badge variant="secondary">{inquiry.source_page}</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last updated {new Date(inquiry.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{formatInquiryStatus(inquiry.status)}</Badge>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/client/requests/${inquiry.id}`} scroll={false}>
                    View
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!whatsappEnabled}
                  title={
                    whatsappEnabled
                      ? "Open a pre-filled WhatsApp message to the agency."
                      : "WhatsApp is not configured by the agency yet."
                  }
                  asChild={whatsappEnabled}
                >
                  {whatsappEnabled ? (
                    <a href={whatsappHref} target="_blank" rel="noreferrer">
                      WhatsApp draft
                    </a>
                  ) : (
                    <span>WhatsApp draft</span>
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-muted/25 px-3 py-2.5 text-sm">
                <p className="font-medium">Request context</p>
                <p className="mt-1 text-muted-foreground">
                  {inquiry.raw_ai_query || "No raw query provided"}
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/25 px-3 py-2.5 text-sm">
                <p className="font-medium">Event details</p>
                <p className="mt-1 text-muted-foreground">
                  {[
                    inquiry.event_type_id
                      ? eventTypeMap.get(inquiry.event_type_id) ?? "Event type selected"
                      : null,
                    inquiry.event_date,
                    inquiry.event_location,
                    inquiry.quantity ? `${inquiry.quantity} requested` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No event details yet"}
                </p>
              </div>
            </div>

            {selectedTalent.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-medium">Selected talent</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {selectedTalent.map((talent) => (
                    <li key={`${inquiry.id}-${talent.profile_code}`}>
                      <Badge variant="outline">
                        {talent.profile_code}
                        {talent.display_name ? ` · ${talent.display_name}` : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {inquiry.message ? (
              <div className="mt-4">
                <p className="text-sm font-medium">Message</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {inquiry.message}
                </p>
              </div>
            ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
