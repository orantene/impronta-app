import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import { formatInquiryStatus } from "@/lib/inquiries";
import { getProgressStep } from "@/lib/inquiry/inquiry-progress";
import { normalizeWorkspaceStatus } from "@/lib/inquiry/inquiry-workspace-status";
import { isWorkspaceLocked } from "@/lib/inquiry/inquiry-workspace-lock";
import { getPrimaryAction } from "@/lib/inquiry/inquiry-primary-action";
import { getWorkspacePermissions } from "@/lib/inquiry/inquiry-workspace-permissions";
import { isOfferReady } from "@/lib/inquiry/inquiry-offer-readiness";
import { resolveApprovalCompleteness } from "@/lib/inquiry/inquiry-approval-resolver";
import { getInquiryGroupShortfall } from "@/lib/inquiry/inquiry-fulfillment";
import { loadInquiryRoster } from "@/lib/inquiry/inquiry-workspace-data";
import { ADMIN_SECTION_TITLE_CLASS, CLIENT_PAGE_STACK_DETAIL } from "@/lib/dashboard-shell-classes";
import { EventLocationMap } from "@/components/inquiry/event-location-map";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentInquiryCard } from "@/app/(dashboard)/talent/inquiries/[id]/talent-inquiry-card";
import { TalentInquiryGroupPanel } from "@/app/(dashboard)/talent/inquiries/[id]/talent-inquiry-group-panel";
import { actionTalentInquirySendGroupMessage } from "@/app/(dashboard)/talent/inquiries/[id]/talent-inquiry-messaging-actions";
import type { InquiryWorkspaceApproval, InquiryWorkspaceOffer, InquiryWorkspaceRosterEntry } from "@/lib/inquiry/inquiry-workspace-types";

