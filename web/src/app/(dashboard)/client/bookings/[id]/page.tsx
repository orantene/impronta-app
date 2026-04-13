import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, MapPin, MessageSquare } from "lucide-react";
import { ClientBookingStatusBadge, ClientPaymentSummary } from "@/components/client/client-booking-badges";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { Button } from "@/components/ui/button";
import {
  clientBookingScheduleSummary,
  formatClientBookingWhen,
  formatClientEventDateOnly,
} from "@/lib/client-booking-copy";
import { loadClientBookingDetail } from "@/lib/client-bookings-data";
import { ADMIN_SECTION_TITLE_CLASS, CLIENT_PAGE_STACK_MEDIUM } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default async function ClientBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadClientBookingDetail(id);

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return (
      <p className="text-sm text-muted-foreground">
        {result.reason === "no_user" ? "Sign in to view this booking." : "Unable to load this booking."}
      </p>
    );
  }

  const { booking, lines } = result;
  const fromRequest = Boolean(booking.source_inquiry_id);
  const scheduleLine = clientBookingScheduleSummary(booking.starts_at, booking.ends_at, booking.event_date);

  return (
    <div className={CLIENT_PAGE_STACK_MEDIUM}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-4">
        <Button variant="outline" size="sm" className="h-9 border-border/60" asChild>
          <Link href="/client/bookings" scroll={false}>
            ← All bookings
          </Link>
        </Button>
        {fromRequest ? (
          <Button variant="outline" size="sm" className="h-9 border-border/60 text-xs" asChild>
            <Link href={`/client/requests/${booking.source_inquiry_id}`} scroll={false}>
              Related request
            </Link>
          </Button>
        ) : null}
      </div>

      <div
        className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3 text-sm text-muted-foreground border-l-[3px] border-l-[var(--impronta-gold)]/45"
        role="region"
        aria-label="About this booking"
      >
        {fromRequest ? (
          <p className="flex gap-2">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-foreground/60" aria-hidden />
            <span>
              This job is tied to <span className="font-medium text-foreground">a request you sent us</span>. Details
              here are what we&apos;re comfortable sharing on your side—reach out if something looks off.
            </span>
          </p>
        ) : (
          <p>
            This job was <span className="font-medium text-foreground">shared with your account</span> by the agency.
            You&apos;ll see dates, people, and notes meant for you—not our internal planning.
          </p>
        )}
      </div>

      <div className="min-w-0 space-y-3 border-b border-border/40 pb-6">
        <h2 className={cn(ADMIN_SECTION_TITLE_CLASS, "text-xl tracking-tight text-foreground")}>{booking.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ClientBookingStatusBadge status={booking.status} />
        </div>
        <div className="rounded-lg border border-border/45 bg-card/30 px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment to the agency</p>
          <ClientPaymentSummary
            className="mt-1"
            size="md"
            paymentStatus={booking.payment_status}
            paymentMethod={booking.payment_method}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Questions about invoices or timing? Reach out through your usual agency contact.
          </p>
        </div>
      </div>

      <DashboardSectionCard
        title="When & where"
        description={
          scheduleLine
            ? scheduleLine
            : booking.venue_name || booking.venue_location_text
              ? null
              : "We’ll add dates and location as they’re confirmed."
        }
      >
        <ul className="space-y-3 text-sm">
          {booking.starts_at ? (
            <li className="flex gap-3">
              <CalendarRange className="mt-0.5 size-4 shrink-0 text-foreground/55" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Start</p>
                <p className="text-muted-foreground">{formatClientBookingWhen(booking.starts_at)}</p>
              </div>
            </li>
          ) : null}
          {booking.ends_at ? (
            <li className="flex gap-3">
              <CalendarRange className="mt-0.5 size-4 shrink-0 text-foreground/55" aria-hidden />
              <div>
                <p className="font-medium text-foreground">End</p>
                <p className="text-muted-foreground">{formatClientBookingWhen(booking.ends_at)}</p>
              </div>
            </li>
          ) : null}
          {booking.event_date ? (
            <li className="flex gap-3">
              <CalendarRange className="mt-0.5 size-4 shrink-0 text-foreground/55" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Event day</p>
                <p className="text-muted-foreground">{formatClientEventDateOnly(booking.event_date) ?? booking.event_date}</p>
              </div>
            </li>
          ) : null}
          {!booking.starts_at && !booking.ends_at && !booking.event_date ? (
            <li className="text-muted-foreground">Dates aren’t set on your view yet.</li>
          ) : null}
          {booking.venue_name || booking.venue_location_text ? (
            <li className="flex gap-3 border-t border-border/35 pt-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-foreground/55" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Place</p>
                <p className="text-muted-foreground">
                  {[booking.venue_name, booking.venue_location_text].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ) : null}
        </ul>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="People"
        description={
          lines.length > 0
            ? "Talent we’re holding for this job. Names reflect what we’ve shared with you."
            : "We haven’t listed anyone on your view yet."
        }
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Check back later, or ask your contact if you expect someone specific.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((row, i) => {
              const code = row.profile_code_snapshot?.trim();
              const name = row.talent_name_snapshot?.trim();
              const primary = name || code || "Talent";
              const secondary = name && code ? code : null;

              return (
                <li
                  key={`${row.talent_profile_id ?? "x"}-${code ?? i}-${i}`}
                  className="rounded-xl border border-border/50 bg-card/35 px-4 py-3"
                >
                  <p className="font-medium text-foreground">{primary}</p>
                  {secondary ? <p className="text-xs text-muted-foreground">Reference: {secondary}</p> : null}
                  {row.role_label?.trim() ? (
                    <p className="mt-1 text-sm text-muted-foreground">Role: {row.role_label}</p>
                  ) : null}
                  {row.talent_profile_id && code ? (
                    <p className="mt-2">
                      <Link
                        href={`/t/${code}`}
                        className="text-sm text-[var(--impronta-gold)] underline-offset-2 hover:underline"
                        scroll={false}
                      >
                        View directory profile
                      </Link>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Message for you"
        description="Anything we wrote specifically for your side of this job."
      >
        {booking.client_summary?.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{booking.client_summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No message here yet.</p>
        )}
      </DashboardSectionCard>
    </div>
  );
}
