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
    .filter((p) => {
      const inq = p.inquiries as { uses_new_engine?: boolean } | null;
      return inq?.uses_new_engine;
    })
    .sort((a, b) => {
      const ca = new Date((a.inquiries as { created_at?: string })?.created_at ?? 0).getTime();
      const cb = new Date((b.inquiries as { created_at?: string })?.created_at ?? 0).getTime();
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
            title="No engine inquiries yet"
            description="When the agency adds you to a v2 inquiry, it will appear here."
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
              return (
                <li key={r.id as string}>
                  <Link
                    href={`/talent/inquiries/${inq.id}`}
                    className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-card/40 px-4 py-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{inq.contact_name ?? "Inquiry"}</span>
                      <AdminCommercialStatusBadge kind="inquiry" status={inq.status}>
                        {formatInquiryStatus(inq.status)}
                      </AdminCommercialStatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inq.event_location ?? "—"} · {inq.event_date ?? "TBD"}
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
