import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import { formatInquiryStatus } from "@/lib/inquiries";
import { CLIENT_PAGE_STACK_WIDE } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

export default async function TalentInquiriesPage() {
  const identity = await resolveDashboardIdentity();
  if (!identity || identity.subjectRole !== "talent") notFound();

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return (
      <div className={CLIENT_PAGE_STACK_WIDE}>
        <p className="text-sm text-muted-foreground">Supabase not configured.</p>
      </div>
    );
  }

  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", subjectUserId(identity))
    .maybeSingle();

  if (!tp?.id) {
    return (
      <div className={CLIENT_PAGE_STACK_WIDE}>
        <DashboardEmptyState
          title="No talent profile"
          description="Complete onboarding to receive inquiry invitations."
        />
      </div>
    );
  }

  const { data: parts } = await supabase
    .from("inquiry_participants")
    .select(
      `
      id,
      status,
      inquiry_id,
      inquiries (
        id,
        status,
        contact_name,
        event_location,
        event_date,
        created_at,
        uses_new_engine
      )
    `,
    )
    .eq("talent_profile_id", tp.id)
    .eq("role", "talent");

  const rows = (parts ?? [])
    .filter((p) => Boolean(Array.isArray(p.inquiries) ? p.inquiries[0] : p.inquiries))
    .sort((a, b) => {
      const inqA = (Array.isArray(a.inquiries) ? a.inquiries[0] : a.inquiries) as { created_at?: string } | null;
      const inqB = (Array.isArray(b.inquiries) ? b.inquiries[0] : b.inquiries) as { created_at?: string } | null;
      const ca = new Date(inqA?.created_at ?? 0).getTime();
      const cb = new Date(inqB?.created_at ?? 0).getTime();
      return cb - ca;
    });

  return (
    <div className={CLIENT_PAGE_STACK_WIDE}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Inquiries</h1>
      <p className="mt-1 text-sm text-muted-foreground">Jobs you’ve been invited to coordinate on.</p>

      <DashboardSectionCard title="Your inquiries" description={null} className="mt-6">
        {rows.length === 0 ? (
          <DashboardEmptyState
            icon={<FileText className="size-6" />}
            title="No inquiries yet"
            description="When the agency adds you to an inquiry, it will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const raw = r.inquiries;
              const inq = (Array.isArray(raw) ? raw[0] : raw) as {
                id: string;
                status: string;
                contact_name: string | null;
                event_location: string | null;
                event_date: string | null;
                created_at: string;
              };
              const needsAction = inq.status === "offer_pending" && r.status === "active";
              const isBooked = inq.status === "booked";
              return (
                <li key={r.id as string}>
                  <Link
                    href={`/talent/inquiries/${inq.id}`}
                    className={cn(
                      "flex flex-col gap-2 rounded-2xl border px-4 py-3 transition-colors",
                      needsAction
                        ? "border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/[0.04] hover:border-[var(--impronta-gold)]/60"
                        : "border-border/50 bg-card/40 hover:border-border",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{inq.contact_name ?? "Inquiry"}</span>
                      <div className="flex items-center gap-2">
                        {needsAction ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--impronta-gold)]">
                            <span className="size-1.5 animate-pulse rounded-full bg-[var(--impronta-gold)]" />
                            Response needed
                          </span>
                        ) : null}
                        {isBooked ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--impronta-gold)]/30 bg-[var(--impronta-gold)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--impronta-gold)]">
                            Booked
                          </span>
                        ) : null}
                        <AdminCommercialStatusBadge kind="inquiry" status={inq.status}>
                          {formatInquiryStatus(inq.status)}
                        </AdminCommercialStatusBadge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[inq.event_location, inq.event_date].filter(Boolean).join(" · ") || "No event details yet"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DashboardSectionCard>
    </div>
  );
}
