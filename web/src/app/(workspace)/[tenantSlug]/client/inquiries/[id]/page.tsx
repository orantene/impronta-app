/**
 * Client inquiry-detail page.
 *
 * Phase A PR 4 of the 2026 execution plan. Previously this was a bare
 * message stream + composer (307 LOC of essentially nothing — the
 * audit doc called it out as the highest-business-value unlock). This
 * version hydrates a full reservation view: lineup, offer, event, files
 * + an Approve / Decline / Counter action row when an offer is awaiting
 * the client's decision.
 *
 * Server load surface stays here (RSC). The interactive thread + sheets
 * are rendered by `<ClientThreadAdapter>` — a client component composing
 * the cross-pov `<ReservationThread>` primitive.
 */

import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../../_data-bridge";
import { logServerError } from "@/lib/server/safe-error";
import { ClientThreadAdapter, type ClientThreadFile, type ClientThreadLineupEntry, type ClientThreadOffer, type ClientThreadOfferLine } from "@/components/reservation-thread/adapters/ClientThreadAdapter";
import {
  markClientInquiryThreadRead,
  sendClientInquiryMessage,
  clientApproveOfferAction,
  clientDeclineOfferAction,
  clientCounterOfferAction,
} from "./actions";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string; id: string }>;
type SearchParams = Promise<{ ok?: string; err?: string }>;

