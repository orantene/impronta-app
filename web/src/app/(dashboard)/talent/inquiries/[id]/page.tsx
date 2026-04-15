import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import { formatInquiryStatus } from "@/lib/inquiries";
import { CLIENT_PAGE_STACK_DETAIL } from "@/lib/dashboard-shell-classes";

export default async function TalentInquiryWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = await resolveDashboardIdentity();
  if (!identity || identity.subjectRole !== "talent") notFound();

  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", subjectUserId(identity))
    .maybeSingle();

  if (!tp?.id) notFound();

  const { data: part } = await supabase
    .from("inquiry_participants")
    .select("id, status, inquiries(id, status, contact_name, event_location, event_date, message, uses_new_engine)")
    .eq("inquiry_id", id)
    .eq("talent_profile_id", tp.id)
    .eq("role", "talent")
    .maybeSingle();

  if (!part) notFound();

  const rawInq = part.inquiries;
  const inq = (Array.isArray(rawInq) ? rawInq[0] : rawInq) as {
    id: string;
    status: string;
    contact_name: string | null;
    event_location: string | null;
    event_date: string | null;
    message: string | null;
    uses_new_engine: boolean;
  };

  if (!inq.uses_new_engine) {
    return (
      <div className={CLIENT_PAGE_STACK_DETAIL}>
        <p className="text-sm text-muted-foreground">This inquiry uses the legacy workflow.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/talent/inquiries">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={CLIENT_PAGE_STACK_DETAIL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{inq.contact_name ?? "Inquiry"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {inq.event_location ?? "—"} · {inq.event_date ?? "TBD"}
          </p>
        </div>
        <AdminCommercialStatusBadge kind="inquiry" status={inq.status}>
          {formatInquiryStatus(inq.status)}
        </AdminCommercialStatusBadge>
      </div>

      <DashboardSectionCard title="Invitation" description={`Your participation: ${part.status}`} className="mt-6">
        <p className="text-sm text-muted-foreground">
          {inq.message?.trim() || "No additional message."}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Messages, offers, and approvals for the v2 engine will appear here as they are wired to the workspace shell.
        </p>
      </DashboardSectionCard>

      <Button asChild variant="outline" className="mt-6">
        <Link href="/talent/inquiries">Back to inquiries</Link>
      </Button>
    </div>
  );
}