function warnLegacyInquiryV2Render(inquiryId: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[qa-v2-cutover] Rendering talent inquiry ${inquiryId} in V2 despite uses_new_engine=false.`);
  }
}

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

  const talentUserId = subjectUserId(identity);

  const { data: tp } = await supabase.from("talent_profiles").select("id").eq("user_id", talentUserId).maybeSingle();

  if (!tp?.id) notFound();

  const { data: part } = await supabase
    .from("inquiry_participants")
    .select(
      `
      id,
      status,
      inquiries(
        id,
        status,
        contact_name,
        event_location,
        event_date,
        message,
        raw_ai_query,
        uses_new_engine,
        version,
        current_offer_id,
        client_account_id,
        coordinator_id,
        assigned_staff_id
      )
    `,
    )
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
    raw_ai_query: string | null;
    uses_new_engine: boolean;
    version: number | null;
    current_offer_id: string | null;
    client_account_id: string | null;
    coordinator_id: string | null;
    assigned_staff_id: string | null;
  };

  if (!inq.uses_new_engine) {
    warnLegacyInquiryV2Render(id);
  }

  const offerId = inq.current_offer_id ?? null;

  const [{ data: groupMsgs }, { data: bookings }, rosterRows] = await Promise.all([
    supabase
      .from("inquiry_messages")
      .select("id, body, created_at, sender_user_id, metadata")
      .eq("inquiry_id", id)
      .eq("thread_type", "group")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("agency_bookings").select("id").eq("source_inquiry_id", id).order("created_at", { ascending: false }).limit(5),
    loadInquiryRoster(supabase, id),
  ]);
  const rawGroupMsgs = (groupMsgs ?? []) as {
    id: string;
    body: string;
    created_at: string;
    sender_user_id: string | null;
    metadata: Record<string, unknown>;
  }[];

  // Enrich messages with sender name + avatar
  const talentSenderIds = [...new Set(rawGroupMsgs.map((m) => m.sender_user_id).filter((id): id is string => Boolean(id)))];
  const talentSenderProfileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (talentSenderIds.length > 0) {
    const { data: senderProfiles } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", talentSenderIds);
    for (const p of senderProfiles ?? []) {
      talentSenderProfileMap.set(String(p.id), { display_name: (p.display_name as string | null) ?? null, avatar_url: (p.avatar_url as string | null) ?? null });
    }
  }
  const groupMessages = rawGroupMsgs.map((m) => ({
    ...m,
    sender_name: m.sender_user_id ? (talentSenderProfileMap.get(m.sender_user_id)?.display_name ?? null) : null,
    sender_avatar_url: m.sender_user_id ? (talentSenderProfileMap.get(m.sender_user_id)?.avatar_url ?? null) : null,
  }));
  const msgCount = groupMessages.length;
  const messagesHasOlder = groupMessages.length >= 200;

  let ownLines: { id: string }[] = [];
  if (offerId) {
    const { data: lineRows } = await supabase.from("inquiry_offer_line_items_talent_view").select("id").eq("offer_id", offerId);
    ownLines = lineRows ?? [];
  }

  let offerStatus: InquiryWorkspaceOffer["status"] | null = null;
  let approvalStatus: string | null = null;
  let v2Approvals: InquiryWorkspaceApproval[] = [];

  if (offerId) {
    const [{ data: off }, { data: appr }, { data: apprAll }] = await Promise.all([
      supabase.from("inquiry_offers").select("status").eq("id", offerId).maybeSingle(),
      supabase.from("inquiry_approvals").select("status").eq("participant_id", part.id as string).eq("offer_id", offerId).maybeSingle(),
      supabase.from("inquiry_approvals").select("id, status, participant_id, offer_id").eq("inquiry_id", id).eq("offer_id", offerId),
    ]);
    if (off?.status) offerStatus = off.status as InquiryWorkspaceOffer["status"];
    approvalStatus = (appr?.status as string | null) ?? null;
    v2Approvals = (apprAll ?? []) as InquiryWorkspaceApproval[];
  }

  const rosterWorkspace: InquiryWorkspaceRosterEntry[] = rosterRows.map((r) => ({
    id: r.id,
    talent_profile_id: r.talentProfileId,
    sort_order: r.sortOrder,
    profile_code: r.profileCode,
    display_name: r.displayName,
    image_url: r.imageUrl,
    tag_label: r.tagLabel,
    status: r.status,
  }));

  const approvalState = resolveApprovalCompleteness(
    v2Approvals,
    rosterWorkspace,
    offerId,
    inq.client_account_id,
  );

  const offerReady = isOfferReady({
    inquiry: {
      event_location: inq.event_location,
      event_date: inq.event_date,
      message: inq.message,
      raw_ai_query: inq.raw_ai_query,
    },
    messages: msgCount > 0 ? [{ id: "x" }] : [],
  });

  const ws = normalizeWorkspaceStatus(String(inq.status));
  const progress = getProgressStep(ws);
  const nBookings = (bookings ?? []).length;
  const firstBookingId = ((bookings ?? [])[0] as { id?: string } | undefined)?.id ?? null;

  const hasTalentLine = (ownLines ?? []).length > 0;

  // M2.3: per-group fulfillment (only relevant at approved).
  let groupsFulfilled: boolean | undefined = undefined;
  if (ws === "approved") {
    const readiness = await getInquiryGroupShortfall(supabase, String(inq.id));
    groupsFulfilled = readiness.fulfilled;
  }

  const workspaceStateInput = {
    status: ws,
    effectiveRole: "talent" as const,
    userId: talentUserId,
    hasMessages: msgCount > 0,
    hasOffer: Boolean(offerId && hasTalentLine && offerStatus),
    offerStatus,
    allApprovalsAccepted: approvalState.complete,
    pendingApprovalCount: approvalState.pending.length,
    isOfferReady: offerReady.ready,
    hasLinkedBooking: nBookings > 0,
    linkedBookingId: firstBookingId,
    isLocked: isWorkspaceLocked(ws),
    workspaceDetailPath: `/talent/inquiries/${inq.id}`,
    groupsFulfilled,
  };

  const permissions = getWorkspacePermissions(workspaceStateInput);
  const primaryAction = getPrimaryAction(workspaceStateInput);

  return (
    <div className={CLIENT_PAGE_STACK_DETAIL}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/talent/inquiries"
          className="flex items-center gap-1 hover:text-foreground hover:underline underline-offset-4"
        >
          ← Inquiries
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{inq.contact_name ?? "Inquiry"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{progress.message}</p>
          {!progress.isTerminal ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                Step {progress.step}: {progress.label}
              </span>
            </div>
          ) : null}
        </div>
        <AdminCommercialStatusBadge kind="inquiry" status={inq.status}>
          {formatInquiryStatus(inq.status)}
        </AdminCommercialStatusBadge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {primaryAction.href ? (
          <Button asChild className="rounded-full">
            <Link href={primaryAction.href}>{primaryAction.label}</Link>
          </Button>
        ) : (
          <Button type="button" disabled={primaryAction.disabled} className="rounded-full" title={primaryAction.disabledReason}>
            {primaryAction.label}
          </Button>
        )}
      </div>

      {/* Action card first — talent sees their required action before anything else */}
      <div className="mt-6">
        <TalentInquiryCard
          inquiryId={inq.id}
          inquiryVersion={Number(inq.version ?? 1)}
          offerId={offerId}
          participantId={part.id as string}
          participationStatus={String(part.status)}
          approvalStatus={approvalStatus}
          contactName={inq.contact_name}
          eventLocation={inq.event_location}
          eventDate={inq.event_date}
          messagePreview={inq.message}
          ownLineCount={(ownLines ?? []).length}
          canApprove={permissions.canApprove}
        />
      </div>

      <div className="mt-6 space-y-6">
        <DashboardSectionCard
          title="Event details"
          description="What the client asked for. Commercial totals and other talent's fees are not shown."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Location</dt>
              {inq.event_location?.trim() ? (
                <dd className="mt-1.5">
                  <EventLocationMap location={inq.event_location} />
                </dd>
              ) : (
                <dd className="mt-0.5 text-muted-foreground">Not provided</dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Event date</dt>
              <dd className="mt-0.5">{inq.event_date?.trim() || <span className="text-muted-foreground">Not provided</span>}</dd>
            </div>
            {inq.message?.trim() ? (
              <div>
                <dt className="text-xs text-muted-foreground">Client brief</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{inq.message.trim()}</dd>
              </div>
            ) : null}
          </dl>
        </DashboardSectionCard>

        <TalentInquiryGroupPanel
          inquiryId={inq.id}
          initialMessages={groupMessages}
          messagesHasOlder={messagesHasOlder}
          sendAction={actionTalentInquirySendGroupMessage}
          allowCompose={permissions.canSendMessage}
        />
      </div>

      <Button asChild variant="ghost" className="mt-6 w-full sm:w-auto" size="sm">
        <Link href="/talent/inquiries">← Back to inquiries</Link>
      </Button>
    </div>
  );
}