type MsgRow = {
  id: string;
  sender_user_id: string | null;
  body: string;
  created_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

type ParticipantRow = {
  user_id: string;
  role: string;
  status: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  talent_profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

type OfferRow = {
  id: string;
  status: ClientThreadOffer["status"];
  total_client_price: number | string;
  currency_code: string;
  valid_until: string | null;
  sent_at: string | null;
  notes: string | null;
};

type LineItemRow = {
  offer_id: string;
  label: string | null;
  units: number | string;
  unit_price: number | string;
  total_price: number | string;
  talent_profile_id: string | null;
  talent_profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

type AttachmentRow = {
  id: string;
  filename: string;
  byte_size: number | string | null;
  created_at: string;
};

export default async function ClientInquiryThreadPage({
  params,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug, id: inquiryId } = await params;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/${tenantSlug}/client/inquiries/${inquiryId}`);
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const client = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!client) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  // ── Core inquiry row ──
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id, status, version, event_date, event_location, company, quantity, created_at")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", session.user.id)
    .maybeSingle();
  if (!inquiry) notFound();

  // ── Messages (private thread — agency ↔ client) ──
  const { data: messagesData, error: messagesError } = await supabase
    .from("inquiry_messages")
    .select("id, sender_user_id, body, created_at, profiles:sender_user_id(display_name)")
    .eq("inquiry_id", inquiryId)
    .eq("thread_type", "private")
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (messagesError) {
    logServerError("client.thread.loadMessages", messagesError);
  }
  const messages = ((messagesData ?? []) as MsgRow[]).map((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const isMine = m.sender_user_id === session.user!.id;
    return {
      id: m.id,
      sender_user_id: m.sender_user_id,
      body: m.body,
      created_at: m.created_at,
      is_mine: isMine,
      sender_name: isMine
        ? "You"
        : profile?.display_name?.trim() || "Coordinator",
    };
  });

  // ── Lineup (talent on this inquiry) — public info only, no contacts ──
  // We DO show names + public role + whether they accepted.
  const { data: participantData } = await supabase
    .from("inquiry_participants")
    .select(`
      user_id,
      role,
      status,
      profiles:user_id ( display_name ),
      talent_profiles:user_id ( display_name )
    `)
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("role", "talent")
    .in("status", ["invited", "accepted", "hold"]);

  const lineup: ClientThreadLineupEntry[] = ((participantData ?? []) as ParticipantRow[]).map((p) => {
    const tp = Array.isArray(p.talent_profiles) ? p.talent_profiles[0] : p.talent_profiles;
    const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    const name = tp?.display_name?.trim() || prof?.display_name?.trim() || "Talent";
    return {
      displayName: name,
      publicRole: null, // Could derive from taxonomy_terms in a future PR.
      isConfirmed: p.status === "accepted",
    };
  });

  // ── Active offer (status in sent/accepted) ──
  const { data: offerRow } = await supabase
    .from("inquiry_offers")
    .select("id, status, total_client_price, currency_code, valid_until, sent_at, notes")
    .eq("inquiry_id", inquiryId)
    .in("status", ["sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OfferRow>();

  let activeOffer: ClientThreadOffer | null = null;
  if (offerRow) {
    const { data: lineItemsData } = await supabase
      .from("inquiry_offer_line_items")
      .select(`
        offer_id, label, units, unit_price, total_price, talent_profile_id,
        talent_profiles:talent_profile_id ( display_name )
      `)
      .eq("offer_id", offerRow.id);

    const lineItems: ClientThreadOfferLine[] = ((lineItemsData ?? []) as LineItemRow[]).map((li) => {
      const tp = Array.isArray(li.talent_profiles) ? li.talent_profiles[0] : li.talent_profiles;
      return {
        label: li.label ?? "",
        units: Number(li.units) || 1,
        unitPrice: Number(li.unit_price) || 0,
        totalPrice: Number(li.total_price) || 0,
        talentName: tp?.display_name ?? null,
      };
    });

    activeOffer = {
      id: offerRow.id,
      status: offerRow.status,
      totalClientPrice: Number(offerRow.total_client_price) || 0,
      currencyCode: offerRow.currency_code,
      validUntil: offerRow.valid_until,
      sentAt: offerRow.sent_at,
      notes: offerRow.notes,
      lineItems,
    };
  }

  // ── Files / attachments ──
  const { data: attachmentRows } = await supabase
    .from("inquiry_attachments")
    .select("id, filename, byte_size, created_at")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("visibility", "shared")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const files: ClientThreadFile[] = ((attachmentRows ?? []) as AttachmentRow[]).map((f) => ({
    id: f.id,
    fileName: f.filename,
    fileSize: Number(f.byte_size) || 0,
    uploadedAt: f.created_at,
  }));

  // ── Mark thread read for this user ──
  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (readErr) {
    logServerError("client.thread.markRead.page", readErr);
  }

  // ── Action bindings (tenantSlug + inquiryId curried at the page layer) ──
  //
  // Use `.bind(null, …)` rather than arrow-wrapping. React Server
  // Components only let you pass a function to a Client Component if
  // it's a server-action reference (or a bind of one). Plain arrow
  // closures over server actions are NOT server actions themselves
  // and throw "Functions cannot be passed directly to Client
  // Components" at render time.
  const sendMessageForThread = sendClientInquiryMessage.bind(null, tenantSlug, inquiryId);
  const markReadForThread = markClientInquiryThreadRead.bind(null, tenantSlug, inquiryId);
  const approveOfferForThread = clientApproveOfferAction.bind(null, tenantSlug, inquiryId);
  const declineOfferForThread = clientDeclineOfferAction.bind(null, tenantSlug, inquiryId);
  const counterOfferForThread = clientCounterOfferAction.bind(null, tenantSlug, inquiryId);

  // ── Project title — company > agency name ──
  const title = (inquiry.company as string | null) ?? client.agencyName;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 64px)",
      minHeight: 480,
    }}>
      <ClientThreadAdapter
        tenantSlug={tenantSlug}
        tenantName={client.agencyName}
        inquiry={{
          id: inquiry.id as string,
          status: inquiry.status as string,
          title,
          version: Number((inquiry.version as number | string | null) ?? 1) || 1,
          eventDate: (inquiry.event_date as string | null) ?? null,
          eventLocation: (inquiry.event_location as string | null) ?? null,
          company: (inquiry.company as string | null) ?? null,
          quantity: (inquiry.quantity as number | null) ?? null,
          createdAt: (inquiry.created_at as string) ?? "",
        }}
        lineup={lineup}
        activeOffer={activeOffer}
        files={files}
        initialMessages={messages}
        sendMessage={sendMessageForThread}
        markRead={markReadForThread}
        approveOffer={approveOfferForThread}
        declineOffer={declineOfferForThread}
        counterOffer={counterOfferForThread}
      />
    </div>
  );
}
