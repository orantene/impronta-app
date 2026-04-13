import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { formatInquiryStatus, buildInquiryWhatsAppMessage, buildWhatsAppHref } from "@/lib/inquiries";
import { loadClientInquiryDetail } from "@/lib/client-inquiry-details";
import { ADMIN_SECTION_TITLE_CLASS, CLIENT_PAGE_STACK_DETAIL, CLIENT_PAGE_STACK_MEDIUM } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export default async function ClientRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadClientInquiryDetail(id);
  if (!result.ok) {
    const title =
      result.reason === "no_user"
        ? "Sign in required"
        : "Request not found";
    const description =
      result.reason === "no_user"
        ? "Please sign in to view request details."
        : "This request doesn’t exist, or you don’t have access to it.";

    return (
      <div className={cn(CLIENT_PAGE_STACK_MEDIUM, "px-4 py-10 sm:px-6")}>
        <DashboardEmptyState
          accent
          title={title}
          description={description}
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href="/client/requests" scroll={false}>
                  Back to requests
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/directory" scroll={false}>
                  Browse directory
                </Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const {
    inquiry,
    eventTypeName,
    agencyWhatsAppNumber,
    agencyContactEmail,
    resolvedDirectoryContext,
  } = result.data;
  const talents = (inquiry.inquiry_talent ?? [])
    .map((row) => row.talent_profiles)
    .filter(Boolean) as { id: string; profile_code: string; display_name: string | null }[];

  const whatsappEnabled = Boolean(agencyWhatsAppNumber && agencyWhatsAppNumber.trim().length > 0);
  const whatsappHref = whatsappEnabled
    ? buildWhatsAppHref(
        buildInquiryWhatsAppMessage({
          company: inquiry.company,
          contactEmail: inquiry.contact_email,
          contactName: inquiry.contact_name,
          contactPhone: inquiry.contact_phone,
          eventDate: inquiry.event_date,
          eventLocation: inquiry.event_location,
          eventTypeName,
          message: inquiry.message,
          quantity: inquiry.quantity,
          rawQuery: inquiry.raw_ai_query,
          talents: talents.map((talent) => ({
            id: talent.id,
            profileCode: talent.profile_code,
            displayName: talent.display_name,
          })),
        }),
        agencyWhatsAppNumber ?? null,
      )
    : null;

  return (
    <div className={CLIENT_PAGE_STACK_DETAIL}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <Button variant="outline" size="sm" className="h-9 border-border/60" asChild>
          <Link href="/client/requests" scroll={false}>
            ← All requests
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 border-border/60" asChild>
            <Link href="/directory" scroll={false}>
              New request
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 border-border/60"
            disabled={!whatsappEnabled}
            title={
              whatsappEnabled
                ? "Open a pre-filled WhatsApp message to the agency."
                : "WhatsApp is not configured by the agency yet."
            }
            asChild={whatsappEnabled}
          >
            {whatsappEnabled && whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                WhatsApp draft
              </a>
            ) : (
              <span>WhatsApp draft</span>
            )}
          </Button>
        </div>
      </div>

      <header className="min-w-0 border-b border-border/50 pb-6 sm:border-l-[3px] sm:border-l-[var(--impronta-gold)]/45 sm:pl-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={cn(ADMIN_SECTION_TITLE_CLASS, "text-lg text-foreground sm:text-xl")}>Request details</h1>
          <Badge variant="secondary">{formatInquiryStatus(inquiry.status)}</Badge>
          {inquiry.guest_session_id ? <Badge variant="outline">Started as guest</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Submitted {formatDateTime(inquiry.created_at)} · Updated {formatDateTime(inquiry.updated_at)}
        </p>
        {agencyContactEmail ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Agency contact:{" "}
            <a
              className="font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
              href={`mailto:${agencyContactEmail}`}
            >
              {agencyContactEmail}
            </a>
          </p>
        ) : null}
      </header>

      <DashboardSectionCard
        title="Selected talent"
        description="Linked to your request at submission time."
      >
        {talents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No talent linked to this inquiry.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {talents.map((talent) => (
              <li key={talent.id}>
                <Badge variant="outline" className="border-border/60">
                  <Link href={`/t/${talent.profile_code}`} target="_blank" rel="noreferrer" scroll={false}>
                    {talent.profile_code}
                    {talent.display_name ? ` · ${talent.display_name}` : ""}
                  </Link>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard title="Event details" description="What you asked the agency to staff.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="font-medium">Event</p>
            <p className="text-muted-foreground">
              {[eventTypeName, inquiry.event_date, inquiry.event_location]
                .filter(Boolean)
                .join(" · ") || "No event details provided"}
            </p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">Quantity</p>
            <p className="text-muted-foreground">
              {inquiry.quantity ? `${inquiry.quantity} requested` : "Not specified"}
            </p>
          </div>
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Request context"
        description="Search and filter context captured from the directory when available."
      >
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <p className="font-medium">What you’re looking for</p>
            <p className="text-muted-foreground">{inquiry.raw_ai_query || "No query provided"}</p>
          </div>
          {resolvedDirectoryContext ? (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/10 p-3 text-sm sm:grid-cols-2">
              <div className="space-y-1">
                <p className="font-medium">Directory query</p>
                <p className="text-muted-foreground">{resolvedDirectoryContext.q || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">Location</p>
                <p className="text-muted-foreground">
                  {resolvedDirectoryContext.locationLabel || "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">Sort</p>
                <p className="text-muted-foreground">{resolvedDirectoryContext.sort || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">Filters</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(
                    [
                      ["Talent type", resolvedDirectoryContext.filtersByKind.talent_type],
                      ["Tags", resolvedDirectoryContext.filtersByKind.tag],
                      ["Skills", resolvedDirectoryContext.filtersByKind.skill],
                      ["Industries", resolvedDirectoryContext.filtersByKind.industry],
                      ["Fit labels", resolvedDirectoryContext.filtersByKind.fit_label],
                    ] as const
                  ).every(([, arr]) => arr.length === 0) ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <>
                      {resolvedDirectoryContext.filtersByKind.talent_type.map((t) => (
                        <Badge key={t.id} variant="outline">
                          {t.label}
                        </Badge>
                      ))}
                      {resolvedDirectoryContext.filtersByKind.tag.map((t) => (
                        <Badge key={t.id} variant="outline">
                          {t.label}
                        </Badge>
                      ))}
                      {resolvedDirectoryContext.filtersByKind.skill.map((t) => (
                        <Badge key={t.id} variant="outline">
                          {t.label}
                        </Badge>
                      ))}
                      {resolvedDirectoryContext.filtersByKind.industry.map((t) => (
                        <Badge key={t.id} variant="outline">
                          {t.label}
                        </Badge>
                      ))}
                      {resolvedDirectoryContext.filtersByKind.fit_label.map((t) => (
                        <Badge key={t.id} variant="outline">
                          {t.label}
                        </Badge>
                      ))}
                    </>
                  )}
                </div>
                {resolvedDirectoryContext.unresolvedTaxonomyIds.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Some filters couldn’t be resolved (may be archived).
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No directory filter context was saved on this request.</p>
          )}
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Contact on this request"
        description="What you entered when the inquiry was submitted."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="font-medium">Name</p>
            <p className="text-muted-foreground">{inquiry.contact_name}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">Email</p>
            <p className="text-muted-foreground">{inquiry.contact_email}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">Phone</p>
            <p className="text-muted-foreground">{inquiry.contact_phone || "—"}</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">Company</p>
            <p className="text-muted-foreground">{inquiry.company || "—"}</p>
          </div>
        </div>
      </DashboardSectionCard>

      {inquiry.message ? (
        <DashboardSectionCard title="Your message" description={null}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{inquiry.message}</p>
        </DashboardSectionCard>
      ) : null}
    </div>
  );
}

