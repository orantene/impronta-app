import { notFound, redirect } from "next/navigation";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import { getProgressStep } from "@/lib/inquiry/inquiry-progress";
import { normalizeWorkspaceStatus } from "@/lib/inquiry/inquiry-workspace-status";
import { isWorkspaceLocked } from "@/lib/inquiry/inquiry-workspace-lock";
import { getPrimaryAction } from "@/lib/inquiry/inquiry-primary-action";
import { getWorkspacePermissions } from "@/lib/inquiry/inquiry-workspace-permissions";
import { isOfferReady } from "@/lib/inquiry/inquiry-offer-readiness";
import { resolveApprovalCompleteness } from "@/lib/inquiry/inquiry-approval-resolver";
import { loadInquiryRoster } from "@/lib/inquiry/inquiry-workspace-data";
import {
  ClientInquiryWorkspace,
  type ClientInquiryTab,
} from "@/app/(dashboard)/client/inquiries/[id]/client-inquiry-workspace";
import { actionClientInquirySendMessage } from "@/app/(dashboard)/client/inquiries/[id]/client-inquiry-messaging-actions";
import { actionClientAcceptOffer, actionClientRejectOffer } from "@/app/(dashboard)/client/inquiries/[id]/client-inquiry-approval-actions";
import type { InquiryWorkspaceApproval, InquiryWorkspaceOffer, InquiryWorkspaceRosterEntry } from "@/lib/inquiry/inquiry-workspace-types";

const CLIENT_TABS = ["messages", "offer", "approvals"] as const;

function isClientTab(raw: string | null | undefined): raw is ClientInquiryTab {
  return Boolean(raw && (CLIENT_TABS as readonly string[]).includes(raw));
}

