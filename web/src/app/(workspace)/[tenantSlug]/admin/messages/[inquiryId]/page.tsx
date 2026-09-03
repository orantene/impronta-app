// Phase 2.1 slice 2 — Canonical admin thread surface.
//
// Replaces the slice-1 read-only inspect with a real working
// conversation surface rendered through the cross-POV
// <ReservationThread> primitive via <AdminThreadAdapter>:
//   - Stream + composer (private agency ↔ client thread, realtime)
//   - QuickStrip pills: Lineup · Offer · Event · Files · Team
//   - Sheets carry server-loaded data; deep editor sub-features
//     (offer draft/send, lineup add/remove, coordinator reassign,
//     status machine) still link out to the classic Messages shell
//
// Mirrors the client/inquiries/[id] page shape. Server loads the data;
// the adapter is a client island. /<tenant>/admin/messages/<id> is in
// CANONICAL_ROUTE_MATCHERS so the prototype SPA yields.

import { loadOrdersForThread, orderIdsFromMessages } from "@/lib/orders/orders-for-thread";
import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import {
  AdminThreadAdapter,
  type AdminThreadInquiry,
  type AdminThreadLineupEntry,
  type AdminThreadOffer,
  type AdminThreadFile,
  type AdminThreadCoordinator,
} from "@/components/reservation-thread/adapters/AdminThreadAdapter";
import type { ParticipantThreadMessage } from "../../../_ParticipantThreadShell";
import {
  sendAdminInquiryMessage,
  markAdminInquiryThreadRead,
} from "./actions";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string; inquiryId: string }>;

