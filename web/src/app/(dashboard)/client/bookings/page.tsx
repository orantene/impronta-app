import Link from "next/link";
import { CalendarRange, MapPin, MessageSquare } from "lucide-react";
import { ClientPageHeader } from "@/app/(dashboard)/client/client-page-header";
import { ClientBookingStatusBadge, ClientPaymentSummary } from "@/components/client/client-booking-badges";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ClientDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { Button } from "@/components/ui/button";
import {
  clientBookingScheduleSummary,
  truncateClientSummary,
} from "@/lib/client-booking-copy";
import { loadClientBookings } from "@/lib/client-bookings-data";
import { CLIENT_PAGE_STACK_MEDIUM, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default async function ClientBookingsPage() {
  const result = await loadClientBookings();
  if (!result.ok) {
    if (result.reason === "load_failed") {
      return <p className="text-sm text-destructive">Bookings could not be loaded. Try again shortly.</p>;
    }
    return <ClientDashboardLoadFallback reason={result.reason} />;
  }

  const { bookings } = result;

  return (
    <div className={CLIENT_PAGE_STACK_MEDIUM}>
      <ClientPageHeader
        title="Bookings"
        subtitle="Each card is an event or engagement we’re working on with you — open one for dates, people, and the message we’ve shared on your side. Pricing and internal notes stay with our team."
        help={{
          title: "Bookings",
          items: [
            "Jobs appear here when the agency links them to your account or converts a request.",
            "Payment lines describe what you owe the agency, not third-party talent fees.",
          ],
        }}
      />

      <DashboardSectionCard title="Your jobs" description={null}>
        {bookings.length === 0 ? (
          <DashboardEmptyState
            accent
            title="No bookings yet"
            description="When we create a job from a request you sent, or share one with your account, it will show up here."
            actions={
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/client/requests" scroll={false}>
                    View your requests
                  </Link>
                </Button>
                <Button size="sm" className={cn(LUXURY_GOLD_BUTTON_CLASS)} asChild>
                  <Link href="/directory" scroll={false}>
                    Browse directory
                  </Link>
                </Button>
              </>
            }
          />
        ) : (
          <ul className="space-y-4">
            {bookings.map((b) => {
              const schedule = clientBookingScheduleSummary(b.starts_at, b.ends_at, b.event_date);
              const summaryPreview = truncateClientSummary(b.client_summary, 120);
              const fromRequest = Boolean(b.source_inquiry_id);

              return (
                <li
                  key={b.id}
                  className="rounded-2xl border border-border/55 bg-card/45 p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-[var(--impronta-gold-border)]/45 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <Link
                          href={`/client/bookings/${b.id}`}
                          className="font-display text-base font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                          scroll={false}
                        >
                          {b.title}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fromRequest ? (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="size-3.5 shrink-0 opacity-80" aria-hidden />
                              Linked to a request you sent
                            </span>
                          ) : (
                            <span>Shared with you by the agency</span>
                          )}
                        </p>
                      </div>

                      {summaryPreview ? (
                        <p className="text-sm leading-snug text-foreground/90">{summaryPreview}</p>
                      ) : null}

                      {schedule ? (
                        <p className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CalendarRange className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span>{schedule}</span>
                        </p>
                      ) : null}

                      {b.venue_name || b.venue_location_text ? (
                        <p className="flex items-start gap-2 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span>{[b.venue_name, b.venue_location_text].filter(Boolean).join(" · ")}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                      <ClientBookingStatusBadge status={b.status} />
                      <ClientPaymentSummary paymentStatus={b.payment_status} paymentMethod={b.payment_method} />
                    </div>
                  </div>

                  <div className="mt-4 border-t border-border/40 pt-3">
                    <Button variant="secondary" size="sm" className="h-8" asChild>
                      <Link href={`/client/bookings/${b.id}`} scroll={false}>
                        Open details
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DashboardSectionCard>
    </div>
  );
}