function warnLegacyInquiryV2Render(inquiryId: string, scope: "client" | "talent" | "admin") {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[qa-v2-cutover] Rendering ${scope} inquiry ${inquiryId} in V2 despite uses_new_engine=false.`);
  }
}

export default async function ClientInquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabRaw } = await searchParams;

  if (tabRaw === "status") {
    redirect(`/client/inquiries/${id}?tab=approvals`);
  }
  if (tabRaw != null && tabRaw !== "" && !isClientTab(tabRaw)) {
    redirect(`/client/inquiries/${id}`);
  }
  const activeTab: ClientInquiryTab = isClientTab(tabRaw) ? tabRaw : "messages";

  const identity = await resolveDashboardIdentity();
  if (!identity || identity.subjectRole !== "client") notFound();

  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const clientUserId = subjectUserId(identity);

  const { data: inq, error } = await supabase
    .from("inquiries")
    .select(
      `
      id,
      status,
      uses_new_engine,
      client_user_id,
      client_account_id,
      contact_name,
      current_offer_id,
      version,
      event_location,
      event_date,
      message,
      raw_ai_query,
      coordinator_id,
      assigned_staff_id,
      next_action_by,
      booked_at
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !inq) notFound();
  if (inq.client_user_id !== clientUserId) notFound();

  if (!inq.uses_new_engine) {
    warnLegacyInquiryV2Render(id, "client");
  }

  const cid = inq.current_offer_id as string | null;

  const [{ data: msgs }, { data: bookings }, rosterRows] = await Promise.all([
    supabase
      .from("inquiry_messages")
      .select("id, body, created_at, sender_user_id, metadata")
      .eq("inquiry_id", id)
      .eq("thread_type", "private")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("agency_bookings").select("id").eq("source_inquiry_id", id).order("created_at", { ascending: false }).limit(5),
    loadInquiryRoster(supabase, id),
  ]);

  // Enrich messages with sender name + avatar
  const rawMsgs = msgs ?? [];
  const clientSenderIds = [...new Set(rawMsgs.map((m) => m.sender_user_id).filter((id): id is string => Boolean(id)))];
  const clientSenderProfileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (clientSenderIds.length > 0) {
    const { data: senderProfiles } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", clientSenderIds);
    for (const p of senderProfiles ?? []) {
      clientSenderProfileMap.set(String(p.id), { display_name: (p.display_name as string | null) ?? null, avatar_url: (p.avatar_url as string | null) ?? null });
    }
  }
  const enrichedMsgs = rawMsgs.map((m) => ({
    ...m,
    sender_name: m.sender_user_id ? (clientSenderProfileMap.get(m.sender_user_id)?.display_name ?? null) : null,
    sender_avatar_url: m.sender_user_id ? (clientSenderProfileMap.get(m.sender_user_id)?.avatar_url ?? null) : null,
  }));

  let offerPayload: null | {
    status: string;
    total_client_price: number;
    currency_code: string;
    lines: { label: string | null; units: number; unit_price: number; total_price: number }[];
  } = null;

  let v2Approvals: InquiryWorkspaceApproval[] = [];

  if (cid) {
    const [{ data: offer }, { data: lines }, { data: approvals }] = await Promise.all([
      supabase
        .from("inquiry_offers")
        .select("status, total_client_price, currency_code")
        .eq("id", cid)
        .maybeSingle(),
      supabase.from("inquiry_offer_line_items").select("label, units, unit_price, total_price").eq("offer_id", cid).order("sort_order", { ascending: true }),
      supabase.from("inquiry_approvals").select("id, status, participant_id, offer_id").eq("inquiry_id", id),
    ]);
    if (offer) {
      offerPayload = {
        status: String(offer.status),
        total_client_price: Number(offer.total_client_price),
        currency_code: String(offer.currency_code ?? "MXN"),
        lines: ((lines ?? []) as Record<string, unknown>[]).map((row) => ({
          label: (row.label as string | null) ?? null,
          units: Number(row.units) || 0,
          unit_price: Number(row.unit_price) || 0,
          total_price: Number(row.total_price) || 0,
        })),
      };
    }
    v2Approvals = ((approvals ?? []) as InquiryWorkspaceApproval[]).filter((a) => a.offer_id === cid);
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

  const ws = normalizeWorkspaceStatus(String(inq.status));
  const progress = getProgressStep(ws);

  const approvalState = resolveApprovalCompleteness(
    v2Approvals,
    rosterWorkspace,
    cid,
    (inq.client_account_id as string | null) ?? null,
  );

  const offerReady = isOfferReady({
    inquiry: {
      event_location: (inq.event_location as string | null) ?? null,
      event_date: (inq.event_date as string | null) ?? null,
      message: (inq.message as string | null) ?? null,
      raw_ai_query: (inq.raw_ai_query as string | null) ?? null,
    },
    messages: enrichedMsgs.map((m) => ({ id: m.id as string })),
  });

  const nBookings = (bookings ?? []).length;
  const firstBookingId = ((bookings ?? [])[0] as { id?: string } | undefined)?.id ?? null;

  const workspaceStateInput = {
    status: ws,
    effectiveRole: "client" as const,
    userId: clientUserId,
    hasMessages: enrichedMsgs.length > 0,
    hasOffer: Boolean(offerPayload),
    offerStatus: (offerPayload?.status as InquiryWorkspaceOffer["status"] | null) ?? null,
    allApprovalsAccepted: approvalState.complete,
    pendingApprovalCount: approvalState.pending.length,
    isOfferReady: offerReady.ready,
    hasLinkedBooking: nBookings > 0,
    linkedBookingId: firstBookingId,
    isLocked: isWorkspaceLocked(ws),
    workspaceDetailPath: `/client/inquiries/${inq.id as string}`,
  };

  const permissions = getWorkspacePermissions(workspaceStateInput);
  const primaryAction = getPrimaryAction(workspaceStateInput);

  return (
    <ClientInquiryWorkspace
      inquiryId={inq.id as string}
      tabBasePath={`/client/inquiries/${inq.id}`}
      activeTab={activeTab}
      contactName={(inq.contact_name as string | null) ?? null}
      statusLabel={String(inq.status)}
      progress={progress}
      permissions={permissions}
      primaryAction={primaryAction}
      messages={enrichedMsgs}
      messagesHasOlder={enrichedMsgs.length >= 200}
      sendMessageAction={actionClientInquirySendMessage}
      offer={offerPayload}
      offerId={cid}
      inquiryVersion={Number(inq.version) || 0}
      eventLocation={(inq.event_location as string | null) ?? null}
      eventDate={(inq.event_date as string | null) ?? null}
      acceptOfferAction={actionClientAcceptOffer}
      rejectOfferAction={actionClientRejectOffer}
      approvals={v2Approvals}
      roster={rosterWorkspace}
    />
  );
}