function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default async function AdminInquiryThreadPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug, inquiryId } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  // ── Core inquiry row ──
  const { data: inquiryRow, error: iqErr } = await supabase
    .from("inquiries")
    .select(
      `id, status, contact_name, contact_email, contact_phone, company,
       event_date, event_location, quantity, message,
       created_at, updated_at,
       trust_level_at_submission, source_channel, current_offer_id`,
    )
    .eq("tenant_id", scope.tenantId)
    .eq("id", inquiryId)
    .maybeSingle();
  if (iqErr) logServerError("admin.thread.loadInquiry", iqErr);
  if (!inquiryRow) notFound();

  type InquiryRowT = {
    id: string;
    status: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    company: string | null;
    event_date: string | null;
    event_location: string | null;
    quantity: number | null;
    message: string | null;
    created_at: string;
    updated_at: string;
    trust_level_at_submission: "basic" | "verified" | "silver" | "gold" | null;
    source_channel: string | null;
    current_offer_id: string | null;
  };
  const iq = inquiryRow as InquiryRowT;

  const subtitleBits: string[] = [];
  if (iq.contact_name) subtitleBits.push(iq.contact_name);
  const city = (iq.event_location ?? "").split(",")[0]?.trim();
  if (city) subtitleBits.push(city);
  const d = fmtDateShort(iq.event_date);
  if (d) subtitleBits.push(d);

  const inquiry: AdminThreadInquiry = {
    id: iq.id,
    status: iq.status,
    title: iq.company ?? iq.contact_name ?? "Inquiry",
    subtitle: subtitleBits.join(" · ") || "No event details",
    eventDate: iq.event_date,
    eventLocation: iq.event_location,
    company: iq.company,
    quantity: iq.quantity,
    createdAt: iq.created_at,
    contactName: iq.contact_name,
    contactEmail: iq.contact_email,
    contactPhone: iq.contact_phone,
    brief: iq.message,
    sourceChannel: iq.source_channel,
    trustLevel: iq.trust_level_at_submission,
  };

  // ── Participants ──
  const { data: partRows } = await supabase
    .from("inquiry_participants")
    .select(
      `role, status, user_id, talent_profile_id,
       profiles:user_id ( display_name ),
       talent_profiles:talent_profile_id ( display_name, first_name, last_name, profile_code )`,
    )
    .eq("tenant_id", scope.tenantId)
    .eq("inquiry_id", inquiryId);
  type PartRowT = {
    role: string;
    status: string;
    user_id: string | null;
    talent_profile_id: string | null;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    talent_profiles:
      | { display_name: string | null; first_name: string | null; last_name: string | null; profile_code: string | null }
      | { display_name: string | null; first_name: string | null; last_name: string | null; profile_code: string | null }[]
      | null;
  };
  const partRowsT = (partRows ?? []) as unknown as PartRowT[];
  const lineup: AdminThreadLineupEntry[] = partRowsT
    .filter((p) => p.role === "talent")
    .map((p) => {
      const tpArrOrRow = p.talent_profiles;
      const tp = Array.isArray(tpArrOrRow) ? tpArrOrRow[0] : tpArrOrRow;
      const displayName =
        tp?.display_name?.trim() ||
        `${tp?.first_name ?? ""} ${tp?.last_name ?? ""}`.trim() ||
        "Talent";
      return { displayName, status: p.status, profileCode: tp?.profile_code ?? null };
    });
  const coordinators: AdminThreadCoordinator[] = partRowsT
    .filter((p) => p.role === "coordinator")
    .map((p) => {
      const profArrOrRow = p.profiles;
      const prof = Array.isArray(profArrOrRow) ? profArrOrRow[0] : profArrOrRow;
      return { displayName: prof?.display_name?.trim() || "Coordinator" };
    });

  // ── Active offer ──
  let activeOffer: AdminThreadOffer | null = null;
  if (iq.current_offer_id) {
    const { data: offerRow } = await supabase
      .from("inquiry_offers")
      .select("id, status, total_client_price, currency_code, valid_until, sent_at")
      .eq("id", iq.current_offer_id)
      .maybeSingle();
    if (offerRow) {
      const r = offerRow as {
        id: string;
        status: string;
        total_client_price: number | string;
        currency_code: string;
        valid_until: string | null;
        sent_at: string | null;
      };
      activeOffer = {
        id: r.id,
        status: r.status,
        totalCents: Math.round(Number(r.total_client_price) * 100),
        currency: r.currency_code,
        validUntil: r.valid_until,
        sentAt: r.sent_at,
      };
    }
  }

  // ── Attachments ──
  const { data: fileRows } = await supabase
    .from("inquiry_attachments")
    .select("id, filename, byte_size, created_at")
    .eq("tenant_id", scope.tenantId)
    .eq("inquiry_id", inquiryId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  const files: AdminThreadFile[] = ((fileRows ?? []) as Array<{
    id: string;
    filename: string;
    byte_size: number | string | null;
    created_at: string;
  }>).map((f) => ({
    id: f.id,
    fileName: f.filename,
    fileSize: Number(f.byte_size) || 0,
    uploadedAt: f.created_at,
  }));

  // ── Messages — private thread, full (capped 200), chronological ──
  const { data: msgRows } = await supabase
    .from("inquiry_messages")
    .select("id, sender_user_id, body, created_at, message_kind, card_payload, profiles:sender_user_id(display_name)")
    .eq("tenant_id", scope.tenantId)
    .eq("inquiry_id", inquiryId)
    .eq("thread_type", "private")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  type MsgRowT = {
    id: string;
    sender_user_id: string | null;
    body: string;
    created_at: string;
    message_kind: string | null;
    card_payload: Record<string, unknown> | null;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  };

  // Orders referenced by order cards, in one query for the thread. Without this
  // the card renders its neutral state; a card's `body` is blank by design, so
  // before this the whole message showed as an empty grey bubble.
  const msgRowsTyped = (msgRows ?? []) as unknown as MsgRowT[];
  const ordersForCards = await loadOrdersForThread(
    supabase,
    orderIdsFromMessages(msgRowsTyped),
    { tenantId: scope.tenantId },
  );
  const initialMessages: ParticipantThreadMessage[] = msgRowsTyped.map((m) => {
    const profArrOrRow = m.profiles;
    const prof = Array.isArray(profArrOrRow) ? profArrOrRow[0] : profArrOrRow;
    const isMine = viewerId != null && m.sender_user_id === viewerId;
    return {
      id: m.id,
      sender_user_id: m.sender_user_id,
      sender_name: isMine ? "You" : prof?.display_name?.trim() || "—",
      body: m.body,
      created_at: m.created_at,
      is_mine: isMine,
      message_kind: m.message_kind ?? "text",
      card_payload: m.card_payload ?? null,
      order:
        m.message_kind === "order" && typeof m.card_payload?.order_id === "string"
          ? (ordersForCards.get(m.card_payload.order_id as string) ?? null)
          : null,
    };
  });

  // Mark the private thread read on open (best-effort).
  await markAdminInquiryThreadRead(tenantSlug, inquiryId);

  // Bind server actions to (tenantSlug, inquiryId) — .bind keeps them as
  // server-action references so they can cross the client boundary.
  const sendMessage = sendAdminInquiryMessage.bind(null, tenantSlug, inquiryId);
  const markRead = markAdminInquiryThreadRead.bind(null, tenantSlug, inquiryId);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 64px)",
      minHeight: 480,
    }}>
      <AdminThreadAdapter
        tenantSlug={tenantSlug}
        inquiry={inquiry}
        lineup={lineup}
        activeOffer={activeOffer}
        files={files}
        coordinators={coordinators}
        initialMessages={initialMessages}
        sendMessage={sendMessage}
        markRead={markRead}
      />
    </div>
  );
}
